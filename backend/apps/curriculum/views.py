import json
import logging
import re
from collections import defaultdict

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.integrations.cot_prompt_builder import CoTPromptBuilder
from apps.integrations.llm_service import LLMService
from apps.integrations.models import (
    Assessment,
    AssessmentItem,
    Course,
    CourseFile,
    CourseLoad,
    InstitutionCustomization,
    Module,
    ParentChunk,
    StudentData,
    Syllabus,
    UserRole,
)
from apps.integrations.rag_service import (
    course_semantic_search_with_summary,
    semantic_search,
    semantic_search_with_summary,
)
from apps.integrations.trial import trial_generation_gate

from .docx_builders import (
    add_framework_mapping,
    add_ilo_at_matrix,
    add_ilo_framework_matrix,
    add_table_of_specifications,
    apply_page_header_footer,
    build_tos_docx,
    has_tos,
    make_landscape,
)
from .metrics import compute_metrics
from .serializers import CurriculumMetricsSerializer, GenerateModuleSerializer, GenerateSyllabusSerializer

logger = logging.getLogger(__name__)

def _is_faculty_user(request) -> bool:
    return bool(request.user and getattr(request.user, 'role', None) == UserRole.FACULTY)


def _faculty_only_response():
    return Response(
        {
            'success': False,
            'detail': 'Not permitted. This endpoint is for faculty users only.',
        },
        status=status.HTTP_403_FORBIDDEN,
    )


def _get_assigned_course_or_403(request, course_id):
    institution_id = getattr(request.user, 'institution_id', None)
    if not institution_id:
        return None, Response(
            {'success': False, 'detail': 'Your account is not linked to an institution.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    assignment = CourseLoad.objects.select_related('course').filter(
        faculty=request.user,
        course_id=course_id,
        course__institution_id=institution_id,
    ).first()
    if not assignment:
        return None, Response(
            {'success': False, 'detail': 'Course not found in your teaching load.'},
            status=status.HTTP_404_NOT_FOUND,
        )
    return assignment.course, None


def _load_course_rag_chunks(course, limit=3):
    """Return parent chunks from faculty-uploaded course files as RAG context."""
    parent_texts = list(
        ParentChunk.objects
        .filter(records__course=course, records__rag_status='COMPLETED')
        .order_by('-records__records_id')
        .values_list('parent_content', flat=True)[:limit]
    )
    return [
        {
            "text": text,
            "document_title": "Uploaded course document",
            "page_number": None,
            "score": 0.5,
        }
        for text in parent_texts
    ]


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def faculty_courses(request):
    """Return the courses currently handled by the authenticated faculty user."""
    if not _is_faculty_user(request):
        return _faculty_only_response()
    if not request.user.institution_id:
        return Response(
            {'success': False, 'detail': 'Your account is not linked to an institution.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    assignments = CourseLoad.objects.select_related('course').filter(
        faculty=request.user,
        course__institution_id=request.user.institution_id,
    )
    courses = []
    seen_course_ids = set()
    for assignment in assignments:
        course = assignment.course
        if course.course_id in seen_course_ids:
            continue
        seen_course_ids.add(course.course_id)
        # Pull title/code overrides from the latest saved syllabus_content
        latest_syllabus = (
            Syllabus.objects.filter(course=course)
            .order_by('-generated_at', '-syllabus_id')
            .first()
        )
        sc = latest_syllabus.syllabus_content if latest_syllabus else None
        courses.append(
            {
                'course_id': str(course.course_id),
                'course_code': (sc.get('course_code') or course.course_code) if sc else course.course_code,
                'course_title': (sc.get('course_title') or course.course_title) if sc else course.course_title,
                'description': course.description,
                'syllabus_count': Syllabus.objects.filter(course=course).count(),
                'assessment_count': Assessment.objects.filter(course=course).count(),
            }
        )

    return Response({'success': True, 'total': len(courses), 'courses': courses}, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def faculty_course_workspace(request, course_id):
    """Return per-course data used by the faculty workspace center panel."""
    if not _is_faculty_user(request):
        return _faculty_only_response()

    course, error_response = _get_assigned_course_or_403(request, course_id)
    if error_response:
        return error_response

    # Latest draft syllabus (with its saved JSON content)
    latest_syllabus = (
        Syllabus.objects.filter(course=course)
        .order_by('-generated_at', '-syllabus_id')
        .first()
    )

    syllabi = (
        Syllabus.objects.filter(course=course)
        .order_by('-generated_at', '-syllabus_id')
        .values('syllabus_id', 'term', 'version', 'status', 'generated_at')
    )
    modules = (
        Module.objects.filter(syllabus__course=course)
        .order_by('week_number', '-generated_at')
        .values('module_id', 'module_title', 'week_number', 'status', 'generated_at', 'module_content')
    )
    assessments = (
        Assessment.objects.filter(course=course)
        .order_by('-generated_at', '-assessment_id')
        .values('assessment_id', 'title', 'assessment_type', 'term', 'status', 'generated_at')
    )
    customization = InstitutionCustomization.objects.filter(
        institution_id=request.user.institution_id,
    ).first()
    assigned_sections = list(
        CourseLoad.objects.filter(faculty=request.user, course=course)
        .filter(section__isnull=False)
        .select_related('section')
        .values_list('section__code', flat=True)
    )
    year_levels = (
        [
            {'value': year.display_name, 'label': year.display_name}
            for year in course.program.year_levels.all()
        ]
        if course.program_id else []
    )

    return Response(
        {
            'success': True,
            'course': {
                'course_id': str(course.course_id),
                'course_code': course.course_code,
                'course_title': course.course_title,
                'description': course.description,
                'course_category': course.category,
                'credit_hours': str(course.units) if course.units is not None else '',
                'institution_name': course.institution.name if course.institution_id else '',
                'college_name': (
                    course.program.college.name
                    if course.program_id and course.program.college_id else ''
                ),
                'program_name': course.program.name if course.program_id else '',
                'year_level': course.year_level.display_name if course.year_level_id else '',
                'year_levels': year_levels,
                'assigned_sections': assigned_sections,
                'instructor_name': request.user.full_name,
                'instructor_email': request.user.email,
            },
            'customization': {
                'header_image_url': customization.header_image_url,
                'footer_image_url': customization.footer_image_url,
                'header_text': customization.header_text,
                'footer_text': customization.footer_text,
                'syllabus_template_name': customization.syllabus_template_name,
                'syllabus_sections': customization.syllabus_sections,
                'field_labels': customization.field_labels,
            } if customization else {'syllabus_sections': [], 'field_labels': {}},
            'syllabus': {
                'syllabus_id': str(latest_syllabus.syllabus_id) if latest_syllabus else None,
                'syllabus_content': latest_syllabus.syllabus_content if latest_syllabus else None,
            } if latest_syllabus else None,
            'syllabi': list(syllabi),
            'modules': list(modules),
            'assessments': list(assessments),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def course_students(request, course_id):
    """Return the course roster: blocks members of the course sections plus scanned students."""
    from apps.grading.services.analytics import course_roster

    if not _is_faculty_user(request):
        return _faculty_only_response()

    course, error_response = _get_assigned_course_or_403(request, course_id)
    if error_response:
        return error_response

    sections = CourseLoad.objects.filter(course_id=course_id).values_list('section__code', flat=True)
    roster = course_roster(course_id, extra_sections=sections)
    accounts = {
        sd.sr_code: sd
        for sd in StudentData.objects.filter(sr_code__in=[s['student_id'] for s in roster])
    }

    students = []
    for s in roster:
        sd = accounts.get(s['student_id'])
        students.append({
            **s,
            'sr_code': s['student_id'],
            'user_id': str(sd.user_id) if sd else None,
            'courses_enrolled': sd.courses_enrolled if sd else [],
        })

    return Response(
        {"success": True, "students": students},
        status=status.HTTP_200_OK,
    )


@api_view(["PUT"])
@permission_classes([IsAuthenticated])
def save_syllabus_content(request, course_id):
    """
    Create-or-update the latest draft syllabus for a course with the
    faculty-edited JSON content.

    Endpoint: PUT /api/curriculum/syllabus-content/<course_id>/

    Body (JSON): { "syllabus_content": { ...all syllabus section fields... } }
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    course, error_response = _get_assigned_course_or_403(request, course_id)
    if error_response:
        return error_response

    content = request.data.get('syllabus_content')
    if content is None:
        return Response(
            {'success': False, 'detail': 'syllabus_content is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Get or create a Draft syllabus (safe against MultipleObjectsReturned)
    syllabus = Syllabus.objects.filter(course=course, status='Draft').order_by('-syllabus_id').first()
    created = False
    if not syllabus:
        syllabus = Syllabus.objects.create(course=course, status='Draft', term='', version=1)
        created = True
    syllabus.syllabus_content = content
    syllabus.save(update_fields=['syllabus_content'])

    return Response(
        {
            'success': True,
            'syllabus_id': str(syllabus.syllabus_id),
            'created': created,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def generate_syllabus(request):
    """
    Generate a complete OBE-aligned course syllabus using RAG + CoT + LLM.

    Endpoint: POST /api/curriculum/generate-syllabus/

    Body (JSON):
    {
        "course_name": "Data Structures and Algorithms",
        "course_code": "CS 201",          // optional
        "num_weeks": 18,                  // optional, default 16
        "provider": "groq",               // optional: groq|openrouter
        "top_k": 5,                       // optional, RAG chunks to retrieve
        "search_query": "...",            // optional override for semantic search
        "extra_instructions": "..."       // optional faculty notes
    }

    Pipeline:
        1. Semantic search over the knowledge base with the course topic as query.
        2. CoT prompt builder assembles system + user prompts with retrieved context.
        3. LLMService sends the prompt to the configured provider.
        4. Generated syllabus text is returned in the response.
    """
    serializer = GenerateSyllabusSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {"success": False, "errors": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )
    trial_response = trial_generation_gate(request.user, syllabus_generation=True)
    if trial_response:
        return trial_response

    data = serializer.validated_data
    course_id = data.get("course_id")
    course_name = data["course_name"]
    course_code = data.get("course_code", "")
    num_weeks = data.get("num_weeks", 16)
    top_k = data.get("top_k", 5)
    provider = data.get("provider") or None
    extra_instructions = data.get("extra_instructions", "")
    search_query = data.get("search_query") or (
        f"{course_name} syllabus course outline curriculum learning outcomes OBE"
    )

    try:
        # Step 1 — Global semantic search with progressive summary
        rag_result = semantic_search_with_summary(
            search_query, institution_id=request.user.institution_id, top_k=top_k,
        )
        global_chunks = rag_result["chunks"]
        global_summary = rag_result["context_summary"]
        course_chunks = []
        if course_id:
            course, error_response = _get_assigned_course_or_403(request, course_id)
            if error_response:
                return error_response
            # If course_id is present, source canonical title/code and include faculty uploads.
            course_name = course.course_title
            course_code = course.course_code
            course_chunks = _load_course_rag_chunks(course, limit=3)
        chunks = global_chunks + course_chunks
        logger.info(
            "Syllabus generation for %r: global=%d (abstained=%s) course=%d total=%d provider=%r",
            course_name,
            len(global_chunks),
            rag_result["abstained"],
            len(course_chunks),
            len(chunks),
            provider,
        )

        # Step 2 — Build CoT prompt (pass summary for token-efficient context)
        system_prompt, user_prompt = CoTPromptBuilder.build_syllabus_prompt(
            course_name=course_name,
            course_code=course_code,
            num_weeks=num_weeks,
            context_chunks=chunks,
            extra_instructions=extra_instructions,
            context_summary=global_summary,
        )

        # Step 3 — Call LLM
        llm = LLMService()
        generated_text, provider_used = llm.generate_response_with_fallback(
            messages=[{"role": "user", "content": user_prompt}],
            preferred_provider=provider,
            system=system_prompt,
            max_tokens=2048,
            return_provider=True,
        )

        return Response(
            {
                "success": True,
                "course_name": course_name,
                "course_code": course_code,
                "num_weeks": num_weeks,
                "provider_used": provider_used,
                "rag_chunks_used": len(chunks),
                "generated_syllabus": generated_text,
            },
            status=status.HTTP_200_OK,
        )

    except Exception as exc:
        logger.exception("Error generating syllabus for %r", course_name)
        return Response(
            {"success": False, "error": str(exc)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def generate_module(request):
    """
    Generate a JSON-structured teaching module using RAG + CoT + LLM.

    Pipeline:
      1. Validate input and resolve the course.
      2. Semantic search over global knowledge base.
      3. Semantic search over course-specific uploads (filtered by selected_doc_ids).
      4. Build JSON CoT prompt with combined context.
      5. Call LLM with auto-fallback across providers.
      6. Parse the JSON response (strip any markdown fences).
      7. Save result to Module.module_content and return it.

    Returns:
      { success, module_id, module_content: { module_number, module_title,
        introduction, learning_objectives, subtopics, short_activity } }
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()
    trial_response = trial_generation_gate(request.user, syllabus_generation=False)
    if trial_response:
        return trial_response

    serializer = GenerateModuleSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {"success": False, "errors": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    data = serializer.validated_data
    course_id = data["course_id"]
    course_name = data["course_name"]
    module_title = data["module_title"]
    week_number = data.get("week_number", 1)
    top_k = data.get("top_k", 5)
    provider = data.get("provider") or None
    extra_instructions = data.get("extra_instructions", "")
    selected_doc_ids = [str(uid) for uid in (data.get("selected_doc_ids") or [])]
    # Use module title (not course name) as the RAG anchor — course names like
    # "ATLAS Smoke Testing Fundamentals" are not real academic subjects and pollute search.
    _custom_search_query = data.get("search_query")
    search_query = _custom_search_query or f"{module_title} concepts principles applications"

    course, error_response = _get_assigned_course_or_403(request, course_id)
    if error_response:
        return error_response

    # Determine module number (sequential within course)
    existing_count = Module.objects.filter(syllabus__course=course).count()
    module_number = existing_count + 1

    # ── Extract real course data for prompt enrichment ─────────────────────
    course_description: str = course.description or ""
    syllabus_ilos: list = []
    week_topic: str = ""
    latest_syllabus_for_data = (
        Syllabus.objects.filter(course=course, syllabus_content__isnull=False)
        .order_by("-syllabus_id")
        .first()
    )
    if latest_syllabus_for_data and latest_syllabus_for_data.syllabus_content:
        sc = latest_syllabus_for_data.syllabus_content
        if not course_description:
            course_description = sc.get("description") or ""
        syllabus_ilos = [str(i) for i in (sc.get("ilos") or []) if i]
        for entry in (sc.get("tla_chapters") or []):
            weeks_val = str(entry.get("weeks", "")).strip()
            if weeks_val == str(week_number):
                week_topic = entry.get("topics") or ""
                break
            if "-" in weeks_val:
                parts = weeks_val.split("-")
                if len(parts) == 2:
                    try:
                        if int(parts[0]) <= week_number <= int(parts[1]):
                            week_topic = entry.get("topics") or ""
                            break
                    except ValueError:
                        pass

    # Enhance the default search query with week topic once we have it
    if not _custom_search_query and week_topic:
        search_query = f"{module_title} {week_topic} concepts principles applications"

    try:
        # ── Step 1: Global knowledge base RAG ──────────────────────────────
        global_rag = semantic_search_with_summary(
            search_query, institution_id=request.user.institution_id, top_k=top_k,
        )
        global_chunks = global_rag["chunks"]
        global_summary = global_rag["context_summary"]

        # ── Step 2: Course-specific RAG ────────────────────────────────────
        course_rag = course_semantic_search_with_summary(
            query=search_query,
            course=course,
            top_k=top_k,
            selected_doc_ids=selected_doc_ids if selected_doc_ids else None,
        )
        course_chunks = course_rag["chunks"]
        course_summary = course_rag["context_summary"]

        # Combine: course-specific chunks first (higher priority), then global
        all_chunks = course_chunks + global_chunks
        combined_summary = (
            "\n\n".join(filter(None, [course_summary, global_summary])) or ""
        )

        logger.info(
            "Module generation for %r / %r wk%d: course=%d global=%d provider=%r",
            course_name, module_title, week_number,
            len(course_chunks), len(global_chunks), provider,
        )

        # ── Step 3: Build JSON CoT prompt ──────────────────────────────────
        system_prompt, user_prompt = CoTPromptBuilder.build_module_json_prompt(
            course_name=course_name,
            module_title=module_title,
            week_number=week_number,
            module_number=module_number,
            context_chunks=all_chunks,
            extra_instructions=extra_instructions,
            context_summary=combined_summary,
            ilos=syllabus_ilos,
            course_description=course_description,
            week_topic=week_topic,
        )

        # ── Step 4: LLM call with auto-fallback ────────────────────────────
        llm = LLMService()
        raw_text = llm.generate_response_with_fallback(
            messages=[{"role": "user", "content": user_prompt}],
            preferred_provider=provider,
            system=system_prompt,
            max_tokens=2048,
        )

        # ── Step 5: Parse JSON (strip markdown fences if present) ──────────
        clean = raw_text.strip()
        clean = re.sub(r"^```(?:json)?\s*", "", clean)
        clean = re.sub(r"\s*```$", "", clean)
        clean = clean.strip()

        try:
            module_content = json.loads(clean)
        except json.JSONDecodeError:
            # Attempt to extract the first JSON object from the response
            match = re.search(r"\{.*\}", clean, re.DOTALL)
            if match:
                module_content = json.loads(match.group(0))
            else:
                raise ValueError("LLM did not return valid JSON.")

        # Ensure subtopic IDs are present
        for idx, st in enumerate(module_content.get("subtopics", [])):
            if "id" not in st:
                st["id"] = f"st_{idx}"

        # ── Step 6: Save to DB ─────────────────────────────────────────────
        syllabus = (
            Syllabus.objects.filter(course=course, status="Draft")
            .order_by("-syllabus_id")
            .first()
        )
        if not syllabus:
            syllabus = Syllabus.objects.create(
                course=course, status="Draft", term="", version=1
            )

        module = Module.objects.create(
            syllabus=syllabus,
            module_title=module_title,
            week_number=week_number,
            status="Generated",
            generated_at=timezone.now(),
            module_content=module_content,
        )

        return Response(
            {
                "success": True,
                "module_id": str(module.module_id),
                "module_title": module_title,
                "week_number": week_number,
                "provider_used": provider or llm.default_provider,
                "rag_chunks_used": len(all_chunks),
                "module_content": module_content,
            },
            status=status.HTTP_201_CREATED,
        )

    except Exception as exc:
        logger.exception("Error generating module %r for course %r", module_title, course_name)
        return Response(
            {"success": False, "error": str(exc)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_module_detail(request, module_id):
    """Return a single module with its full JSON content."""
    if not _is_faculty_user(request):
        return _faculty_only_response()

    try:
        module = Module.objects.select_related("syllabus__course").get(module_id=module_id)
    except Module.DoesNotExist:
        return Response({"success": False, "detail": "Module not found."}, status=404)

    # Verify faculty owns this course
    course = module.syllabus.course
    _, error = _get_assigned_course_or_403(request, course.course_id)
    if error:
        return error

    return Response(
        {
            "success": True,
            "module": {
                "module_id": str(module.module_id),
                "module_title": module.module_title,
                "week_number": module.week_number,
                "status": module.status,
                "generated_at": module.generated_at,
                "module_content": module.module_content,
            },
        },
        status=status.HTTP_200_OK,
    )


@api_view(["PUT"])
@permission_classes([IsAuthenticated])
def save_module_content(request, module_id):
    """Save edited module_content JSON to the database."""
    if not _is_faculty_user(request):
        return _faculty_only_response()

    try:
        module = Module.objects.select_related("syllabus__course").get(module_id=module_id)
    except Module.DoesNotExist:
        return Response({"success": False, "detail": "Module not found."}, status=404)

    course = module.syllabus.course
    _, error = _get_assigned_course_or_403(request, course.course_id)
    if error:
        return error

    content = request.data.get("module_content")
    if content is None:
        return Response(
            {"success": False, "detail": "module_content is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    module.module_content = content
    module.status = "Edited"
    module.save(update_fields=["module_content", "status"])

    return Response({"success": True, "module_id": str(module.module_id)})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def generate_subtopic_content(request):
    """
    Generate or expand content for a single subtopic using course-specific + global RAG.

    Body: { module_id, subtopic_title, subtopic_id, existing_content, selected_doc_ids, provider }
    Returns: { success, content: "<plain text paragraphs>" }
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()
    trial_response = trial_generation_gate(request.user, syllabus_generation=False)
    if trial_response:
        return trial_response

    module_id = request.data.get("module_id")
    subtopic_title = (request.data.get("subtopic_title") or "").strip()
    existing_content = (request.data.get("existing_content") or "").strip()
    selected_doc_ids = request.data.get("selected_doc_ids") or []
    provider = request.data.get("provider") or None

    if not module_id or not subtopic_title:
        return Response(
            {"success": False, "detail": "module_id and subtopic_title are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        module = Module.objects.select_related("syllabus__course").get(module_id=module_id)
    except Module.DoesNotExist:
        return Response({"success": False, "detail": "Module not found."}, status=404)

    course = module.syllabus.course
    _, error = _get_assigned_course_or_403(request, course.course_id)
    if error:
        return error

    search_query = f"{module.module_title} {subtopic_title} concepts explanation"

    try:
        global_rag = semantic_search_with_summary(
            search_query, institution_id=request.user.institution_id, top_k=5,
        )
        course_rag = course_semantic_search_with_summary(
            query=search_query,
            course=course,
            top_k=5,
            selected_doc_ids=[str(d) for d in selected_doc_ids] if selected_doc_ids else None,
        )
        all_chunks = course_rag["chunks"] + global_rag["chunks"]
        combined_summary = "\n\n".join(filter(None, [
            course_rag["context_summary"], global_rag["context_summary"]
        ]))

        system_prompt, user_prompt = CoTPromptBuilder.build_subtopic_content_prompt(
            course_name=course.course_title,
            module_title=module.module_title,
            subtopic_title=subtopic_title,
            existing_content=existing_content,
            context_chunks=all_chunks,
            context_summary=combined_summary,
        )

        llm = LLMService()
        content = llm.generate_response_with_fallback(
            messages=[{"role": "user", "content": user_prompt}],
            preferred_provider=provider,
            system=system_prompt,
            max_tokens=1500,
        )

        return Response({"success": True, "content": content.strip()})

    except Exception as exc:
        logger.exception("Error generating subtopic content for %r", subtopic_title)
        return Response(
            {"success": False, "error": str(exc)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def module_ai_assist(request):
    """
    AI chatbox assistant for editing a module section.

    Body: { module_id, field, current_content, instruction, provider }
    Returns: { success, revised_content }
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()
    trial_response = trial_generation_gate(request.user, syllabus_generation=False)
    if trial_response:
        return trial_response

    module_id = request.data.get("module_id")
    field = (request.data.get("field") or "").strip()
    current_content = (request.data.get("current_content") or "").strip()
    instruction = (request.data.get("instruction") or "").strip()
    provider = request.data.get("provider") or None

    if not module_id or not instruction:
        return Response(
            {"success": False, "detail": "module_id and instruction are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        module = Module.objects.select_related("syllabus__course").get(module_id=module_id)
    except Module.DoesNotExist:
        return Response({"success": False, "detail": "Module not found."}, status=404)

    course = module.syllabus.course
    _, error = _get_assigned_course_or_403(request, course.course_id)
    if error:
        return error

    try:
        system_prompt, user_prompt = CoTPromptBuilder.build_module_ai_assist_prompt(
            field=field,
            current_content=current_content,
            instruction=instruction,
            course_name=course.course_title,
            module_title=module.module_title,
        )

        llm = LLMService()
        revised = llm.generate_response_with_fallback(
            messages=[{"role": "user", "content": user_prompt}],
            preferred_provider=provider,
            system=system_prompt,
            max_tokens=1000,
        )

        return Response({"success": True, "revised_content": revised.strip()})

    except Exception as exc:
        logger.exception("Error in module AI assist for module %s", module_id)
        return Response(
            {"success": False, "error": str(exc)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


def _to_int(value, default=0):
    try:
        if value in (None, ''):
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _to_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in {'1', 'true', 'yes', 'y', 'on'}:
        return True
    if text in {'0', 'false', 'no', 'n', 'off'}:
        return False
    return default


def _largest_remainder_allocation(total, weights):
    """Allocate integer counts by weights using largest-remainder rounding."""
    total = max(0, int(total or 0))
    if total == 0 or not weights:
        return [0 for _ in weights]

    safe_weights = [float(w) if float(w) > 0 else 0.0 for w in weights]
    weight_sum = sum(safe_weights)
    if weight_sum <= 0:
        base = total // len(weights)
        rem = total % len(weights)
        return [base + (1 if i < rem else 0) for i in range(len(weights))]

    raw = [(w / weight_sum) * total for w in safe_weights]
    alloc = [int(v) for v in raw]
    remaining = total - sum(alloc)
    fractions = sorted(
        [(idx, raw[idx] - alloc[idx]) for idx in range(len(raw))],
        key=lambda x: x[1],
        reverse=True,
    )
    for i in range(remaining):
        alloc[fractions[i][0]] += 1
    return alloc


def _match_assessment_entry(entries, code='', label=''):
    """Return the best matching assessment-task entry by code or label."""
    entries = entries if isinstance(entries, list) else []
    code = (code or '').strip().lower()
    label = (label or '').strip().lower()
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        entry_code = str(entry.get('code') or '').strip().lower()
        entry_label = str(entry.get('task') or entry.get('label') or '').strip().lower()
        sub_codes = [str(sub.get('code') or '').strip().lower() for sub in (entry.get('subs') or []) if isinstance(sub, dict)]
        sub_labels = [str(sub.get('label') or '').strip().lower() for sub in (entry.get('subs') or []) if isinstance(sub, dict)]
        if code and (code == entry_code or code in sub_codes):
            return entry
        if label and (label == entry_label or label in sub_labels):
            return entry
    return entries[0] if entries else None


def _is_major_exam_entry(entry):
    """Return True when a TOS exam entry is a major examination."""
    if not isinstance(entry, dict):
        return False

    if isinstance(entry.get('isMajor'), bool):
        return entry.get('isMajor') is True

    exam_code = str(entry.get('examCode') or '').strip().lower()
    exam_label = str(entry.get('examLabel') or entry.get('label') or '').strip().lower()
    text = f"{exam_code} {exam_label}"

    major_keywords = [
        'major',
        'midterm',
        'prelim',
        'pre-final',
        'pre final',
        'final',
    ]
    if any(keyword in text for keyword in major_keywords):
        return True

    compact_code = re.sub(r'[^a-z0-9]+', '', exam_code)
    return compact_code in {'me', 'mt', 'fe', 'prelim', 'prelims'}


def _major_tos_entries(tos_entries):
    """Keep only major examination rows from TOS."""
    safe_entries = tos_entries if isinstance(tos_entries, list) else []
    return [entry for entry in safe_entries if _is_major_exam_entry(entry)]


def _tos_exam_total_items(exam_entry):
    """Resolve total items for a TOS exam from explicit total or topic rows."""
    if not isinstance(exam_entry, dict):
        return 0

    explicit_total = _to_int(exam_entry.get('totalTestItems'))
    if explicit_total > 0:
        return explicit_total

    topic_rows = [row for row in (exam_entry.get('topics') or []) if isinstance(row, dict)]
    by_points = sum(_to_int(row.get('total_points')) for row in topic_rows)
    if by_points > 0:
        return by_points

    by_weight = sum(_to_int(row.get('weight')) for row in topic_rows)
    if by_weight > 0:
        return by_weight

    bloom_keys = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
    by_bloom = 0
    for row in topic_rows:
        bloom_items = row.get('bloom_items') or {}
        by_bloom += sum(_to_int(bloom_items.get(key)) for key in bloom_keys)
    return by_bloom


def _flatten_tos_sections(tos_entry):
    """Build section candidates from a single syllabus TOS entry."""
    entries = [tos_entry] if isinstance(tos_entry, dict) else []
    matched = []

    for exam in entries:
        if not isinstance(exam, dict):
            continue
        exam_label = str(exam.get('examLabel') or exam.get('examCode') or 'Assessment').strip()
        topics = exam.get('topics') or []
        for row in topics:
            if not isinstance(row, dict):
                continue
            section_title = str(row.get('topic') or '').strip()
            if not section_title:
                continue
            bloom_items = row.get('bloom_items') or {}
            bloom_counts = {
                'remember': _to_int(bloom_items.get('remember')),
                'understand': _to_int(bloom_items.get('understand')),
                'apply': _to_int(bloom_items.get('apply')),
                'analyze': _to_int(bloom_items.get('analyze')),
                'evaluate': _to_int(bloom_items.get('evaluate')),
                'create': _to_int(bloom_items.get('create')),
            }
            row_total = sum(bloom_counts.values())
            if row_total <= 0:
                row_total = _to_int(row.get('total_points')) or _to_int(row.get('weight'))

            matched.append(
                {
                    'exam_label': exam_label,
                    'section_title': section_title,
                    'ilos': [str(v) for v in (row.get('ilos') or []) if str(v).strip()],
                    'bloom_counts': bloom_counts,
                    'weight': row_total if row_total > 0 else 1,
                }
            )

    if matched:
        return matched

    # Fallback: no matching exam by type; use all TOS rows.
    for exam in entries:
        if not isinstance(exam, dict):
            continue
        exam_label = str(exam.get('examLabel') or exam.get('examCode') or 'Assessment').strip()
        for row in (exam.get('topics') or []):
            if not isinstance(row, dict):
                continue
            section_title = str(row.get('topic') or '').strip()
            if not section_title:
                continue
            bloom_items = row.get('bloom_items') or {}
            bloom_counts = {
                'remember': _to_int(bloom_items.get('remember')),
                'understand': _to_int(bloom_items.get('understand')),
                'apply': _to_int(bloom_items.get('apply')),
                'analyze': _to_int(bloom_items.get('analyze')),
                'evaluate': _to_int(bloom_items.get('evaluate')),
                'create': _to_int(bloom_items.get('create')),
            }
            row_total = sum(bloom_counts.values())
            if row_total <= 0:
                row_total = _to_int(row.get('total_points')) or _to_int(row.get('weight'))

            matched.append(
                {
                    'exam_label': exam_label,
                    'section_title': section_title,
                    'ilos': [str(v) for v in (row.get('ilos') or []) if str(v).strip()],
                    'bloom_counts': bloom_counts,
                    'weight': row_total if row_total > 0 else 1,
                }
            )

    return matched


def _sections_from_assessment_tasks(syllabus_content):
    """Fallback section seeds from assessment_tasks when TOS is missing."""
    out = []
    tasks = syllabus_content.get('assessment_tasks') or []
    for idx, task in enumerate(tasks, start=1):
        if not isinstance(task, dict):
            continue
        label = str(task.get('task') or task.get('code') or f'Section {idx}').strip()
        if not label:
            continue
        out.append(
            {
                'exam_label': 'Assessment',
                'section_title': label,
                'ilos': [str(v) for v in (task.get('ilo_values') or []) if str(v).strip()],
                'bloom_counts': {
                    'remember': 0,
                    'understand': 0,
                    'apply': 0,
                    'analyze': 0,
                    'evaluate': 0,
                    'create': 0,
                },
                'weight': _to_int(task.get('weight')) or 1,
            }
        )
    return out


def _build_sectioned_assessment_payload(topic_rows, assessment_type, total_items, ilos=None, ilo_bloom=None, assessment_label='Assessment'):
    """
    Build sectioned assessment items using explicit topic rows from TOS or faculty input.
    Returns sections with allocated items and Bloom labels.
    """
    sections = []
    for row in (topic_rows or []):
        if not isinstance(row, dict):
            continue
        section_title = str(row.get('topic') or row.get('label') or '').strip()
        if not section_title:
            continue
        bloom_items = row.get('bloom_items') or {}
        bloom_counts = {
            'remember': _to_int(bloom_items.get('remember')),
            'understand': _to_int(bloom_items.get('understand')),
            'apply': _to_int(bloom_items.get('apply')),
            'analyze': _to_int(bloom_items.get('analyze')),
            'evaluate': _to_int(bloom_items.get('evaluate')),
            'create': _to_int(bloom_items.get('create')),
        }
        row_total = sum(bloom_counts.values())
        if row_total <= 0:
            row_total = _to_int(row.get('total_points')) or _to_int(row.get('weight'))

        sections.append(
            {
                'exam_label': assessment_label,
                'section_title': section_title,
                'ilos': [str(v) for v in (row.get('ilos') or []) if str(v).strip()],
                'bloom_counts': bloom_counts,
                'weight': row_total if row_total > 0 else 1,
            }
        )

    if not sections:
        sections = [
            {
                'exam_label': assessment_label or assessment_type.title() if assessment_type else 'Assessment',
                'section_title': 'General Section',
                'ilos': [],
                'bloom_counts': {
                    'remember': 0,
                    'understand': 0,
                    'apply': 0,
                    'analyze': 0,
                    'evaluate': 0,
                    'create': 0,
                },
                'weight': 1,
            }
        ]

    total_items = max(1, int(total_items or 1))
    section_alloc = _largest_remainder_allocation(total_items, [s['weight'] for s in sections])

    ilo_bloom_map = {}
    ilos = ilos or []
    ilo_bloom = ilo_bloom or []
    for idx, text in enumerate(ilos):
        if not text:
            continue
        key = str(idx + 1)
        bloom = ilo_bloom[idx] if idx < len(ilo_bloom) and isinstance(ilo_bloom[idx], dict) else {}
        ilo_bloom_map[key] = {
            'level': str(bloom.get('level') or '').strip(),
            'verb': str(bloom.get('verb') or '').strip(),
        }

    running_item_no = 1
    section_payloads = []
    bloom_order = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']

    for idx, section in enumerate(sections):
        allocated = max(0, section_alloc[idx])
        blooms = section['bloom_counts']
        bloom_weights = [blooms.get(k, 0) for k in bloom_order]
        bloom_weight_total = sum(bloom_weights)
        # Only include Bloom levels that have non-zero item counts in the TOS
        nonzero_bloom_indices = [i for i, w in enumerate(bloom_weights) if w > 0]
        if bloom_weight_total > 0 and nonzero_bloom_indices:
            nonzero_weights = [bloom_weights[i] for i in nonzero_bloom_indices]
            nonzero_alloc = _largest_remainder_allocation(allocated, nonzero_weights)
            bloom_alloc = [0] * len(bloom_order)
            for ni, nw in zip(nonzero_bloom_indices, nonzero_alloc):
                bloom_alloc[ni] = nw
        elif allocated > 0:
            bloom_alloc = [0] * len(bloom_order)
            bloom_alloc[0] = allocated
        else:
            bloom_alloc = [0] * len(bloom_order)

        items = []
        for bloom_key, count in zip(bloom_order, bloom_alloc):
            for local_idx in range(count):
                inferred_verb = ''
                for ilo_ref in section['ilos']:
                    ref_num = re.sub(r'\D+', '', str(ilo_ref))
                    if ref_num in ilo_bloom_map and ilo_bloom_map[ref_num].get('verb'):
                        inferred_verb = ilo_bloom_map[ref_num]['verb']
                        break

                item = {
                    'item_number': running_item_no,
                    'item_type': assessment_type,
                    'section_title': section['section_title'],
                    'exam_label': section['exam_label'],
                    'bloom_level': bloom_key.title(),
                    'bloom_verb': inferred_verb,
                    'ilo_refs': section['ilos'],
                    'question_text': (
                        f"[{section['section_title']}] {assessment_type.title()} item "
                        f"{local_idx + 1} ({bloom_key.title()})"
                    ).strip(),
                }
                items.append(item)
                running_item_no += 1

        section_payloads.append(
            {
                'section_title': section['section_title'],
                'exam_label': section['exam_label'],
                'allocated_items': allocated,
                'bloom_distribution': {
                    bloom_order[i].title(): bloom_alloc[i]
                    for i in range(len(bloom_order))
                    if bloom_alloc[i] > 0
                },
                'items': items,
            }
        )

    return section_payloads


def _normalize_bloom_key(value):
    text = str(value or '').strip().lower()
    aliases = {
        'remembering': 'remember',
        'understanding': 'understand',
        'applying': 'apply',
        'analyzing': 'analyze',
        'analysing': 'analyze',
        'evaluating': 'evaluate',
        'creating': 'create',
    }
    return aliases.get(text, text)


def _tos_topic_bloom_targets(topic_rows):
    bloom_order = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
    targets = {}

    for row in (topic_rows or []):
        if not isinstance(row, dict):
            continue
        topic = str(row.get('topic') or row.get('label') or '').strip()
        if not topic:
            continue

        bloom_items = row.get('bloom_items') or {}
        bloom_targets = {
            key: max(0, _to_int(bloom_items.get(key)))
            for key in bloom_order
        }

        row_total = sum(bloom_targets.values())
        if row_total <= 0:
            row_total = _to_int(row.get('total_points')) or _to_int(row.get('weight'))
            if row_total > 0:
                bloom_targets['remember'] = row_total

        topic_key = _normalize_topic_key(topic)
        if topic_key not in targets:
            targets[topic_key] = {
                'topic': topic,
                'bloom': {key: 0 for key in bloom_order},
            }

        for key in bloom_order:
            targets[topic_key]['bloom'][key] += bloom_targets[key]

    return targets


def _assessment_existing_topic_bloom_counts(assessment):
    bloom_order = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
    counts = {}

    for saved_item in AssessmentItem.objects.filter(assessment=assessment):
        metadata = saved_item.rubric if isinstance(saved_item.rubric, dict) else {}
        topic = str(metadata.get('section_title') or '').strip()
        bloom_level = _normalize_bloom_key(metadata.get('bloom_level'))
        topic_key = _normalize_topic_key(topic)
        if not topic_key or bloom_level not in bloom_order:
            continue

        if topic_key not in counts:
            counts[topic_key] = {key: 0 for key in bloom_order}
        counts[topic_key][bloom_level] += 1

    return counts


def _build_tos_counters(topic_rows, existing_counts=None):
    bloom_order = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
    targets = _tos_topic_bloom_targets(topic_rows)
    existing_counts = existing_counts or {}

    topics = []
    overall_target = 0
    overall_current = 0
    for topic_key, target_data in targets.items():
        current_map = existing_counts.get(topic_key) or {}
        bloom_entries = []
        topic_target = 0
        topic_current = 0
        for bloom in bloom_order:
            target = max(0, _to_int(target_data['bloom'].get(bloom)))
            current = max(0, _to_int(current_map.get(bloom)))
            remaining = max(0, target - current)
            bloom_entries.append(
                {
                    'level': bloom.title(),
                    'target': target,
                    'current': current,
                    'remaining': remaining,
                    'is_full': current >= target,
                }
            )
            topic_target += target
            topic_current += current

        topics.append(
            {
                'topic': target_data['topic'],
                'target_total': topic_target,
                'current_total': topic_current,
                'remaining_total': max(0, topic_target - topic_current),
                'is_full': topic_current >= topic_target,
                'bloom': bloom_entries,
            }
        )
        overall_target += topic_target
        overall_current += topic_current

    topics.sort(key=lambda item: str(item.get('topic') or '').lower())
    return {
        'topics': topics,
        'target_total': overall_target,
        'current_total': overall_current,
        'remaining_total': max(0, overall_target - overall_current),
        'is_complete': overall_current >= overall_target and overall_target > 0,
    }


def _next_item_number_for_assessment(assessment):
    next_number = 1
    for saved_item in AssessmentItem.objects.filter(assessment=assessment):
        metadata = saved_item.rubric if isinstance(saved_item.rubric, dict) else {}
        item_no = _to_int(metadata.get('item_number'), 0)
        if item_no >= next_number:
            next_number = item_no + 1
    return next_number


def _manual_item_payloads(manual_items, topic_rows, existing_counts, default_item_type):
    bloom_order = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
    targets = _tos_topic_bloom_targets(topic_rows)
    pending_counts = {
        topic_key: dict(counts)
        for topic_key, counts in (existing_counts or {}).items()
    }

    normalized_items = []
    errors = []

    for idx, item in enumerate(manual_items or [], start=1):
        if not isinstance(item, dict):
            errors.append(f'manual_items[{idx}] must be an object.')
            continue

        topic = str(item.get('section_title') or item.get('topic') or '').strip()
        bloom = _normalize_bloom_key(item.get('bloom_level'))
        question_text = str(item.get('question_text') or '').strip()
        answer_key = str(item.get('answer_key') or '').strip()
        correct_answer = str(item.get('correct_answer') or '').strip()[:1].upper()

        if not topic:
            errors.append(f'manual_items[{idx}].section_title is required.')
            continue
        if bloom not in bloom_order:
            errors.append(
                f'manual_items[{idx}].bloom_level must be one of: Remember, Understand, Apply, Analyze, Evaluate, Create.'
            )
            continue
        if not question_text:
            errors.append(f'manual_items[{idx}].question_text is required.')
            continue
        if not answer_key and not correct_answer:
            errors.append(f'manual_items[{idx}] must include answer_key or correct_answer.')
            continue

        topic_key = _normalize_topic_key(topic)
        target_topic = targets.get(topic_key)
        if not target_topic:
            errors.append(
                f'manual_items[{idx}] topic "{topic}" is not part of the selected TOS exam topics.'
            )
            continue

        if topic_key not in pending_counts:
            pending_counts[topic_key] = {key: 0 for key in bloom_order}

        target_for_bucket = _to_int(target_topic['bloom'].get(bloom), 0)
        current_for_bucket = _to_int(pending_counts[topic_key].get(bloom), 0)
        if target_for_bucket <= 0:
            errors.append(
                f'manual_items[{idx}] exceeds TOS allocation: topic "{target_topic["topic"]}" has 0 items for Bloom {bloom.title()}.'
            )
            continue
        if current_for_bucket >= target_for_bucket:
            errors.append(
                f'manual_items[{idx}] exceeds TOS allocation: topic "{target_topic["topic"]}" already reached {target_for_bucket} item(s) for Bloom {bloom.title()}.'
            )
            continue

        pending_counts[topic_key][bloom] = current_for_bucket + 1
        normalized_items.append(
            {
                'section_title': target_topic['topic'],
                'bloom_level': bloom.title(),
                'item_type': str(item.get('item_type') or default_item_type or 'Multiple Choice'),
                'question_text': question_text,
                'choices': item.get('choices') or [],
                'correct_answer': correct_answer,
                'answer_key': answer_key,
                'ilo_refs': [str(v).strip() for v in (item.get('ilo_refs') or []) if str(v).strip()],
                'points': max(0, _to_int(item.get('points'), 0)),
                'bloom_verb': str(item.get('bloom_verb') or '').strip(),
            }
        )

    return normalized_items, errors, pending_counts


def _normalize_choices(choices):
    if isinstance(choices, dict):
        raw_choices = []
        for letter in ['A', 'B', 'C', 'D']:
            if letter in choices:
                raw_choices.append(choices.get(letter))
    elif isinstance(choices, str):
        raw_choices = [line.strip() for line in choices.splitlines() if line.strip()]
    else:
        raw_choices = choices if isinstance(choices, list) else []

    normalized = []
    for idx, choice in enumerate(raw_choices[:4]):
        text = str(choice or '').strip()
        if not text:
            continue
        prefix = chr(65 + idx)
        if re.match(r'^[A-D][\.|\)]\s+', text):
            normalized.append(text)
        else:
            normalized.append(f'{prefix}. {text}')
    return normalized[:4]


def _is_placeholder_choice(choice_text):
    text = str(choice_text or '').strip().lower()
    if not text:
        return True
    text = re.sub(r'^[a-e][\.|\)]\s*', '', text).strip()
    if not text or text in {'...', 'tbd', 'na', 'n/a'}:
        return True
    if re.fullmatch(r'option\s*[a-e0-9]*', text):
        return True
    return False


def _generated_item_quality_errors(item_payload):
    errors = []

    question_text = str(item_payload.get('question_text') or '').strip()
    if not question_text:
        errors.append('question_text is missing.')

    choices = _normalize_choices(item_payload.get('choices'))
    if len(choices) != 4:
        errors.append('choices must include exactly 4 options (A-D).')
    elif any(_is_placeholder_choice(choice) for choice in choices):
        errors.append('choices contain placeholder values.')

    correct_answer = str(item_payload.get('correct_answer') or '').strip()[:1].upper()
    if correct_answer not in 'ABCD':
        errors.append('correct_answer must be one of A, B, C, or D.')

    answer_key = str(item_payload.get('answer_key') or '').strip()
    if not answer_key:
        errors.append('answer_key (explanation) is missing.')

    return errors


def _normalize_topic_key(value):
    return re.sub(r'[^a-z0-9]+', ' ', str(value or '').lower()).strip()


def _topic_tokens(value):
    stopwords = {
        'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'your', 'their',
        'course', 'module', 'section', 'topic', 'assessment', 'exam', 'items', 'item',
        'question', 'questions', 'week', 'part', 'unit', 'chapter', 'of', 'to', 'in',
    }
    return {
        token
        for token in re.findall(r'[a-z0-9]+', str(value or '').lower())
        if len(token) > 2 and token not in stopwords
    }


def _flatten_json_text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return '\n'.join(_flatten_json_text(v) for v in value if v is not None)
    if isinstance(value, dict):
        return '\n'.join(_flatten_json_text(v) for v in value.values() if v is not None)
    return str(value or '')


def _module_match_blob(module):
    module_content = module.module_content if isinstance(module.module_content, dict) else {}
    parts = [
        str(module.module_title or ''),
        str(module_content.get('introduction') or ''),
    ]
    learning_objectives = module_content.get('learning_objectives') or []
    parts.extend(str(v) for v in learning_objectives if str(v).strip())
    for subtopic in (module_content.get('subtopics') or []):
        if not isinstance(subtopic, dict):
            continue
        parts.append(str(subtopic.get('title') or ''))
        parts.append(str(subtopic.get('content') or ''))
    return ' '.join(parts)


def _module_prompt_excerpt(module, char_limit=1200):
    module_content = module.module_content if isinstance(module.module_content, dict) else {}
    lines = [
        f"Module Title: {module.module_title}",
        f"Week: {module.week_number}",
    ]
    introduction = str(module_content.get('introduction') or '').strip()
    if introduction:
        lines.append(f"Introduction: {introduction[:260]}")

    objectives = [str(v).strip() for v in (module_content.get('learning_objectives') or []) if str(v).strip()]
    if objectives:
        lines.append('Learning Objectives: ' + '; '.join(objectives[:4]))

    subtopic_titles = []
    for subtopic in (module_content.get('subtopics') or []):
        if isinstance(subtopic, dict):
            title = str(subtopic.get('title') or '').strip()
            if title:
                subtopic_titles.append(title)
    if subtopic_titles:
        lines.append('Subtopics: ' + '; '.join(subtopic_titles[:6]))

    short_activity = module_content.get('short_activity') if isinstance(module_content.get('short_activity'), dict) else {}
    activity_desc = str(short_activity.get('description') or '').strip()
    if activity_desc:
        lines.append(f"Short Activity: {activity_desc[:220]}")

    text = '\n'.join(lines)
    return text[:char_limit]


def _match_sections_to_course_modules(course, sections):
    """Match each assessment section topic to the strongest saved module in the same course."""
    modules = list(
        Module.objects.filter(syllabus__course=course)
        .order_by('week_number', '-generated_at', '-module_id')
    )
    if not modules:
        return {}

    module_cache = []
    for module in modules:
        blob = _module_match_blob(module)
        module_cache.append(
            {
                'module': module,
                'title_key': _normalize_topic_key(module.module_title),
                'tokens': _topic_tokens(blob),
                'blob_key': _normalize_topic_key(blob),
            }
        )

    matches = {}
    for section in (sections or []):
        section_title = str(section.get('section_title') or '').strip()
        section_key = _normalize_topic_key(section_title)
        section_tokens = _topic_tokens(section_title)
        if not section_key:
            continue

        best_score = 0
        best_module = None
        for candidate in module_cache:
            score = 0
            if section_key and section_key in candidate['title_key']:
                score += 18
            if section_key and section_key in candidate['blob_key']:
                score += 10

            overlap = len(section_tokens & candidate['tokens'])
            score += overlap * 4

            if score > best_score:
                best_score = score
                best_module = candidate['module']

        if best_module and best_score > 0:
            matches[section_key] = best_module

    return matches


def _build_section_module_context(sections, section_module_matches):
    blocks = []
    for section in (sections or []):
        section_title = str(section.get('section_title') or '').strip()
        section_key = _normalize_topic_key(section_title)
        module = section_module_matches.get(section_key)
        if not module:
            continue
        blocks.append(
            '\n'.join(
                [
                    f"Section Topic: {section_title}",
                    _module_prompt_excerpt(module),
                ]
            )
        )
    return '\n\n'.join(blocks)


def _derive_assessment_source(syllabus_content, source_exam_code='', source_exam_label='', faculty_topics=None):
    """Derive assessment name, item count, and source topics from syllabus data."""
    tos_entries = _major_tos_entries(syllabus_content.get('tos') or [])
    assessment_tasks = syllabus_content.get('assessment_tasks') or []

    selected_exam = _match_assessment_entry(tos_entries, source_exam_code, source_exam_label)
    selected_task = _match_assessment_entry(assessment_tasks, source_exam_code, source_exam_label)

    exam_label = ''
    exam_code = ''
    topic_rows = []
    if isinstance(selected_exam, dict):
        exam_label = str(selected_exam.get('examLabel') or selected_exam.get('examCode') or '').strip()
        exam_code = str(selected_exam.get('examCode') or '').strip()
        topic_rows = [row for row in (selected_exam.get('topics') or []) if isinstance(row, dict)]

    if not topic_rows and faculty_topics:
        topic_rows = [
            {
                'topic': str(topic).strip(),
                'ilos': [],
                'weight': '',
                'bloom_items': {},
                'total_points': '',
            }
            for topic in faculty_topics
            if str(topic).strip()
        ]

    total_items = 0
    if isinstance(selected_exam, dict):
        total_items = _tos_exam_total_items(selected_exam)
    if total_items <= 0:
        total_items = sum(
            _to_int(row.get('total_points')) or _to_int(row.get('weight'))
            for row in topic_rows
        )
    if total_items <= 0 and isinstance(selected_task, dict):
        total_items = _to_int(selected_task.get('weight'))
    if total_items <= 0:
        total_items = max(1, len(topic_rows))

    assessment_name = exam_label or str(selected_task.get('task') or selected_task.get('label') or '').strip() if isinstance(selected_task, dict) else ''
    if not assessment_name and source_exam_label:
        assessment_name = source_exam_label
    if not assessment_name and source_exam_code:
        assessment_name = source_exam_code
    if not assessment_name:
        assessment_name = 'Assessment'

    assessment_type = assessment_name.lower()
    source_task_code = str(selected_task.get('code') or '').strip() if isinstance(selected_task, dict) else ''
    source_task_label = str(selected_task.get('task') or selected_task.get('label') or '').strip() if isinstance(selected_task, dict) else ''

    return {
        'assessment_name': assessment_name,
        'assessment_type': assessment_type,
        'assessment_code': exam_code or source_task_code,
        'assessment_task_label': source_task_label,
        'assessment_task_weight': _to_int(selected_task.get('weight')) if isinstance(selected_task, dict) else 0,
        'total_items': total_items,
        'topic_rows': topic_rows,
        'selected_exam': selected_exam,
        'selected_task': selected_task,
    }


def _assessment_detail_payload(assessment):
    items_qs = AssessmentItem.objects.filter(assessment=assessment)
    raw_items = []
    target_totals = []
    for item in items_qs:
        metadata = item.rubric if isinstance(item.rubric, dict) else {}
        target_total = _to_int(metadata.get('assessment_total_items'), 0)
        if target_total > 0:
            target_totals.append(target_total)
        raw_items.append(
            {
                'item_id': str(item.item_id),
                'item_number': _to_int(metadata.get('item_number'), 0),
                'item_type': item.item_type,
                'section_title': metadata.get('section_title') or 'General Section',
                'exam_label': metadata.get('exam_label') or assessment.title,
                'bloom_level': metadata.get('bloom_level') or '',
                'bloom_verb': metadata.get('bloom_verb') or '',
                'ilo_refs': metadata.get('ilo_refs') or [],
                'question_text': item.question_text,
                'choices': metadata.get('choices') or [],
                'correct_answer': metadata.get('correct_answer') or '',
                'answer_key': metadata.get('answer_key') or '',
                'points': _to_int(metadata.get('points'), 0),
                'matched_module_id': metadata.get('matched_module_id'),
                'matched_module_title': metadata.get('matched_module_title') or '',
                'matched_module_week': metadata.get('matched_module_week'),
            }
        )

    raw_items.sort(key=lambda x: (x['item_number'] if x['item_number'] > 0 else 10**9, x['question_text']))

    return {
        'assessment_id': str(assessment.assessment_id),
        'title': assessment.title,
        'assessment_type': assessment.assessment_type,
        'term': assessment.term,
        'status': assessment.status,
        'generated_at': assessment.generated_at,
        'items': raw_items,
        'total_items': len(raw_items),
        'target_total_items': max(target_totals) if target_totals else len(raw_items),
    }


def _find_blueprint_item_by_number(sections, item_number):
    wanted = _to_int(item_number, 0)
    if wanted <= 0:
        return None, None
    for section in (sections or []):
        for item in (section.get('items') or []):
            if _to_int(item.get('item_number'), 0) == wanted:
                return section, item
    return None, None


def _next_missing_item_number(assessment, total_items):
    total = max(0, _to_int(total_items, 0))
    if total <= 0:
        return None

    present = set()
    for saved_item in AssessmentItem.objects.filter(assessment=assessment):
        metadata = saved_item.rubric if isinstance(saved_item.rubric, dict) else {}
        item_no = _to_int(metadata.get('item_number'), 0)
        if item_no > 0:
            present.add(item_no)

    for idx in range(1, total + 1):
        if idx not in present:
            return idx
    return None


def _build_plain_assessment_docx(assessment_payload, include_choices=True, include_answer_key=True):
    from docx import Document
    from docx.shared import Pt, RGBColor, Inches
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    doc = Document()
    for section in doc.sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1.1)
        section.right_margin = Inches(1.1)

    maroon = RGBColor(0x8B, 0x00, 0x00)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run(assessment_payload.get('title') or 'Assessment')
    run.bold = True
    run.font.size = Pt(15)
    run.font.color.rgb = maroon

    subtitle = doc.add_paragraph(
        f"Type: {assessment_payload.get('assessment_type', '')} | "
        f"Total Items: {assessment_payload.get('total_items', 0)}"
    )
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if subtitle.runs:
        subtitle.runs[0].font.size = Pt(10)

    doc.add_paragraph()

    for section in assessment_payload.get('sections', []):
        sec_heading = doc.add_heading(section.get('section_title') or 'Section', level=1)
        if sec_heading.runs:
            sec_heading.runs[0].font.color.rgb = maroon

        bloom_dist = section.get('bloom_distribution') or {}
        if bloom_dist:
            bloom_line = ', '.join(f"{k}: {v}" for k, v in bloom_dist.items() if v)
            if bloom_line:
                doc.add_paragraph(f"Bloom Distribution (TOS): {bloom_line}")

        for item in section.get('items', []):
            text = f"{item.get('item_number')}. {item.get('question_text') or ''}".strip()
            p = doc.add_paragraph(text, style='List Number')
            if include_choices:
                for choice in (item.get('choices') or [])[:4]:
                    choice_text = str(choice or '').strip()
                    if choice_text:
                        doc.add_paragraph(choice_text, style='List Bullet 2')
            meta_parts = []
            if include_answer_key and item.get('bloom_level'):
                meta_parts.append(f"Bloom: {item['bloom_level']}")
            if include_answer_key and item.get('bloom_verb'):
                meta_parts.append(f"Verb: {item['bloom_verb']}")
            if include_answer_key and item.get('ilo_refs'):
                refs = ', '.join(str(v) for v in item['ilo_refs'])
                meta_parts.append(f"ILO: {refs}")
            if include_answer_key and item.get('correct_answer'):
                meta_parts.append(f"Correct Answer: {item['correct_answer']}")
            if meta_parts:
                meta = doc.add_paragraph(' | '.join(meta_parts))
                if meta.runs:
                    meta.runs[0].italic = True
                    meta.runs[0].font.size = Pt(9)
            if include_answer_key and item.get('answer_key'):
                answer_key = doc.add_paragraph(f"Answer Key: {item['answer_key']}")
                if answer_key.runs:
                    answer_key.runs[0].font.size = Pt(9)
            if p.runs:
                p.runs[0].font.size = Pt(11)

        doc.add_paragraph()

    return doc


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def generate_assessment(request):
    """
    Generate sectioned assessment items from syllabus "Assessment and Score Distribution"
    and "TOS" data, then persist as Assessment + AssessmentItems.
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()
    trial_response = trial_generation_gate(request.user, syllabus_generation=False)
    if trial_response:
        return trial_response

    course_id = request.data.get('course_id')
    assessment_type = str(request.data.get('assessment_type') or '').strip().lower()
    term_override = str(request.data.get('term') or '').strip()
    provider = request.data.get('provider') or None
    extra_instructions = str(request.data.get('extra_instructions') or '').strip()
    selected_doc_ids = [str(uid) for uid in (request.data.get('selected_doc_ids') or [])]
    source_exam_code = str(request.data.get('source_exam_code') or '').strip()
    source_exam_label = str(request.data.get('source_exam_label') or '').strip()
    faculty_topics = request.data.get('faculty_topics') or request.data.get('topics') or []
    manual_items = request.data.get('manual_items') or []
    assessment_id = request.data.get('assessment_id')
    item_by_item = _to_bool(request.data.get('item_by_item'), False)
    target_item_number = _to_int(request.data.get('target_item_number'), 0)
    related_item_number = _to_int(request.data.get('related_item_number'), 0)
    relation_instruction = str(request.data.get('relation_instruction') or '').strip()
    overwrite_item = _to_bool(request.data.get('overwrite_item'), True)
    manual_item = request.data.get('manual_item')
    regenerate_choices_only = _to_bool(request.data.get('regenerate_choices_only'), False)
    use_manual_input = isinstance(manual_items, list) and len(manual_items) > 0
    if isinstance(faculty_topics, str):
        faculty_topics = [line.strip() for line in faculty_topics.splitlines() if line.strip()]

    if not course_id:
        return Response(
            {'success': False, 'detail': 'course_id is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not assessment_type:
        return Response(
            {'success': False, 'detail': 'assessment_type is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    course, error_response = _get_assigned_course_or_403(request, course_id)
    if error_response:
        return error_response

    latest_syllabus = (
        Syllabus.objects.filter(course=course)
        .order_by('-generated_at', '-syllabus_id')
        .first()
    )
    if not latest_syllabus or not isinstance(latest_syllabus.syllabus_content, dict):
        return Response(
            {
                'success': False,
                'detail': 'No syllabus content found. Please save syllabus first.',
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    syllabus_content = latest_syllabus.syllabus_content
    source = _derive_assessment_source(
        syllabus_content,
        source_exam_code=source_exam_code,
        source_exam_label=source_exam_label,
        faculty_topics=faculty_topics,
    )
    if not isinstance(source.get('selected_exam'), dict):
        return Response(
            {
                'success': False,
                'detail': 'No major examination found in TOS. Please define a major exam (e.g., Midterm/Final) with total items first.',
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    total_items = source['total_items'] or 1
    sections = _build_sectioned_assessment_payload(
        source['topic_rows'],
        assessment_type or source['assessment_type'],
        total_items,
        ilos=syllabus_content.get('ilos') or [],
        ilo_bloom=syllabus_content.get('ilo_bloom') or [],
        assessment_label=source['assessment_name'],
    )
    section_module_matches = _match_sections_to_course_modules(course, sections)
    total_generated = sum(len(s['items']) for s in sections)
    assessment_title = f"{course.course_code} {source['assessment_name']}"
    term = term_override or str(syllabus_content.get('semester_year') or latest_syllabus.term or '').strip()

    if item_by_item:
        if target_item_number <= 0:
            return Response(
                {
                    'success': False,
                    'detail': 'target_item_number is required when item_by_item=true.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target_item_number > total_generated:
            return Response(
                {
                    'success': False,
                    'detail': f'target_item_number must be between 1 and {total_generated}.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if related_item_number and related_item_number == target_item_number:
            return Response(
                {
                    'success': False,
                    'detail': 'related_item_number cannot be the same as target_item_number.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_assessment = None
        if assessment_id:
            target_assessment = Assessment.objects.filter(
                assessment_id=assessment_id,
                course=course,
            ).first()
            if not target_assessment:
                return Response(
                    {
                        'success': False,
                        'detail': 'assessment_id was not found for this course.',
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            target_assessment = Assessment.objects.create(
                course=course,
                title=assessment_title,
                assessment_type=source['assessment_type'],
                term=term,
                status='Draft',
                generated_at=timezone.now(),
            )

        target_section, target_item_blueprint = _find_blueprint_item_by_number(sections, target_item_number)
        if not target_item_blueprint:
            return Response(
                {
                    'success': False,
                    'detail': f'Unable to resolve blueprint for item #{target_item_number}.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_item = None
        by_number = {}
        for saved_item in AssessmentItem.objects.filter(assessment=target_assessment):
            metadata = saved_item.rubric if isinstance(saved_item.rubric, dict) else {}
            item_no = _to_int(metadata.get('item_number'), 0)
            if item_no > 0:
                by_number[item_no] = saved_item
            if item_no == target_item_number:
                existing_item = saved_item

        if existing_item and not overwrite_item:
            return Response(
                {
                    'success': False,
                    'detail': f'Item #{target_item_number} already exists. Set overwrite_item=true to regenerate.',
                    'assessment_id': str(target_assessment.assessment_id),
                },
                status=status.HTTP_409_CONFLICT,
            )

        related_item = by_number.get(related_item_number) if related_item_number else None
        if related_item_number and related_item is None:
            return Response(
                {
                    'success': False,
                    'detail': f'related_item_number #{related_item_number} was not found in this assessment yet.',
                    'assessment_id': str(target_assessment.assessment_id),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if regenerate_choices_only:
            if not existing_item:
                return Response(
                    {
                        'success': False,
                        'detail': f'Item #{target_item_number} does not exist yet. Generate the item first before regenerating choices.',
                        'assessment_id': str(target_assessment.assessment_id),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        section_key = _normalize_topic_key(target_section.get('section_title'))
        matched_module = section_module_matches.get(section_key)
        module_excerpt = _module_prompt_excerpt(matched_module) if matched_module else ''

        search_query = request.data.get('search_query') or (
            f"{course.course_title} {source['assessment_name']} {target_section.get('section_title')} MCQ"
        )
        top_k = max(1, _to_int(request.data.get('top_k'), 3))
        global_rag = semantic_search_with_summary(
            search_query, institution_id=request.user.institution_id, top_k=top_k,
        )
        course_rag = course_semantic_search_with_summary(
            query=search_query,
            course=course,
            top_k=top_k,
            selected_doc_ids=selected_doc_ids if selected_doc_ids else None,
        )
        all_chunks = course_rag['chunks'] + global_rag['chunks']
        combined_summary = "\n\n".join(filter(None, [course_rag['context_summary'], global_rag['context_summary']]))

        related_context = 'None'
        if related_item:
            related_rubric = related_item.rubric if isinstance(related_item.rubric, dict) else {}
            related_choices = '\n'.join(str(c) for c in (related_rubric.get('choices') or []))
            related_context = (
                f"Related Item #{related_item_number}:\n"
                f"Question: {related_item.question_text}\n"
                f"Choices:\n{related_choices or '-'}\n"
                f"Correct Answer: {related_rubric.get('correct_answer') or ''}\n"
                f"Answer Key: {related_rubric.get('answer_key') or ''}"
            )

        manual_mode = isinstance(manual_item, dict) and bool(str(manual_item.get('question_text') or '').strip())
        item_blueprint_json = json.dumps(target_item_blueprint, ensure_ascii=False, indent=2)

        if manual_mode:
            parsed_item = {
                'item_type': str(manual_item.get('item_type') or 'Multiple Choice'),
                'question_text': str(manual_item.get('question_text') or '').strip(),
                'choices': manual_item.get('choices') or [],
                'correct_answer': str(manual_item.get('correct_answer') or 'A').strip()[:1].upper() or 'A',
                'answer_key': str(manual_item.get('answer_key') or '').strip(),
                'points': max(0, _to_int(manual_item.get('points'), _to_int(target_item_blueprint.get('points'), 0))),
                'bloom_level': str(manual_item.get('bloom_level') or target_item_blueprint.get('bloom_level') or '').strip(),
                'bloom_verb': str(manual_item.get('bloom_verb') or target_item_blueprint.get('bloom_verb') or '').strip(),
                'ilo_refs': [
                    str(v).strip()
                    for v in (manual_item.get('ilo_refs') or target_item_blueprint.get('ilo_refs') or [])
                    if str(v).strip()
                ],
                'exam_label': str(manual_item.get('exam_label') or target_item_blueprint.get('exam_label') or source['assessment_name']),
                'section_title': str(manual_item.get('section_title') or target_item_blueprint.get('section_title') or '').strip(),
            }
        else:
            system_prompt = (
                'You are an expert university assessment designer. '
                'Generate exactly one high-quality MCQ as strict JSON. '
                'Return JSON only with no markdown and no extra text.'
            )
            if regenerate_choices_only:
                existing_rubric = existing_item.rubric if isinstance(existing_item.rubric, dict) else {}
                existing_choices = existing_rubric.get('choices') or []
                existing_answer = existing_rubric.get('correct_answer') or ''
                user_prompt = f"""Regenerate ONLY the choices and correct answer for an existing MCQ item.

Course: {course.course_title} ({course.course_code})
Assessment: {source['assessment_name']}
Target Item Number: {target_item_number}
Section Topic: {target_section.get('section_title')}
Bloom Level: {target_item_blueprint.get('bloom_level') or ''}

EXISTING QUESTION TEXT (keep exactly as-is):
{existing_item.question_text}

CURRENT CHOICES:
{json.dumps(existing_choices, ensure_ascii=False)}
CURRENT CORRECT ANSWER: {existing_answer}

REFERENCE MATERIAL:
{CoTPromptBuilder._format_context(all_chunks, combined_summary)}

MATCHED MODULE CONTEXT:
{module_excerpt or 'No matched saved module for this section.'}

BLUEPRINT ITEM (preserve item_number, section_title, bloom_level, bloom_verb, ilo_refs):
{item_blueprint_json}

Requirements:
1. Return ONE JSON object only.
2. Keep the SAME question_text (copy exactly from EXISTING QUESTION TEXT above).
3. Generate FRESH, plausible-but-wrong distractors as choices (exactly 4 options: A, B, C, D).
4. Set correct_answer to the letter of the correct choice (A, B, C, or D).
5. Include a new answer_key with a brief explanation of why the correct answer is right.
6. Include ALL other keys: item_number, item_type, section_title, exam_label, bloom_level, bloom_verb, ilo_refs, points (use blueprint values).
7. bloom_level MUST exactly match the blueprint bloom_level ({target_item_blueprint.get('bloom_level') or 'as specified'}).
"""
            else:
                user_prompt = f"""Generate ONE assessment item as strict JSON.

Course: {course.course_title} ({course.course_code})
Assessment: {source['assessment_name']}
Target Item Number: {target_item_number}
Section Topic: {target_section.get('section_title')}

REFERENCE MATERIAL:
{CoTPromptBuilder._format_context(all_chunks, combined_summary)}

MATCHED MODULE CONTEXT:
{module_excerpt or 'No matched saved module for this section.'}

RELATED ITEM CONTEXT (optional):
{related_context}

RELATION INSTRUCTION (optional):
{relation_instruction or 'None'}

BLUEPRINT ITEM (preserve item_number, section_title, bloom_level, bloom_verb, ilo_refs):
{item_blueprint_json}

Requirements:
1. Return ONE JSON object only.
2. Keep the same item_number.
3. Include keys: item_number, item_type, section_title, exam_label, bloom_level, bloom_verb, ilo_refs, question_text, choices, correct_answer, points, answer_key.
4. choices must have exactly 4 options (A, B, C, D only) and correct_answer must be A, B, C, or D.
5. bloom_level MUST exactly match the blueprint bloom_level ({target_item_blueprint.get('bloom_level') or 'as specified'}). Do not use any other Bloom level.
6. If relation context is provided, the item should be meaningfully related but not a duplicate.
"""

        llm = LLMService()
        raw_item = ''
        if not manual_mode:
            raw_item = llm.generate_response_with_fallback(
                messages=[{'role': 'user', 'content': user_prompt}],
                preferred_provider=provider,
                system=system_prompt,
                max_tokens=1800,
            )

        def _parse_single_item_json(text):
            clean = str(text or '').strip()
            clean = re.sub(r'^```(?:json)?\s*', '', clean)
            clean = re.sub(r'\s*```$', '', clean)
            clean = clean.strip()
            if not clean:
                return None
            try:
                parsed = json.loads(clean)
                return parsed if isinstance(parsed, dict) else None
            except json.JSONDecodeError:
                match = re.search(r'\{.*\}', clean, re.DOTALL)
                if not match:
                    return None
                try:
                    parsed = json.loads(match.group(0))
                    return parsed if isinstance(parsed, dict) else None
                except json.JSONDecodeError:
                    return None

        parsed_item = parsed_item if manual_mode else _parse_single_item_json(raw_item)
        if not parsed_item:
            return Response(
                {
                    'success': False,
                    'detail': 'Item generation did not return valid JSON. Please retry this item.',
                    'assessment_id': str(target_assessment.assessment_id),
                    'item_by_item_mode': True,
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        normalized_item = {
            'item_number': target_item_number,
            'item_type': str(parsed_item.get('item_type') or 'Multiple Choice'),
            'section_title': target_section.get('section_title') or target_item_blueprint.get('section_title'),
            'exam_label': str(parsed_item.get('exam_label') or target_item_blueprint.get('exam_label') or source['assessment_name']),
            'bloom_level': str(target_item_blueprint.get('bloom_level') or parsed_item.get('bloom_level') or '').strip(),
            'bloom_verb': str(parsed_item.get('bloom_verb') or target_item_blueprint.get('bloom_verb') or '').strip(),
            'ilo_refs': [
                str(v).strip()
                for v in (parsed_item.get('ilo_refs') or target_item_blueprint.get('ilo_refs') or [])
                if str(v).strip()
            ],
            'question_text': (
                existing_item.question_text
                if existing_item and regenerate_choices_only
                else str(parsed_item.get('question_text') or '').strip()
            ),
            'choices': _normalize_choices(parsed_item.get('choices')),
            'correct_answer': str(parsed_item.get('correct_answer') or 'A').strip()[:1].upper() or 'A',
            'answer_key': str(parsed_item.get('answer_key') or '').strip(),
            'points': max(0, _to_int(parsed_item.get('points'), _to_int(target_item_blueprint.get('points'), 0))),
        }

        if not manual_mode:
            quality_errors = _generated_item_quality_errors(normalized_item)
            if quality_errors:
                return Response(
                    {
                        'success': False,
                        'detail': 'Generated item is incomplete. Expected question, 4+ real choices, correct answer, and explanation.',
                        'errors': quality_errors,
                        'assessment_id': str(target_assessment.assessment_id),
                        'item_by_item_mode': True,
                    },
                    status=status.HTTP_502_BAD_GATEWAY,
                )

        rubric_payload = {
            'item_number': normalized_item['item_number'],
            'section_title': normalized_item['section_title'],
            'exam_label': normalized_item['exam_label'],
            'bloom_level': normalized_item['bloom_level'],
            'bloom_verb': normalized_item['bloom_verb'],
            'ilo_refs': normalized_item['ilo_refs'],
            'choices': normalized_item['choices'],
            'correct_answer': normalized_item['correct_answer'],
            'answer_key': normalized_item['answer_key'],
            'points': normalized_item['points'],
            'assessment_name': source['assessment_name'],
            'assessment_code': source['assessment_code'],
            'assessment_task_label': source['assessment_task_label'],
            'assessment_total_items': total_generated,
            'matched_module_id': str(matched_module.module_id) if matched_module else None,
            'matched_module_title': matched_module.module_title if matched_module else '',
            'matched_module_week': matched_module.week_number if matched_module else None,
            'item_by_item_generated': True,
            'related_item_number': related_item_number or None,
            'relation_instruction': relation_instruction,
            'regenerate_choices_only': regenerate_choices_only,
        }

        if existing_item:
            existing_item.module = matched_module
            existing_item.question_text = normalized_item['question_text']
            existing_item.item_type = source['assessment_type']
            existing_item.difficulty = normalized_item.get('bloom_level') or ''
            existing_item.rubric = rubric_payload
            existing_item.save(update_fields=['module', 'question_text', 'item_type', 'difficulty', 'rubric'])
        else:
            AssessmentItem.objects.create(
                assessment=target_assessment,
                module=matched_module,
                question_text=normalized_item['question_text'],
                item_type=source['assessment_type'],
                difficulty=normalized_item.get('bloom_level') or '',
                rubric=rubric_payload,
            )

        existing_counts = _assessment_existing_topic_bloom_counts(target_assessment)
        tos_counters = _build_tos_counters(source['topic_rows'], existing_counts)
        next_item_number = _next_missing_item_number(target_assessment, total_generated)

        next_status = 'Generated' if next_item_number is None else 'Draft'
        if target_assessment.status != next_status:
            target_assessment.status = next_status
            target_assessment.generated_at = timezone.now()
            target_assessment.save(update_fields=['status', 'generated_at'])

        return Response(
            {
                'success': True,
                'item_by_item_mode': True,
                'generated_item_number': target_item_number,
                'next_item_number': next_item_number,
                'assessment': {
                    'assessment_id': str(target_assessment.assessment_id),
                    'title': target_assessment.title,
                    'assessment_type': target_assessment.assessment_type,
                    'term': target_assessment.term,
                    'status': target_assessment.status,
                    'generated_at': target_assessment.generated_at,
                    'target_total_items': total_generated,
                },
                'item': normalized_item,
                'tos_counters': tos_counters,
                'total_items': total_generated,
            },
            status=status.HTTP_201_CREATED,
        )

    if use_manual_input:
        target_assessment = None
        if assessment_id:
            target_assessment = Assessment.objects.filter(
                assessment_id=assessment_id,
                course=course,
            ).first()
            if not target_assessment:
                return Response(
                    {
                        'success': False,
                        'detail': 'assessment_id was not found for this course.',
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            target_assessment = Assessment.objects.create(
                course=course,
                title=assessment_title,
                assessment_type=source['assessment_type'],
                term=term,
                status='Draft',
                generated_at=timezone.now(),
            )

        existing_counts = _assessment_existing_topic_bloom_counts(target_assessment)
        normalized_manual_items, manual_errors, projected_counts = _manual_item_payloads(
            manual_items,
            source['topic_rows'],
            existing_counts,
            source['assessment_type'],
        )
        if manual_errors:
            return Response(
                {
                    'success': False,
                    'detail': 'Manual item validation failed against TOS topic/Bloom allocations.',
                    'errors': manual_errors,
                    'manual_entry_allowed': True,
                    'assessment_id': str(target_assessment.assessment_id),
                    'tos_counters': _build_tos_counters(source['topic_rows'], existing_counts),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        next_item_number = _next_item_number_for_assessment(target_assessment)
        create_items = []
        for item in normalized_manual_items:
            section_key = _normalize_topic_key(item.get('section_title'))
            matched_module = section_module_matches.get(section_key)
            create_items.append(
                AssessmentItem(
                    assessment=target_assessment,
                    module=matched_module,
                    question_text=item['question_text'],
                    item_type=item['item_type'],
                    difficulty=item.get('bloom_level') or '',
                    rubric={
                        'item_number': next_item_number,
                        'section_title': item.get('section_title'),
                        'exam_label': source['assessment_name'],
                        'bloom_level': item.get('bloom_level'),
                        'bloom_verb': item.get('bloom_verb') or '',
                        'ilo_refs': item.get('ilo_refs') or [],
                        'choices': _normalize_choices(item.get('choices')),
                        'correct_answer': str(item.get('correct_answer') or 'A').strip()[:1].upper() or 'A',
                        'answer_key': item.get('answer_key') or '',
                        'points': item.get('points') or 0,
                        'assessment_name': source['assessment_name'],
                        'assessment_code': source['assessment_code'],
                        'assessment_task_label': source['assessment_task_label'],
                        'manual_input': True,
                        'matched_module_id': str(matched_module.module_id) if matched_module else None,
                        'matched_module_title': matched_module.module_title if matched_module else '',
                        'matched_module_week': matched_module.week_number if matched_module else None,
                    },
                )
            )
            next_item_number += 1

        if create_items:
            AssessmentItem.objects.bulk_create(create_items)

        final_counters = _build_tos_counters(source['topic_rows'], projected_counts)
        if final_counters.get('is_complete'):
            target_assessment.status = 'Generated'
            target_assessment.generated_at = timezone.now()
            target_assessment.save(update_fields=['status', 'generated_at'])

        return Response(
            {
                'success': True,
                'manual_entry_mode': True,
                'assessment': {
                    'assessment_id': str(target_assessment.assessment_id),
                    'title': target_assessment.title,
                    'assessment_type': target_assessment.assessment_type,
                    'term': target_assessment.term,
                    'status': target_assessment.status,
                    'generated_at': target_assessment.generated_at,
                },
                'saved_items': len(create_items),
                'tos_counters': final_counters,
                'total_items': final_counters.get('current_total', 0),
            },
            status=status.HTTP_201_CREATED,
        )

    # Build assessment-generation context like the module pipeline: combine course-specific
    # document chunks with global knowledge-base context, then ask the LLM to populate the
    # section blueprint with actual item text, rubrics, and answer keys.
    search_query = request.data.get('search_query') or f"{course.course_title} {source['assessment_name']} assessment items TOS blooms score distribution"
    global_rag = semantic_search_with_summary(
        search_query,
        institution_id=request.user.institution_id,
        top_k=max(1, _to_int(request.data.get('top_k'), 5)),
    )
    course_rag = course_semantic_search_with_summary(
        query=search_query,
        course=course,
        top_k=max(1, _to_int(request.data.get('top_k'), 5)),
        selected_doc_ids=selected_doc_ids if selected_doc_ids else None,
    )
    all_chunks = course_rag['chunks'] + global_rag['chunks']
    combined_summary = "\n\n".join(filter(None, [course_rag['context_summary'], global_rag['context_summary']]))
    section_module_context = _build_section_module_context(sections, section_module_matches)

    logger.info(
        'Assessment generation module grounding: matched_sections=%d total_sections=%d course_id=%s',
        len(section_module_matches),
        len(sections),
        str(course.course_id),
    )

    system_prompt = (
        "You are an expert university assessment designer with deep knowledge of Outcome-Based Education, "
        "Bloom's Taxonomy, and the Table of Specifications (TOS). You create rigorous, fair assessments "
        "that are aligned to syllabus section blueprints. Return ONLY valid JSON. No markdown fences, no commentary."
    )

    # Update blueprint to require MCQ structure
    # Add MCQ fields to each item in each section
    def _mcqify_section(section):
        for item in section.get('items', []):
            item.setdefault('item_type', 'Multiple Choice')
            item.setdefault('choices', ["A. ...", "B. ...", "C. ...", "D. ..."])
            item.setdefault('correct_answer', "A")
        return section

    mcq_sections = [_mcqify_section(dict(s)) for s in sections]
    blueprint_json = json.dumps(
        {
            'title': assessment_title,
            'assessment_type': source['assessment_type'],
            'term': term,
            'total_items': total_generated,
            'sections': mcq_sections,
        },
        ensure_ascii=False,
        indent=2,
    )

    user_prompt = f"""REFERENCE MATERIAL FROM KNOWLEDGE BASE:
{CoTPromptBuilder._format_context(all_chunks, combined_summary)}

SAVED COURSE MODULE CONTEXT (same course, matched by section topic):
{section_module_context or 'No saved module matched the current section topics. Use the knowledge-base context and keep topic alignment strict.'}

TASK: Produce a complete assessment using the syllabus blueprint below.

Course Name      : {course.course_title}
Course Code      : {course.course_code}
Assessment Type  : {source['assessment_name']}
Total Items      : {total_generated}
Term             : {term or 'N/A'}
Extra Instructions: {extra_instructions or 'None'}

SYLLABUS BLUEPRINT (must be preserved exactly in structure):
{blueprint_json}

REQUIREMENTS:
1. ALL items must be MULTIPLE CHOICE QUESTIONS (MCQs) with exactly 4 choices each (A, B, C, D only).
2. For each item, provide:
     - The question stem in "question_text"
     - A "choices" array (e.g., ["A. ...", "B. ...", "C. ...", "D. ..."])
     - The correct answer letter in "correct_answer" (e.g., "B")
     - An explanation or answer key in "answer_key"
3. Keep the same sections and item numbers as the blueprint.
4. For each section, ground item content primarily on that section's matched saved module context. If no module is matched, use the closest RAG evidence.
5. Write original MCQs that match each section title, Bloom level, and ILO references.
6. If a section has multiple items, vary the stems but keep them aligned to the section topic.
7. Use points that sum to 100 across the full assessment.
8. Return strict JSON with this exact top-level shape:
     {{
         "title": string,
         "assessment_type": string,
         "term": string,
         "total_items": number,
         "sections": [
             {{
                 "section_title": string,
                 "exam_label": string,
                 "allocated_items": number,
                 "bloom_distribution": {{...}},
                 "items": [
                     {{
                         "item_number": number,
                         "item_type": string,
                         "question_text": string,
                         "choices": [string],
                         "correct_answer": string,
                         "bloom_level": string,
                         "bloom_verb": string,
                         "ilo_refs": [string],
                         "points": number,
                         "answer_key": string
                     }}
                 ]
             }}
         ]
     }}
"""

    llm = LLMService()
    generated_payload = None
    llm_json_retry_used = False
    llm_json_retry_success = False
    section_retry_used = False
    section_retry_success = False

    def _parse_assessment_json(text):
        """Parse LLM response into JSON payload, supporting fenced blocks."""
        if not isinstance(text, str) or not text.strip():
            return None, 'empty'

        clean = text.strip()
        clean = re.sub(r'^```(?:json)?\s*', '', clean)
        clean = re.sub(r'\s*```$', '', clean)
        clean = clean.strip()

        try:
            return json.loads(clean), None
        except json.JSONDecodeError as decode_err:
            match = re.search(r'\{.*\}', clean, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(0)), None
                except json.JSONDecodeError as nested_decode_err:
                    return None, f'primary={decode_err}; nested={nested_decode_err}'
            return None, str(decode_err)

    def _build_section_generation_prompt(section):
        section_title = str(section.get('section_title') or '').strip()
        section_key = _normalize_topic_key(section_title)
        matched_module = section_module_matches.get(section_key)
        section_blueprint = json.dumps(section, ensure_ascii=False, indent=2)
        module_excerpt = _module_prompt_excerpt(matched_module) if matched_module else 'No matched saved module for this section.'
        summary_excerpt = combined_summary[:2500] if combined_summary else 'No summary available.'
        return f"""Generate ONLY one assessment section as valid JSON.

Course Name: {course.course_title}
Course Code: {course.course_code}
Assessment: {source['assessment_name']}
Section Topic: {section_title}

REFERENCE SUMMARY:
{summary_excerpt}

MATCHED SAVED MODULE:
{module_excerpt}

SECTION BLUEPRINT:
{section_blueprint}

Requirements:
1. Return one JSON object with keys \"section_title\", \"exam_label\", \"allocated_items\", \"bloom_distribution\", and \"items\".
2. Preserve the same section title and item numbers from the blueprint.
3. Every item must be an MCQ with exactly 4 choices (A-D).
4. Every item must include: item_number, item_type, question_text, choices, correct_answer, bloom_level, bloom_verb, ilo_refs, points, answer_key.
5. Write complete question stems and plausible distractors grounded in the section topic.
6. Return ONLY valid JSON. No markdown, no prose.
"""

    def _generate_sections_individually():
        generated_sections = []
        for section in mcq_sections:
            section_prompt = _build_section_generation_prompt(section)
            section_raw = llm.generate_response_with_fallback(
                messages=[{'role': 'user', 'content': section_prompt}],
                preferred_provider=provider,
                system=system_prompt,
                max_tokens=2500,
            )
            parsed_section, section_error = _parse_assessment_json(section_raw)
            if not isinstance(parsed_section, dict):
                raise ValueError(f"Section generation failed for {section.get('section_title')}: {section_error}")
            generated_sections.append(parsed_section)
        return {
            'title': assessment_title,
            'assessment_type': source['assessment_type'],
            'term': term,
            'total_items': total_generated,
            'sections': generated_sections,
        }

    def _payload_quality_issues(payload):
        issues = []
        if not isinstance(payload, dict):
            return ['payload is not an object.']
        sections_payload = payload.get('sections')
        if not isinstance(sections_payload, list):
            return ['sections is missing or not a list.']

        for section in sections_payload:
            if not isinstance(section, dict):
                issues.append('section entry is not an object.')
                continue
            section_title = str(section.get('section_title') or '').strip() or 'Untitled Section'
            items = section.get('items') if isinstance(section.get('items'), list) else []
            for item in items:
                if not isinstance(item, dict):
                    issues.append(f'{section_title}: item is not an object.')
                    continue
                item_no = _to_int(item.get('item_number'), 0)
                item_errors = _generated_item_quality_errors(item)
                if item_errors:
                    issues.append(
                        f'{section_title} item #{item_no or "?"}: ' + '; '.join(item_errors)
                    )
        return issues

    try:
        raw_text = llm.generate_response_with_fallback(
            messages=[{'role': 'user', 'content': user_prompt}],
            preferred_provider=provider,
            system=system_prompt,
            max_tokens=4000,
        )
        generated_payload, parse_error = _parse_assessment_json(raw_text)

        if not generated_payload:
            llm_json_retry_used = True
            logger.warning(
                'Assessment LLM initial response was not valid JSON; retrying once with strict JSON-only repair prompt. error=%s',
                parse_error,
            )

            repair_prompt = f"""Your previous response was not valid JSON.

Return ONLY valid JSON, with no markdown fences and no extra commentary.
Keep the exact same top-level shape and semantics requested earlier.

Required top-level shape:
{{
  "title": string,
  "assessment_type": string,
  "term": string,
  "total_items": number,
  "sections": [
    {{
      "section_title": string,
      "exam_label": string,
      "allocated_items": number,
      "bloom_distribution": object,
      "items": [
        {{
          "item_number": number,
          "item_type": string,
          "question_text": string,
                    "choices": [string],
                    "correct_answer": string,
          "bloom_level": string,
          "bloom_verb": string,
          "ilo_refs": [string],
          "points": number,
          "answer_key": string
        }}
      ]
    }}
  ]
}}

Original task prompt:
{user_prompt}

Previous invalid response:
{raw_text}
"""

            repaired_text = llm.generate_response_with_fallback(
                messages=[{'role': 'user', 'content': repair_prompt}],
                preferred_provider=provider,
                system=system_prompt,
                max_tokens=4000,
            )
            generated_payload, retry_error = _parse_assessment_json(repaired_text)
            if generated_payload:
                llm_json_retry_success = True
            else:
                logger.warning(
                    'Assessment LLM retry also returned invalid JSON; attempting per-section MCQ generation. error=%s',
                    retry_error,
                )
                section_retry_used = True
                generated_payload = _generate_sections_individually()
                section_retry_success = True
    except Exception:
        logger.exception('Assessment LLM generation failed before valid MCQ payload was produced')

    if isinstance(generated_payload, dict) and isinstance(generated_payload.get('sections'), list):
        payload_issues = _payload_quality_issues(generated_payload)
        if payload_issues:
            logger.warning(
                'Assessment LLM returned incomplete MCQ payload; attempting per-section regeneration. issues=%s',
                payload_issues[:8],
            )
            if not section_retry_used:
                section_retry_used = True
                try:
                    generated_payload = _generate_sections_individually()
                    section_retry_success = True
                except Exception:
                    logger.exception('Per-section regeneration failed after incomplete payload validation')
                    generated_payload = None

            if generated_payload:
                post_retry_issues = _payload_quality_issues(generated_payload)
                if post_retry_issues:
                    logger.warning(
                        'Assessment payload still incomplete after per-section regeneration. issues=%s',
                        post_retry_issues[:8],
                    )
                    generated_payload = None

    llm_json_blueprint_fallback_used = not (
        isinstance(generated_payload, dict)
        and isinstance(generated_payload.get('sections'), list)
    )
    logger.info(
        'Assessment LLM JSON metrics: retry_used=%s retry_success=%s section_retry_used=%s section_retry_success=%s blueprint_fallback=%s course_id=%s assessment=%s',
        llm_json_retry_used,
        llm_json_retry_success,
        section_retry_used,
        section_retry_success,
        llm_json_blueprint_fallback_used,
        str(course.course_id),
        source['assessment_name'],
    )

    if llm_json_blueprint_fallback_used:
        fallback_assessment = Assessment.objects.create(
            course=course,
            title=assessment_title,
            assessment_type=source['assessment_type'],
            term=term,
            status='Draft',
            generated_at=timezone.now(),
        )
        return Response(
            {
                'success': False,
                'detail': 'Assessment generation did not return valid MCQ JSON. Please retry with fewer items or narrower topics.',
                'manual_entry_allowed': True,
                'assessment_id': str(fallback_assessment.assessment_id),
                'tos_counters': _build_tos_counters(source['topic_rows'], {}),
                'manual_item_schema': {
                    'manual_items': [
                        {
                            'section_title': 'Topic from TOS',
                            'bloom_level': 'Remember|Understand|Apply|Analyze|Evaluate|Create',
                            'question_text': 'Question stem',
                            'choices': ['A. ...', 'B. ...', 'C. ...', 'D. ...'],
                            'correct_answer': 'A',
                            'answer_key': 'Explanation of the answer',
                            'ilo_refs': ['ILO 1'],
                            'points': 1,
                        }
                    ],
                    'assessment_id': str(fallback_assessment.assessment_id),
                },
            },
            status=status.HTTP_502_BAD_GATEWAY,
        )

    if isinstance(generated_payload, dict) and isinstance(generated_payload.get('sections'), list):
        # Normalize the returned JSON against the blueprint so the UI can render it reliably.
        sections_by_title = {str(s.get('section_title')): s for s in mcq_sections}
        normalized_sections = []
        running_total = 0
        for section in generated_payload.get('sections', []):
            if not isinstance(section, dict):
                continue
            title_key = str(section.get('section_title') or '').strip()
            blueprint_section = sections_by_title.get(title_key)
            if not blueprint_section:
                continue
            items = []
            for idx, item in enumerate(section.get('items') or [], start=1):
                if not isinstance(item, dict):
                    continue
                points = _to_int(item.get('points'), 0)
                running_total += points
                items.append(
                    {
                        'item_number': _to_int(item.get('item_number'), idx),
                        'item_type': str(item.get('item_type') or 'Multiple Choice'),
                        'section_title': blueprint_section['section_title'],
                        'exam_label': str(item.get('exam_label') or blueprint_section['exam_label']),
                        'bloom_level': str(item.get('bloom_level') or '').strip(),
                        'bloom_verb': str(item.get('bloom_verb') or '').strip(),
                        'ilo_refs': [str(v) for v in (item.get('ilo_refs') or blueprint_section.get('ilos') or []) if str(v).strip()],
                        'question_text': str(item.get('question_text') or '').strip(),
                        'choices': _normalize_choices(item.get('choices')),
                        'correct_answer': str(item.get('correct_answer') or 'A').strip()[:1].upper() or 'A',
                        'answer_key': str(item.get('answer_key') or '').strip(),
                        'points': points,
                    }
                )

            normalized_sections.append(
                {
                    'section_title': blueprint_section['section_title'],
                    'exam_label': blueprint_section['exam_label'],
                    'allocated_items': blueprint_section['allocated_items'],
                    'bloom_distribution': blueprint_section['bloom_distribution'],
                    'items': items or blueprint_section['items'],
                }
            )

        if normalized_sections:
            sections = normalized_sections
            total_generated = sum(len(s['items']) for s in sections)

    assessment = Assessment.objects.create(
        course=course,
        title=assessment_title,
        assessment_type=source['assessment_type'],
        term=term,
        status='Generated',
        generated_at=timezone.now(),
    )

    create_items = []
    for section in sections:
        section_key = _normalize_topic_key(section.get('section_title'))
        matched_module = section_module_matches.get(section_key)
        for item in section['items']:
            create_items.append(
                AssessmentItem(
                    assessment=assessment,
                    module=matched_module,
                    question_text=str(item.get('question_text') or '').strip() or f"{item.get('item_number')}. Item",
                    item_type=source['assessment_type'],
                    difficulty=item.get('bloom_level') or '',
                    rubric={
                        'item_number': item.get('item_number'),
                        'section_title': item.get('section_title'),
                        'exam_label': item.get('exam_label'),
                        'bloom_level': item.get('bloom_level'),
                        'bloom_verb': item.get('bloom_verb'),
                        'ilo_refs': item.get('ilo_refs') or [],
                        'choices': _normalize_choices(item.get('choices')),
                        'correct_answer': str(item.get('correct_answer') or 'A').strip()[:1].upper() or 'A',
                        'answer_key': item.get('answer_key') or '',
                        'points': item.get('points') or 0,
                        'assessment_name': source['assessment_name'],
                        'assessment_code': source['assessment_code'],
                        'assessment_task_label': source['assessment_task_label'],
                        'assessment_total_items': total_generated,
                        'matched_module_id': str(matched_module.module_id) if matched_module else None,
                        'matched_module_title': matched_module.module_title if matched_module else '',
                        'matched_module_week': matched_module.week_number if matched_module else None,
                    },
                )
            )

    if create_items:
        AssessmentItem.objects.bulk_create(create_items)

    return Response(
        {
            'success': True,
            'assessment': {
                'assessment_id': str(assessment.assessment_id),
                'title': assessment.title,
                'assessment_type': assessment.assessment_type,
                'term': assessment.term,
                'status': assessment.status,
                'generated_at': assessment.generated_at,
                'target_total_items': total_generated,
            },
            'sections': sections,
            'total_items': total_generated,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "DELETE"])
@permission_classes([IsAuthenticated])
def get_assessment_detail(request, assessment_id):
    """Return one assessment grouped by sections with Bloom/item metadata, or delete it."""
    if not _is_faculty_user(request):
        return _faculty_only_response()

    try:
        assessment = Assessment.objects.select_related('course').get(assessment_id=assessment_id)
    except Assessment.DoesNotExist:
        return Response(
            {'success': False, 'detail': 'Assessment not found.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    _, error_response = _get_assigned_course_or_403(request, assessment.course.course_id)
    if error_response:
        return error_response

    if request.method == "GET":
        return Response({'success': True, 'assessment': _assessment_detail_payload(assessment)})

    # DELETE: remove assessment and related items.
    assessment_id_str = str(assessment.assessment_id)
    assessment.delete()
    return Response(
        {'success': True, 'detail': 'Assessment deleted successfully.', 'assessment_id': assessment_id_str},
        status=status.HTTP_200_OK,
    )


def _apply_item_answer_to_sheets(item):
    """Copy the item's correct answer into the answer key of every bubble sheet
    for its assessment, then re-score the scanned sheets."""
    from apps.grading.models import BubbleSheetTemplate
    from apps.grading.views import regrade_template_scans

    rubric = item.rubric if isinstance(item.rubric, dict) else {}
    number = _to_int(rubric.get('item_number'), 0)
    if number < 1:
        return
    answer = str(rubric.get('correct_answer') or '').strip().upper()
    for t in BubbleSheetTemplate.objects.select_for_update().filter(assessment=item.assessment):
        if number > t.total_items:
            continue
        key = dict(t.answer_key or {})
        if answer:
            key[str(number)] = answer
        else:
            key.pop(str(number), None)
        if key == (t.answer_key or {}):
            continue
        t.answer_key = key
        t.save(update_fields=['answer_key', 'updated_at'])
        regrade_template_scans(t)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_assessment_item(request, item_id):
    """
    Update an assessment item's question text, choices, correct answer, and/or answer key.

    PATCH /curriculum/assessment-item/<item_id>/

    Body (all fields optional):
      question_text   str
      choices         list[str]  (exactly 4 items, A-D)
      correct_answer  str        single letter A-D
      answer_key      str        explanation/rationale
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    try:
        item = AssessmentItem.objects.select_related('assessment__course').get(item_id=item_id)
    except AssessmentItem.DoesNotExist:
        return Response(
            {'success': False, 'detail': 'Assessment item not found.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    _, error_response = _get_assigned_course_or_403(request, item.assessment.course.course_id)
    if error_response:
        return error_response

    data = request.data
    update_fields = []

    if 'question_text' in data:
        question_text = str(data['question_text'] or '').strip()
        if not question_text:
            return Response(
                {'success': False, 'detail': 'question_text cannot be empty.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        item.question_text = question_text
        update_fields.append('question_text')

    rubric = item.rubric if isinstance(item.rubric, dict) else {}

    if 'choices' in data:
        raw_choices = data['choices']
        if not isinstance(raw_choices, list):
            return Response(
                {'success': False, 'detail': 'choices must be a list.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        normalized = _normalize_choices(raw_choices)
        if len(normalized) != 4:
            return Response(
                {'success': False, 'detail': 'choices must include exactly 4 options (A-D).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        rubric['choices'] = normalized

    if 'correct_answer' in data:
        answer = str(data['correct_answer'] or '').strip()[:1].upper()
        if answer and answer not in 'ABCD*':
            return Response(
                {'success': False, 'detail': 'correct_answer must be A–D or * (bonus).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        rubric['correct_answer'] = answer

    if 'answer_key' in data:
        rubric['answer_key'] = str(data['answer_key'] or '').strip()

    if any(k in data for k in ('choices', 'correct_answer', 'answer_key')):
        item.rubric = rubric
        update_fields.append('rubric')

    if not update_fields:
        return Response(
            {'success': False, 'detail': 'No updatable fields provided.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        item.save(update_fields=update_fields)
        if 'correct_answer' in data:
            _apply_item_answer_to_sheets(item)

    metadata = item.rubric if isinstance(item.rubric, dict) else {}
    customization = InstitutionCustomization.objects.filter(institution=request.user.institution).first()
    return Response({
        'customization': {
            'header_image_url': customization.header_image_url if customization else '',
            'footer_image_url': customization.footer_image_url if customization else '',
            'header_text': customization.header_text if customization else '',
            'footer_text': customization.footer_text if customization else '',
            'syllabus_sections': customization.syllabus_sections if customization else [],
            'field_labels': customization.field_labels if customization else {},
        },
        'success': True,
        'item': {
            'item_id': str(item.item_id),
            'item_number': _to_int(metadata.get('item_number'), 0),
            'item_type': item.item_type,
            'question_text': item.question_text,
            'choices': metadata.get('choices') or [],
            'correct_answer': metadata.get('correct_answer') or '',
            'answer_key': metadata.get('answer_key') or '',
            'bloom_level': metadata.get('bloom_level') or '',
            'bloom_verb': metadata.get('bloom_verb') or '',
        },
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def export_assessment_docx(request):
    """
    Export assessment sections/items as DOCX.

    Body:
      assessment_id     optional UUID
      assessment_data   optional JSON payload matching assessment detail shape
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    assessment_id = request.data.get('assessment_id')
    payload = None

    if assessment_id:
        try:
            assessment = Assessment.objects.select_related('course').get(assessment_id=assessment_id)
        except Assessment.DoesNotExist:
            return Response(
                {'success': False, 'error': 'Assessment not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        _, error_response = _get_assigned_course_or_403(request, assessment.course.course_id)
        if error_response:
            return error_response
        payload = _assessment_detail_payload(assessment)

    if payload is None:
        raw_data = request.data.get('assessment_data', '{}')
        if isinstance(raw_data, str):
            try:
                payload = json.loads(raw_data)
            except json.JSONDecodeError:
                return Response(
                    {'success': False, 'error': 'Invalid assessment_data JSON.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            payload = raw_data

    if not isinstance(payload, dict):
        return Response(
            {'success': False, 'error': 'assessment_data must be a JSON object.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        from io import BytesIO
        from django.http import HttpResponse

        include_choices = _to_bool(request.data.get('include_choices'), True)
        include_answer_key = _to_bool(request.data.get('include_answer_key'), True)
        doc = _build_plain_assessment_docx(
            payload,
            include_choices=include_choices,
            include_answer_key=include_answer_key,
        )
        safe_title = str(payload.get('title') or 'assessment').replace('/', '-').replace(' ', '_')
        suffix = 'answer_key' if include_answer_key else 'exam'
        filename = f'{safe_title}_{suffix}.docx'

        buffer = BytesIO()
        doc.save(buffer)
        buffer.seek(0)

        http_response = HttpResponse(
            buffer.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )
        http_response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return http_response
    except Exception as exc:
        logger.exception('Error generating DOCX for assessment export')
        return Response(
            {'success': False, 'error': f'Failed to generate DOCX: {exc}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_course(request):
    """Create a new course and auto-assign it to the requesting faculty user."""
    if not _is_faculty_user(request):
        return _faculty_only_response()
    if not request.user.institution_id:
        return Response(
            {"success": False, "detail": "Your account is not linked to an institution."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    course_code = (request.data.get("course_code") or "").strip()
    course_title = (request.data.get("course_title") or "").strip()
    description = (request.data.get("description") or "").strip()

    if not course_code:
        return Response(
            {"success": False, "detail": "course_code is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not course_title:
        return Response(
            {"success": False, "detail": "course_title is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if Course.objects.filter(
        course_code=course_code,
        institution_id=request.user.institution_id,
    ).exists():
        return Response(
            {"success": False, "detail": f"A course with code '{course_code}' already exists."},
            status=status.HTTP_409_CONFLICT,
        )

    course = Course.objects.create(
        institution_id=request.user.institution_id,
        course_code=course_code,
        course_title=course_title,
        description=description or None,
    )
    CourseLoad.objects.create(course=course, faculty=request.user)

    logger.info(
        "Faculty %s created course %s (%s)", request.user.email, course_code, course.course_id
    )

    return Response(
        {
            "success": True,
            "course": {
                "course_id": str(course.course_id),
                "course_code": course.course_code,
                "course_title": course.course_title,
                "description": course.description,
                "syllabus_count": 0,
                "assessment_count": 0,
            },
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def generate_syllabus_field(request):
    """
    Generate or continue a single syllabus field using RAG + LLM.

    Endpoint: POST /api/curriculum/generate-syllabus-field/

    Body (JSON):
    {
        "course_id":        "<uuid>",
        "section":          "tlas",           // syllabus section key
        "field_label":      "TLA Strategies", // human-readable label shown in footer
        "existing_content": "...",            // current field value (used for 'continue')
        "mode":             "generate",       // 'generate' | 'continue'
        "provider":         "groq",           // optional LLM provider
        "top_k":            5                 // optional RAG top-k
    }

    Pipeline:
        1. Validate faculty assignment.
        2. Semantic search over global knowledge base.
        3. Fetch top-3 parent chunks from faculty-uploaded course docs.
        4. Build field-specific CoT prompt.
        5. Call LLM and return the generated text.
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    course_id = request.data.get("course_id")
    section = request.data.get("section", "")
    field_label = request.data.get("field_label", "Syllabus Field")
    existing_content = request.data.get("existing_content", "")
    mode = request.data.get("mode", "generate")
    extra_instructions = str(request.data.get("extra_instructions") or "").strip()[:4000]
    provider = request.data.get("provider") or None
    top_k = max(1, int(request.data.get("top_k", 5)))

    if not course_id:
        return Response(
            {"success": False, "detail": "course_id is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    course, error_response = _get_assigned_course_or_403(request, course_id)
    if error_response:
        return error_response
    trial_response = trial_generation_gate(request.user, syllabus_generation=True)
    if trial_response:
        return trial_response

    try:
        # ── Step 1: Global RAG with progressive summary ────────────────────
        search_query = f"{section} {field_label} {course.course_title} OBE curriculum"
        rag_result = semantic_search_with_summary(
            search_query, institution_id=request.user.institution_id, top_k=top_k,
        )
        global_chunks = rag_result["chunks"]

        # ── Step 2: Course-specific RAG (uploaded faculty documents) ───────
        from apps.integrations.models import ParentChunk  # local import to avoid circular
        course_parent_texts = list(
            ParentChunk.objects
            .filter(records__course=course)
            .order_by("-records__records_id")
            .values_list("parent_content", flat=True)[:3]
        )
        course_chunks = [
            {
                "text": text,
                "document_title": "Uploaded course document",
                "page_number": None,
                "score": 0.5,
            }
            for text in course_parent_texts
        ]

        all_chunks = global_chunks + course_chunks

        # ── Step 3: Build prompt (summary-first, token-efficient) ─────────
        system_prompt, user_prompt = CoTPromptBuilder.build_syllabus_field_prompt(
            course_name=course.course_title,
            course_code=course.course_code,
            field_label=field_label,
            section=section,
            existing_content=existing_content,
            mode=mode,
            context_chunks=all_chunks,
            context_summary=rag_result["context_summary"],
            extra_instructions=extra_instructions,
        )

        # ── Step 4: Call LLM ─────────────────────────────────────────────
        llm = LLMService()
        generated_text, provider_used = llm.generate_response_with_fallback(
            messages=[{"role": "user", "content": user_prompt}],
            preferred_provider=provider,
            system=system_prompt,
            max_tokens=1500,
            return_provider=True,
        )

        logger.info(
            "generate_syllabus_field: section=%r field=%r mode=%r course=%r provider=%r chunks=%d",
            section, field_label, mode, course.course_code, provider_used, len(all_chunks),
        )

        return Response(
            {
                "success": True,
                "generated_text": generated_text,
                "provider_used": provider_used,
                "rag_chunks_used": len(all_chunks),
            },
            status=status.HTTP_200_OK,
        )

    except Exception as exc:
        logger.exception("Error in generate_syllabus_field for course %r", course_id)
        return Response(
            {"success": False, "error": str(exc)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


def _extract_text_from_file(file_obj, filename: str) -> str:
    """Extract raw text from .txt / .docx / .pdf / .xlsx files, then mask PII."""
    from apps.integrations.pii_masking import mask_and_verify

    if filename.endswith(".txt"):
        raw = file_obj.read().decode("utf-8", errors="replace")
        return mask_and_verify(raw, context=f"curriculum:{filename}")

    if filename.endswith(".docx"):
        from docx import Document as DocxDocument  # python-docx
        doc = DocxDocument(file_obj)
        parts = []
        for p in doc.paragraphs:
            if p.text.strip():
                parts.append(p.text)
        for tbl in doc.tables:
            for row in tbl.rows:
                cells = [c.text.strip() for c in row.cells if c.text.strip()]
                if cells:
                    parts.append("\t".join(cells))
        return mask_and_verify("\n".join(parts), context=f"curriculum:{filename}")

    if filename.endswith(".pdf"):
        from pypdf import PdfReader
        reader = PdfReader(file_obj)
        pages = [page.extract_text() or "" for page in reader.pages]
        return mask_and_verify("\n".join(pages), context=f"curriculum:{filename}")

    if filename.endswith(".xlsx"):
        try:
            import openpyxl
        except ImportError:
            raise ValueError("openpyxl is not installed. Run: pip install openpyxl")
        wb = openpyxl.load_workbook(file_obj, data_only=True)
        sheets_text = []
        for ws in wb.worksheets:
            # Build a value map that fills merged cell ranges with the top-left cell value
            merged_map = {}
            for merge_range in ws.merged_cells.ranges:
                top_val = ws.cell(merge_range.min_row, merge_range.min_col).value
                if top_val is not None:
                    for r in range(merge_range.min_row, merge_range.max_row + 1):
                        for c in range(merge_range.min_col, merge_range.max_col + 1):
                            merged_map[(r, c)] = top_val

            lines = [f"=== Sheet: {ws.title} ==="]
            for row in ws.iter_rows():
                row_texts = []
                for cell in row:
                    val = merged_map.get((cell.row, cell.column), cell.value)
                    row_texts.append(str(val).strip() if val is not None else "")
                # Trim trailing empty cells to avoid gigantic tab-heavy rows.
                while row_texts and not row_texts[-1]:
                    row_texts.pop()
                # Only emit rows that have at least one non-empty cell
                if any(t for t in row_texts):
                    lines.append("\t".join(row_texts))
            sheets_text.append("\n".join(lines))
        return mask_and_verify("\n\n".join(sheets_text), context=f"curriculum:{filename}")

    raise ValueError(f"Unsupported file type: {filename}")


# ── DOCX export helpers ────────────────────────────────────────────────────

def _replace_para_placeholders(para, replacements):
    """Replace {{key}} placeholders in a paragraph, handling cross-run splits."""
    full_text = para.text
    new_text = full_text
    for key, value in replacements.items():
        new_text = new_text.replace(key, value)
    # Remove any unresolved placeholders to avoid leaking template tokens.
    new_text = re.sub(r'\{\{\s*[^{}]+\s*\}\}', '', new_text)
    if new_text == full_text:
        return
    if not para.runs:
        para.add_run(new_text)
        return
    para.runs[0].text = new_text
    for run in para.runs[1:]:
        run.text = ''


def _fill_docx_template(doc, data):
    """Replace {{field_name}} placeholders throughout a DOCX document."""
    from docx import Document  # already imported at call site, safe to re-import

    def _template_value_to_text(value):
        if value is None:
            return ''
        if isinstance(value, bool):
            return 'Yes' if value else 'No'
        if isinstance(value, (str, int, float)):
            return str(value)
        if isinstance(value, list):
            if all(not isinstance(item, (dict, list)) for item in value):
                return '\n'.join(str(item) for item in value if item is not None)
            return json.dumps(value, ensure_ascii=False, indent=2)
        if isinstance(value, dict):
            return json.dumps(value, ensure_ascii=False, indent=2)
        return str(value)

    replacements = {
        f'{{{{{k}}}}}': _template_value_to_text(v)
        for k, v in data.items()
    }
    for para in doc.paragraphs:
        _replace_para_placeholders(para, replacements)
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for para in cell.paragraphs:
                    _replace_para_placeholders(para, replacements)
    for section in doc.sections:
        for para in section.header.paragraphs:
            _replace_para_placeholders(para, replacements)
        for para in section.footer.paragraphs:
            _replace_para_placeholders(para, replacements)


def _resolve_institution_branding(course):
    """Pull header/footer branding for a course's institution.

    Returns an empty dict when there is no institution or no customization, so
    callers can always pass the result straight through to the builders.
    """
    institution_id = getattr(course, 'institution_id', None)
    if not institution_id:
        return {}
    customization = InstitutionCustomization.objects.filter(
        institution_id=institution_id,
    ).first()
    if not customization:
        return {}
    return {
        'header_text': customization.header_text or '',
        'footer_text': customization.footer_text or '',
        'header_image': customization.header_image_url or '',
        'footer_image': customization.footer_image_url or '',
        'syllabus_sections': customization.syllabus_sections or [],
    }


def _append_configured_syllabus_fields(doc, data, configured_sections):
    """Append institution-defined custom answers and tables to an exported DOCX."""
    if not isinstance(configured_sections, list):
        return

    custom_subsections = data.get('custom_subsections')
    custom_tables = data.get('custom_tables')
    custom_subsections = custom_subsections if isinstance(custom_subsections, dict) else {}
    custom_tables = custom_tables if isinstance(custom_tables, dict) else {}

    def add_heading(text, level):
        paragraph = doc.add_heading(text, level=level)
        if level == 1 and paragraph.runs:
            from docx.shared import RGBColor
            paragraph.runs[0].font.color.rgb = RGBColor(0x16, 0xA3, 0x4A)

    def add_table(title, columns, rows, column_groups=None):
        headers = [str(column or '').strip() for column in columns]
        if not any(headers):
            return
        add_heading(title, 2)
        groups = [
            str(column_groups[index] or '').strip()
            if isinstance(column_groups, list) and index < len(column_groups)
            else ''
            for index in range(len(headers))
        ]
        has_groups = any(groups)
        table = doc.add_table(rows=2 if has_groups else 1, cols=len(headers))
        table.style = 'Table Grid'
        if has_groups:
            group_cells = table.rows[0].cells
            index = 0
            while index < len(headers):
                label = groups[index]
                end = index + 1
                if label:
                    while end < len(headers) and groups[end] == label:
                        end += 1
                cell = group_cells[index]
                if end - index > 1:
                    cell = cell.merge(group_cells[end - 1])
                cell.text = label
                if cell.paragraphs[0].runs:
                    cell.paragraphs[0].runs[0].bold = True
                index = end
        for index, header in enumerate(headers):
            cell = table.rows[1 if has_groups else 0].cells[index]
            cell.text = header
            if cell.paragraphs[0].runs:
                cell.paragraphs[0].runs[0].bold = True
        for row_values in (rows if isinstance(rows, list) else []):
            if not isinstance(row_values, list):
                continue
            values = []
            for index in range(len(headers)):
                value = row_values[index] if index < len(row_values) else ''
                values.append('' if value is None else str(value))
            if any(value.strip() for value in values):
                cells = table.add_row().cells
                for index, value in enumerate(values):
                    cells[index].text = value

    for configured_section in configured_sections:
        if not isinstance(configured_section, dict) or configured_section.get('enabled') is False:
            continue
        section_key = str(configured_section.get('key') or '')
        section_label = str(configured_section.get('label') or section_key).strip()
        if not section_key or not section_label:
            continue

        section_tables = custom_tables.get(section_key)
        section_tables = section_tables if isinstance(section_tables, dict) else {}
        section_rows = section_tables.get('__section__', [])
        configured_subsections = configured_section.get('subsections')
        configured_subsections = configured_subsections if isinstance(configured_subsections, list) else []
        subsection_values = []
        for subsection in configured_subsections:
            if not isinstance(subsection, dict):
                continue
            subsection_key = str(subsection.get('key') or '')
            subsection_label = str(subsection.get('label') or subsection_key).strip()
            if not subsection_key or not subsection_label:
                continue
            subsection_answers = custom_subsections.get(section_key)
            subsection_answers = subsection_answers if isinstance(subsection_answers, dict) else {}
            answer = str(subsection_answers.get(subsection_key) or '').strip()
            rows = section_tables.get(subsection_key, [])
            columns = subsection.get('table_columns')
            has_table = bool(subsection.get('table_enabled')) and isinstance(columns, list) and bool(columns)
            if answer or has_table:
                subsection_values.append((
                    subsection_label,
                    answer,
                    columns or [],
                    rows,
                    subsection.get('table_column_groups'),
                    has_table,
                ))

        columns = configured_section.get('table_columns')
        has_section_table = bool(configured_section.get('table_enabled')) and isinstance(columns, list) and bool(columns)
        if not (has_section_table or subsection_values):
            continue

        add_heading(section_label, 1)
        if has_section_table:
            add_table(
                f'{section_label} table',
                columns,
                section_rows,
                configured_section.get('table_column_groups'),
            )
        for subsection_label, answer, columns, rows, column_groups, has_table in subsection_values:
            add_heading(subsection_label, 2)
            if answer and not has_table:
                doc.add_paragraph(answer)
            if has_table:
                add_table(subsection_label, columns, rows, column_groups)


def _build_plain_syllabus_docx(data, branding=None):
    """Generate a basic structured DOCX from syllabus data dict."""
    from docx import Document
    from docx.shared import Pt, RGBColor, Inches
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    doc = Document()

    # ── Page margins ───────────────────────────────────────────────────────
    for section in doc.sections:
        section.top_margin    = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin   = Inches(1.25)
        section.right_margin  = Inches(1.25)

    # ── Helpers ───────────────────────────────────────────────────────────
    MAROON = RGBColor(0x8B, 0x00, 0x00)

    def heading(text, level=1):
        p = doc.add_heading(text, level=level)
        if level == 1:
            run = p.runs[0] if p.runs else p.add_run(text)
            run.font.color.rgb = MAROON
        return p

    def row(table, label, value):
        r = table.add_row()
        r.cells[0].text = label
        r.cells[1].text = str(value or '')
        r.cells[0].paragraphs[0].runs[0].bold = True

    def g(key):
        return str(data.get(key) or '')

    # ── Institutional header ───────────────────────────────────────────────
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(g('university_name').replace('\n', ' | '))
    run.bold = True
    run.font.size = Pt(11)

    if g('college'):
        p2 = doc.add_paragraph(g('college'))
        p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p2.runs[0].font.size = Pt(10)

    if g('program'):
        p3 = doc.add_paragraph(g('program'))
        p3.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p3.runs[0].font.size = Pt(10)
        p3.runs[0].bold = True

    doc.add_paragraph()

    # Document title
    p4 = doc.add_paragraph()
    p4.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_run = p4.add_run(g('document_title') or 'Course Information Syllabus (CIS)')
    title_run.bold = True
    title_run.font.size = Pt(14)
    title_run.font.color.rgb = MAROON

    doc.add_paragraph()

    # ── Course specifications table ────────────────────────────────────────
    heading('Course Specifications', level=1)
    tbl = doc.add_table(rows=0, cols=2)
    tbl.style = 'Table Grid'
    tbl.columns[0].width = Inches(2)
    tbl.columns[1].width = Inches(4)

    spec_fields = [
        ('Course Title',       'course_title'),
        ('Course Code',        'course_code'),
        ('Course Category',    'course_category'),
        ('Credit Hours',       'credit_hours'),
        ('Lecture Hours',      'lecture_hours'),
        ('Lab Hours',          'lab_hours'),
        ('Year Level',         'year_level'),
        ('Semester / Year',    'semester_year'),
        ('Prerequisites',      'prerequisites'),
        ('Instructor',         'instructor_name'),
        ('Employee ID',        'employee_id'),
        ('Email',              'instructor_email'),
        ('Contact',            'contact_info'),
        ('Reference CMO',      'reference_cmo'),
        ('Date Prepared',      'date_prepared'),
        ('Revision No.',       'revision_no'),
    ]
    for label, key in spec_fields:
        if g(key):
            row(tbl, label, g(key))

    doc.add_paragraph()

    # ── Vision / Mission ───────────────────────────────────────────────────
    if g('vision') or g('mission'):
        heading('University Direction', level=1)
        if g('vision'):
            heading('Vision', level=2)
            doc.add_paragraph(g('vision'))
        if g('mission'):
            heading('Mission', level=2)
            doc.add_paragraph(g('mission'))

    # ── Course overview ────────────────────────────────────────────────────
    if g('description') or g('rationale'):
        heading('Course Overview', level=1)
        if g('description'):
            heading('Course Description', level=2)
            doc.add_paragraph(g('description'))
        if g('rationale'):
            heading('Rationale', level=2)
            doc.add_paragraph(g('rationale'))

    # ── ILOs ───────────────────────────────────────────────────────────────
    ilos = data.get('ilos') or []
    if ilos and any(ilos):
        heading('Intended Learning Outcomes (ILOs)', level=1)
        for i, ilo in enumerate(ilos, start=1):
            if ilo:
                doc.add_paragraph(f'{i}. {ilo}', style='List Number')

    # ── Weekly schedule (basic) ────────────────────────────────────────────
    chapters = data.get('tla_chapters') or []
    valid_chapters = [c for c in chapters if c.get('chapter') or c.get('topics')]
    if valid_chapters:
        heading('Weekly Schedule / Topics', level=1)
        ch_tbl = doc.add_table(rows=1, cols=4)
        ch_tbl.style = 'Table Grid'
        hdr = ch_tbl.rows[0].cells
        for i, h in enumerate(['Chapter/Unit', 'Topics', 'Weeks', 'Delivery']):
            hdr[i].text = h
            hdr[i].paragraphs[0].runs[0].bold = True
        for ch in valid_chapters:
            r = ch_tbl.add_row()
            r.cells[0].text = str(ch.get('chapter', ''))
            r.cells[1].text = str(ch.get('topics', ''))
            r.cells[2].text = str(ch.get('weeks', ''))
            r.cells[3].text = str(ch.get('delivery', ''))

    # ── Grading ────────────────────────────────────────────────────────────
    grading_rows = data.get('grading_rows') or []
    if grading_rows:
        heading('Grading System', level=1)
        g_tbl = doc.add_table(rows=1, cols=3)
        g_tbl.style = 'Table Grid'
        hdr2 = g_tbl.rows[0].cells
        for i, h in enumerate(['Rating', 'Grade', 'Range']):
            hdr2[i].text = h
            hdr2[i].paragraphs[0].runs[0].bold = True
        for gr in grading_rows:
            r = g_tbl.add_row()
            r.cells[0].text = str(gr.get('rating', ''))
            r.cells[1].text = str(gr.get('grade', ''))
            r.cells[2].text = str(gr.get('range', ''))

    # ── Policies ───────────────────────────────────────────────────────────
    policies = data.get('policies') or []
    valid_policies = [p for p in policies if p.get('title') or p.get('content')]
    if valid_policies or g('other_policies'):
        heading('Course Policies', level=1)
        for pol in valid_policies:
            if pol.get('title'):
                heading(pol['title'], level=2)
            if pol.get('content'):
                doc.add_paragraph(pol['content'])
        if g('other_policies'):
            doc.add_paragraph(g('other_policies'))

    # ── ILO–Assessment Task matrix ─────────────────────────────────────────
    # Kept in portrait: the column count tracks the number of assessment tasks,
    # which is small in practice.
    add_ilo_at_matrix(doc, data)

    # ── Table of Specifications ────────────────────────────────────────────
    # Rendered in its own landscape section because the grid is 18 columns wide
    # and becomes unreadable in portrait.
    if has_tos(data):
        make_landscape(doc)
        add_table_of_specifications(doc, data)

    # ── Framework mapping ──────────────────────────────────────────────────
    add_framework_mapping(doc, data)

    # ── ILO–Framework matrix ───────────────────────────────────────────────
    add_ilo_framework_matrix(doc, data)

    # ── References ─────────────────────────────────────────────────────────
    refs = data.get('references') or []
    valid_refs = [r for r in refs if r and str(r).strip()]
    if valid_refs:
        heading('References', level=1)
        for ref in valid_refs:
            doc.add_paragraph(str(ref), style='List Bullet')

    _append_configured_syllabus_fields(
        doc,
        data,
        (branding or {}).get('syllabus_sections'),
    )
    apply_page_header_footer(doc, branding)

    return doc


def _build_plain_module_docx(data, fallback_title='', fallback_week=None):
    """Generate a basic structured DOCX from module_content JSON."""
    from docx import Document
    from docx.shared import Pt, RGBColor, Inches
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    doc = Document()

    for section in doc.sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1.25)
        section.right_margin = Inches(1.25)

    MAROON = RGBColor(0x8B, 0x00, 0x00)

    def heading(text, level=1):
        p = doc.add_heading(text, level=level)
        if level == 1:
            run = p.runs[0] if p.runs else p.add_run(text)
            run.font.color.rgb = MAROON
        return p

    module_title = str(data.get('module_title') or fallback_title or 'Teaching Module')
    module_number = data.get('module_number')
    week_number = data.get('week_number', fallback_week)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_run = title.add_run(module_title)
    title_run.bold = True
    title_run.font.size = Pt(15)
    title_run.font.color.rgb = MAROON

    subtitle_parts = []
    if module_number not in (None, ''):
        subtitle_parts.append(f'Module {module_number}')
    if week_number not in (None, ''):
        subtitle_parts.append(f'Week {week_number}')
    if subtitle_parts:
        subtitle = doc.add_paragraph(' | '.join(subtitle_parts))
        subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
        if subtitle.runs:
            subtitle.runs[0].font.size = Pt(10)

    doc.add_paragraph()

    introduction = str(data.get('introduction') or '').strip()
    if introduction:
        heading('Introduction', level=1)
        doc.add_paragraph(introduction)

    objectives = [str(o).strip() for o in (data.get('learning_objectives') or []) if str(o).strip()]
    if objectives:
        heading('Learning Objectives', level=1)
        for obj in objectives:
            doc.add_paragraph(obj, style='List Number')

    subtopics = data.get('subtopics') or []
    valid_subtopics = [s for s in subtopics if isinstance(s, dict) and (s.get('title') or s.get('content'))]
    if valid_subtopics:
        heading('Subtopics', level=1)
        for idx, st in enumerate(valid_subtopics, start=1):
            st_title = str(st.get('title') or f'Subtopic {idx}')
            heading(st_title, level=2)
            st_content = str(st.get('content') or '').strip()
            if st_content:
                doc.add_paragraph(st_content)

    short_activity = data.get('short_activity') or {}
    if isinstance(short_activity, dict) and any(short_activity.get(k) for k in ('title', 'duration', 'description')):
        heading('Short Activity', level=1)
        tbl = doc.add_table(rows=0, cols=2)
        tbl.style = 'Table Grid'
        for label, key in (('Title', 'title'), ('Duration', 'duration'), ('Description', 'description')):
            val = str(short_activity.get(key) or '').strip()
            if not val:
                continue
            r = tbl.add_row()
            r.cells[0].text = label
            r.cells[1].text = val
            r.cells[0].paragraphs[0].runs[0].bold = True

    return doc


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def export_syllabus_docx(request):
    """
    Export syllabus data as a DOCX file.

    Endpoint: POST /api/curriculum/export-syllabus-docx/

    Body (multipart/form-data):
        course_id     — optional UUID; if provided, export uses latest saved syllabus_content from DB
        syllabus_data — optional JSON string fallback when no saved syllabus is available
        template      — optional DOCX/XLSX template file with {{field}} placeholders

    Returns: DOCX file attachment
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    course_id = request.data.get('course_id')

    course = None
    syllabus = None
    if course_id:
        course, error_response = _get_assigned_course_or_403(request, course_id)
        if error_response:
            return error_response
        latest_syllabus = (
            Syllabus.objects.filter(course=course)
            .order_by('-generated_at', '-syllabus_id')
            .first()
        )
        if latest_syllabus and isinstance(latest_syllabus.syllabus_content, dict):
            syllabus = latest_syllabus.syllabus_content

    if syllabus is None:
        raw_data = request.data.get('syllabus_data', '{}')
        if isinstance(raw_data, str):
            try:
                syllabus = json.loads(raw_data)
            except json.JSONDecodeError:
                return Response(
                    {'success': False, 'error': 'Invalid syllabus_data JSON.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            syllabus = raw_data

    if not isinstance(syllabus, dict):
        return Response(
            {'success': False, 'error': 'syllabus_data must be a JSON object.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not syllabus:
        return Response(
            {'success': False, 'error': 'No syllabus data found to export.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    template_file = request.FILES.get('template')
    template_name = (template_file.name if template_file else '').lower()
    is_xlsx_template = template_name.endswith('.xlsx')

    branding = _resolve_institution_branding(course)

    try:
        from io import BytesIO
        from django.http import HttpResponse

        course_code = (syllabus.get('course_code') or 'syllabus').replace('/', '-').replace(' ', '_')

        if is_xlsx_template:
            # ── XLSX template: replace {{field}} in cells, return xlsx ────
            import openpyxl
            wb = openpyxl.load_workbook(template_file)

            def _template_value_to_text(value):
                if value is None:
                    return ''
                if isinstance(value, bool):
                    return 'Yes' if value else 'No'
                if isinstance(value, (str, int, float)):
                    return str(value)
                if isinstance(value, list):
                    if all(not isinstance(item, (dict, list)) for item in value):
                        return '\n'.join(str(item) for item in value if item is not None)
                    return json.dumps(value, ensure_ascii=False, indent=2)
                if isinstance(value, dict):
                    return json.dumps(value, ensure_ascii=False, indent=2)
                return str(value)

            replacements = {
                f'{{{{{k}}}}}': _template_value_to_text(v)
                for k, v in syllabus.items()
            }
            for ws in wb.worksheets:
                for row in ws.iter_rows():
                    for cell in row:
                        if isinstance(cell.value, str):
                            new_val = cell.value
                            for placeholder, replacement in replacements.items():
                                new_val = new_val.replace(placeholder, replacement)
                            new_val = re.sub(r'\{\{\s*[^{}]+\s*\}\}', '', new_val)
                            cell.value = new_val
            buffer = BytesIO()
            wb.save(buffer)
            buffer.seek(0)
            filename = f"{course_code}_syllabus.xlsx"
            http_response = HttpResponse(
                buffer.getvalue(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            )
            http_response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return http_response

        else:
            # ── DOCX template or default plain build ─────────────────────
            from docx import Document
            if template_file:
                doc = Document(template_file)
                _fill_docx_template(doc, syllabus)
                _append_configured_syllabus_fields(
                    doc,
                    syllabus,
                    (branding or {}).get('syllabus_sections'),
                )
            else:
                doc = _build_plain_syllabus_docx(syllabus, branding)

            buffer = BytesIO()
            doc.save(buffer)
            buffer.seek(0)
            filename = f"{course_code}_syllabus.docx"
            http_response = HttpResponse(
                buffer.getvalue(),
                content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            )
            http_response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return http_response

    except Exception as exc:
        logger.exception('Error generating DOCX for syllabus export')
        return Response(
            {'success': False, 'error': f'Failed to generate DOCX: {exc}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def export_tos_docx(request):
    """
    Export the Table of Specifications as a standalone landscape DOCX.

    Endpoint: POST /api/curriculum/export-tos-docx/

    Body (multipart/form-data):
        course_id     — optional UUID; when given, the latest saved
                        syllabus_content is used and institution branding applies
        syllabus_data — optional JSON string fallback when nothing is saved yet

    Returns: DOCX file attachment
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    course = None
    syllabus = None

    course_id = request.data.get('course_id')
    if course_id:
        course, error_response = _get_assigned_course_or_403(request, course_id)
        if error_response:
            return error_response
        latest_syllabus = (
            Syllabus.objects.filter(course=course)
            .order_by('-generated_at', '-syllabus_id')
            .first()
        )
        if latest_syllabus and isinstance(latest_syllabus.syllabus_content, dict):
            syllabus = latest_syllabus.syllabus_content

    if syllabus is None:
        raw_data = request.data.get('syllabus_data', '{}')
        if isinstance(raw_data, str):
            try:
                syllabus = json.loads(raw_data)
            except json.JSONDecodeError:
                return Response(
                    {'success': False, 'error': 'Invalid syllabus_data JSON.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            syllabus = raw_data

    if not isinstance(syllabus, dict):
        return Response(
            {'success': False, 'error': 'syllabus_data must be a JSON object.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not has_tos(syllabus):
        return Response(
            {'success': False, 'error': 'No Table of Specifications found for this course yet.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    try:
        from io import BytesIO

        from django.http import HttpResponse

        doc = build_tos_docx(syllabus, _resolve_institution_branding(course))
        buffer = BytesIO()
        doc.save(buffer)

        course_code = (syllabus.get('course_code') or 'syllabus').replace('/', '-').replace(' ', '_')
        filename = f'{course_code}_table_of_specifications.docx'
        response = HttpResponse(
            buffer.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    except Exception as exc:
        logger.exception('Error generating DOCX for Table of Specifications export')
        return Response(
            {'success': False, 'error': f'Failed to generate Table of Specifications: {exc}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def export_module_docx(request):
    """
    Export module content as a DOCX file.

    Endpoint: POST /api/curriculum/export-module-docx/

    Body (multipart/form-data):
        module_id   — optional UUID; if provided, export uses module_content from DB
        module_data — optional JSON string fallback when no saved module is available
        template    — optional DOCX template file with {{field}} placeholders

    Returns: DOCX file attachment
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    module_id = request.data.get('module_id')

    module_data = None
    module_title = ''
    week_number = None
    course_code = 'module'

    if module_id:
        try:
            module = Module.objects.select_related('syllabus__course').get(module_id=module_id)
        except Module.DoesNotExist:
            return Response(
                {'success': False, 'error': 'Module not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        course = module.syllabus.course
        _, error_response = _get_assigned_course_or_403(request, course.course_id)
        if error_response:
            return error_response

        module_title = module.module_title or ''
        week_number = module.week_number
        course_code = (course.course_code or 'module')
        if isinstance(module.module_content, dict):
            module_data = module.module_content

    if module_data is None:
        raw_data = request.data.get('module_data', '{}')
        if isinstance(raw_data, str):
            try:
                module_data = json.loads(raw_data)
            except json.JSONDecodeError:
                return Response(
                    {'success': False, 'error': 'Invalid module_data JSON.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            module_data = raw_data

    if not isinstance(module_data, dict):
        return Response(
            {'success': False, 'error': 'module_data must be a JSON object.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not module_data:
        return Response(
            {'success': False, 'error': 'No module data found to export.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    template_file = request.FILES.get('template')
    if template_file and not template_file.name.lower().endswith('.docx'):
        return Response(
            {'success': False, 'error': 'Template must be a DOCX file.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        from io import BytesIO
        from django.http import HttpResponse
        from docx import Document

        module_title = str(module_data.get('module_title') or module_title or 'module')
        week_number = module_data.get('week_number', week_number)

        safe_course = str(course_code or 'module').replace('/', '-').replace(' ', '_')
        safe_title = module_title.replace('/', '-').replace(' ', '_')
        week_suffix = f"_w{week_number}" if week_number not in (None, '') else ''
        filename = f"{safe_course}{week_suffix}_{safe_title}_module.docx"

        if template_file:
            doc = Document(template_file)
            _fill_docx_template(doc, module_data)
        else:
            doc = _build_plain_module_docx(module_data, fallback_title=module_title, fallback_week=week_number)

        buffer = BytesIO()
        doc.save(buffer)
        buffer.seek(0)

        http_response = HttpResponse(
            buffer.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )
        http_response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return http_response

    except Exception as exc:
        logger.exception('Error generating DOCX for module export')
        return Response(
            {'success': False, 'error': f'Failed to generate DOCX: {exc}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def parse_syllabus_upload(request):
    """
    Upload a syllabus file (xlsx / pdf / docx / txt), extract its text,
    and use the LLM to map the content to the EMPTY_SYLLABUS JSON schema.

    Endpoint: POST /api/curriculum/parse-syllabus-upload/

    Body: multipart/form-data
        file      — the document to parse
        course_id — UUID of the target course

    Returns: { success: true, syllabus_data: { ...EMPTY_SYLLABUS shape... } }
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    course_id = request.data.get("course_id")
    file_obj = request.FILES.get("file")

    if not course_id:
        return Response(
            {"success": False, "detail": "course_id is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not file_obj:
        return Response(
            {"success": False, "detail": "No file was provided."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    course, error_response = _get_assigned_course_or_403(request, course_id)
    if error_response:
        return error_response
    trial_response = trial_generation_gate(request.user, syllabus_generation=True)
    if trial_response:
        return trial_response

    filename = file_obj.name.lower()
    allowed = (".txt", ".docx", ".pdf", ".xlsx")
    if not any(filename.endswith(ext) for ext in allowed):
        return Response(
            {"success": False, "detail": "Unsupported file type. Please upload PDF, DOCX, XLSX, or TXT."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # ── Extract text ──────────────────────────────────────────────────────
    try:
        extracted_text = _extract_text_from_file(file_obj, filename)
    except Exception as exc:
        return Response(
            {"success": False, "error": f"Failed to extract text: {exc}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not extracted_text.strip():
        return Response(
            {"success": False, "error": "Could not extract any text from this file."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # ── Parse with LLM ────────────────────────────────────────────────────
    try:
        import json
        import re

        system_prompt, user_prompt = CoTPromptBuilder.build_syllabus_parse_prompt(
            extracted_text=extracted_text,
            course_name=course.course_title,
            course_code=course.course_code,
        )

        llm = LLMService()
        try:
            raw_response, provider_used = llm.generate_response_with_fallback(
                [{"role": "user", "content": user_prompt}],
                system=system_prompt,
                max_tokens=8192,
                return_provider=True,
            )
        except ValueError as exc:
            logger.error(
                "parse_syllabus_upload: all providers failed for course %r: %s",
                course.course_code,
                exc,
            )
            return Response(
                {
                    "success": False,
                    "error": (
                        "Syllabus parsing is unavailable: every free AI provider is busy or not configured. "
                        "Try again in a minute, or add another provider key."
                    ),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        logger.info(
            "parse_syllabus_upload: succeeded with provider %s for course %r",
            provider_used,
            course.course_code,
        )

        # Robustly extract and parse JSON from the LLM response.
        # The model may add preamble text or wrap in a markdown code fence.
        raw_json = None

        # Strategy 1: extract JSON from a markdown code fence — greedy to capture full object
        fence_match = re.search(r'```(?:json)?\s*(\{.*\})\s*```', raw_response, re.DOTALL)
        if fence_match:
            raw_json = fence_match.group(1)
        else:
            # Strategy 2: find the outermost { ... } block in the response
            brace_match = re.search(r'\{.*\}', raw_response, re.DOTALL)
            if brace_match:
                raw_json = brace_match.group(0)

        if not raw_json:
            raise json.JSONDecodeError("No JSON object found in LLM response", raw_response, 0)

        try:
            syllabus_data = json.loads(raw_json)
        except json.JSONDecodeError:
            # Common fix: remove trailing commas before } or ]
            sanitized = re.sub(r',(\s*[}\]])', r'\1', raw_json)
            try:
                syllabus_data = json.loads(sanitized)
            except json.JSONDecodeError:
                # Last resort: cheap JSON repair pass (no document re-parse).
                repair_system = (
                    "You repair malformed JSON. Return ONLY valid JSON with the same keys/values. "
                    "Do not add commentary or markdown fences."
                )
                repair_prompt = (
                    "Repair this JSON so it parses. Preserve content and structure as much as possible:\n\n"
                    f"{raw_json}"
                )
                repaired = llm.generate_response_with_fallback(
                    messages=[{"role": "user", "content": repair_prompt}],
                    preferred_provider="groq",
                    system=repair_system,
                    max_tokens=8192,
                )
                if not repaired or not repaired.strip():
                    raise json.JSONDecodeError(
                        "Repair LLM returned empty response", "", 0
                    )
                # Extract JSON from the repair response (greedy fence, then greedy brace)
                rep_fence = re.search(r'```(?:json)?\s*(\{.*\})\s*```', repaired, re.DOTALL)
                if rep_fence:
                    repaired_json = rep_fence.group(1)
                else:
                    rep_brace = re.search(r'\{.*\}', repaired, re.DOTALL)
                    repaired_json = rep_brace.group(0) if rep_brace else repaired.strip()
                if not repaired_json:
                    raise json.JSONDecodeError("No JSON found in repair response", "", 0)
                syllabus_data = json.loads(repaired_json)

        logger.info(
            "parse_syllabus_upload: parsed syllabus for course %r from %r",
            course.course_code, file_obj.name,
        )

        return Response(
            {"success": True, "syllabus_data": syllabus_data},
            status=status.HTTP_200_OK,
        )

    except json.JSONDecodeError as exc:
        logger.warning("parse_syllabus_upload: LLM returned invalid JSON: %s", exc)
        return Response(
            {
                "success": False,
                "error": (
                    "The model could not extract structured data from this file. "
                    "The document may be too large or complex. "
                    "Try uploading a shorter excerpt or a simpler file."
                ),
            },
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )
    except Exception as exc:
        logger.exception("Error in parse_syllabus_upload for course %r", course_id)
        return Response(
            {"success": False, "error": str(exc)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def segment_syllabus_upload(request):
    """
    Upload a syllabus file, extract its text, and use LLM to segment it into 10 raw text sections.
    Endpoint: POST /api/curriculum/segment-syllabus-upload/
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    course_id = request.data.get("course_id")
    file_obj = request.FILES.get("file")

    if not course_id:
        return Response(
            {"success": False, "detail": "course_id is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not file_obj:
        return Response(
            {"success": False, "detail": "No file was provided."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    course, error_response = _get_assigned_course_or_403(request, course_id)
    if error_response:
        return error_response
    trial_response = trial_generation_gate(request.user, syllabus_generation=True)
    if trial_response:
        return trial_response

    filename = file_obj.name.lower()
    allowed = (".txt", ".docx", ".pdf", ".xlsx")
    if not any(filename.endswith(ext) for ext in allowed):
        return Response(
            {"success": False, "detail": "Unsupported file type. Please upload PDF, DOCX, XLSX, or TXT."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Extract text
    try:
        extracted_text = _extract_text_from_file(file_obj, filename)
    except Exception as exc:
        return Response(
            {"success": False, "error": f"Failed to extract text: {exc}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not extracted_text.strip():
        return Response(
            {"success": False, "error": "Could not extract any text from this file."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Segment using LLM
    try:
        import json
        import re

        system_prompt, user_prompt = CoTPromptBuilder.build_syllabus_segment_prompt(
            extracted_text=extracted_text
        )

        llm = LLMService()
        try:
            raw_response = llm.generate_response_with_fallback(
                [{"role": "user", "content": user_prompt}],
                system=system_prompt,
                max_tokens=8192,
            )
        except ValueError as exc:
            return Response(
                {"success": False, "error": f"Segmentation failed: {exc}"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # Extract JSON
        raw_json = None
        fence_match = re.search(r'```(?:json)?\s*(\{.*\})\s*```', raw_response, re.DOTALL)
        if fence_match:
            raw_json = fence_match.group(1)
        else:
            brace_match = re.search(r'\{.*\}', raw_response, re.DOTALL)
            if brace_match:
                raw_json = brace_match.group(0)

        if not raw_json:
            raise json.JSONDecodeError("No JSON object found in LLM response", raw_response, 0)

        try:
            segments = json.loads(raw_json)
        except json.JSONDecodeError:
            sanitized = re.sub(r',(\s*[}\]])', r'\1', raw_json)
            try:
                segments = json.loads(sanitized)
            except json.JSONDecodeError:
                # Fallback simple repair
                repair_system = "You repair malformed JSON. Return ONLY valid JSON with the same keys/values. Do not add commentary or markdown fences."
                repair_prompt = f"Repair this JSON so it parses:\n\n{raw_json}"
                repaired = llm.generate_response_with_fallback(
                    messages=[{"role": "user", "content": repair_prompt}],
                    preferred_provider="groq",
                    system=repair_system,
                    max_tokens=8192,
                )
                rep_fence = re.search(r'```(?:json)?\s*(\{.*\})\s*```', repaired, re.DOTALL)
                if rep_fence:
                    repaired_json = rep_fence.group(1)
                else:
                    rep_brace = re.search(r'\{.*\}', repaired, re.DOTALL)
                    repaired_json = rep_brace.group(0) if rep_brace else repaired.strip()
                segments = json.loads(repaired_json)

        # Ensure all 10 keys are present in segments output
        required_keys = ["header", "direction", "specs", "overview", "strategies", "outcomes", "references", "policies", "tla_activities", "schedules"]
        for key in required_keys:
            if key not in segments:
                segments[key] = ""

        return Response(
            {"success": True, "segments": segments},
            status=status.HTTP_200_OK,
        )

    except Exception as exc:
        logger.exception("Error during syllabus text segmentation")
        return Response(
            {"success": False, "error": f"Failed to segment syllabus: {exc}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def parse_syllabus_segment(request):
    """
    Parse a single raw text segment for a specific syllabus section.
    Endpoint: POST /api/curriculum/parse-syllabus-segment/
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    course_id = request.data.get("course_id")
    section_key = request.data.get("section_key")
    segment_text = request.data.get("segment_text", "")

    if not course_id or not section_key:
        return Response(
            {"success": False, "detail": "course_id and section_key are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    course, error_response = _get_assigned_course_or_403(request, course_id)
    if error_response:
        return error_response

    if not segment_text or not segment_text.strip():
        return Response(
            {"success": True, "parsed_data": {}},
            status=status.HTTP_200_OK,
        )
    trial_response = trial_generation_gate(request.user, syllabus_generation=True)
    if trial_response:
        return trial_response

    try:
        import json
        import re

        system_prompt, user_prompt = CoTPromptBuilder.build_syllabus_section_prompt(
            section_key=section_key,
            segment_text=segment_text,
            course_name=course.course_title,
            course_code=course.course_code,
        )

        llm = LLMService()
        try:
            raw_response = llm.generate_response_with_fallback(
                [{"role": "user", "content": user_prompt}],
                system=system_prompt,
                max_tokens=4096,
            )
        except ValueError as exc:
            return Response(
                {"success": False, "error": f"Parsing section {section_key} failed: {exc}"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # Extract JSON
        raw_json = None
        fence_match = re.search(r'```(?:json)?\s*(\{.*\})\s*```', raw_response, re.DOTALL)
        if fence_match:
            raw_json = fence_match.group(1)
        else:
            brace_match = re.search(r'\{.*\}', raw_response, re.DOTALL)
            if brace_match:
                raw_json = brace_match.group(0)

        if not raw_json:
            raise json.JSONDecodeError("No JSON object found in LLM response", raw_response, 0)

        try:
            parsed_data = json.loads(raw_json)
        except json.JSONDecodeError:
            sanitized = re.sub(r',(\s*[}\]])', r'\1', raw_json)
            try:
                parsed_data = json.loads(sanitized)
            except json.JSONDecodeError:
                # Fallback simple repair
                repair_system = "You repair malformed JSON. Return ONLY valid JSON. Do not add commentary or markdown fences."
                repair_prompt = f"Repair this JSON so it parses:\n\n{raw_json}"
                repaired = llm.generate_response_with_fallback(
                    messages=[{"role": "user", "content": repair_prompt}],
                    preferred_provider="groq",
                    system=repair_system,
                    max_tokens=4096,
                )
                rep_fence = re.search(r'```(?:json)?\s*(\{.*\})\s*```', repaired, re.DOTALL)
                if rep_fence:
                    repaired_json = rep_fence.group(1)
                else:
                    rep_brace = re.search(r'\{.*\}', repaired, re.DOTALL)
                    repaired_json = rep_brace.group(0) if rep_brace else repaired.strip()
                parsed_data = json.loads(repaired_json)

        return Response(
            {"success": True, "parsed_data": parsed_data},
            status=status.HTTP_200_OK,
        )

    except Exception as exc:
        logger.exception("Error during syllabus section parsing: %s", section_key)
        return Response(
            {"success": False, "error": f"Failed to parse section {section_key}: {exc}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def compute_curriculum_metrics(request):
    """
    Compute curriculum quality metrics (IC, AM, CBI, SC, FA, CRI) from syllabus content.

    Endpoint: POST /api/curriculum/quality-metrics/

    Body: { "course_id": "<uuid>" }  OR  { "syllabus_content": {...} }

    Returns:
    {
        "success": true,
        "ic": 0-100,
        "am": 0-100,
        "cbi": 0-100 | null,
        "sc": 0-100,
        "fa": 0-100,
        "cri": 0-100,
        "grades": { "ic": "pass"|"warn"|"fail", ... },
        "bloom_summary": { "remember": n, ... },
        "detail": { "ilo_count": n, "covered_ilo_count": n, ... }
    }
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    serializer = CurriculumMetricsSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {"success": False, "errors": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    data = serializer.validated_data
    syllabus_content = data.get("syllabus_content")
    course_id = data.get("course_id")

    if not syllabus_content and course_id:
        course, error_response = _get_assigned_course_or_403(request, course_id)
        if error_response:
            return error_response
        syllabus = (
            Syllabus.objects
            .filter(course=course)
            .order_by("-generated_at", "-syllabus_id")
            .first()
        )
        if not syllabus or not syllabus.syllabus_content:
            return Response(
                {"success": False, "detail": "No saved syllabus found for this course."},
                status=status.HTTP_404_NOT_FOUND,
            )
        syllabus_content = syllabus.syllabus_content

    if not syllabus_content:
        return Response(
            {"success": False, "detail": "syllabus_content or course_id is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        metrics = compute_metrics(syllabus_content)
        return Response({"success": True, **metrics}, status=status.HTTP_200_OK)
    except Exception as exc:
        logger.exception("Error computing curriculum metrics")
        return Response(
            {"success": False, "error": str(exc)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
