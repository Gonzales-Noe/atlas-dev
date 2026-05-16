import json
import logging
import re

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.integrations.cot_prompt_builder import CoTPromptBuilder
from apps.integrations.llm_service import LLMService
from apps.integrations.models import (
    Assessment,
    Course,
    CourseFile,
    CourseLoad,
    Module,
    ParentChunk,
    Syllabus,
    UserRole,
)
from apps.integrations.rag_service import (
    course_semantic_search_with_summary,
    semantic_search,
    semantic_search_with_summary,
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
    assignment = CourseLoad.objects.select_related('course').filter(
        faculty=request.user,
        course_id=course_id,
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

    assignments = CourseLoad.objects.select_related('course').filter(faculty=request.user)
    courses = []
    for assignment in assignments:
        course = assignment.course
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

    return Response(
        {
            'success': True,
            'course': {
                'course_id': str(course.course_id),
                'course_code': course.course_code,
                'course_title': course.course_title,
                'description': course.description,
            },
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
        "provider": "gemini",             // optional: gemini|gpt|groq|anthropic|openrouter
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
        rag_result = semantic_search_with_summary(search_query, top_k=top_k)
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
        generated_text = llm.generate_response(
            messages=[{"role": "user", "content": user_prompt}],
            provider_choice=provider,
            system=system_prompt,
            max_tokens=2048,
        )

        return Response(
            {
                "success": True,
                "course_name": course_name,
                "course_code": course_code,
                "num_weeks": num_weeks,
                "provider_used": provider or llm.default_provider,
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
        global_rag = semantic_search_with_summary(search_query, top_k=top_k)
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
        global_rag = semantic_search_with_summary(search_query, top_k=5)
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


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_course(request):
    """Create a new course and auto-assign it to the requesting faculty user."""
    if not _is_faculty_user(request):
        return _faculty_only_response()

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

    if Course.objects.filter(course_code=course_code).exists():
        return Response(
            {"success": False, "detail": f"A course with code '{course_code}' already exists."},
            status=status.HTTP_409_CONFLICT,
        )

    course = Course.objects.create(
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
        "provider":         "gemini",         // optional LLM provider
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

    try:
        # ── Step 1: Global RAG with progressive summary ────────────────────
        search_query = f"{section} {field_label} {course.course_title} OBE curriculum"
        rag_result = semantic_search_with_summary(search_query, top_k=top_k)
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
        )

        # ── Step 4: Call LLM ─────────────────────────────────────────────
        llm = LLMService()
        generated_text = llm.generate_response(
            messages=[{"role": "user", "content": user_prompt}],
            provider_choice=provider,
            system=system_prompt,
            max_tokens=1500,
        )

        logger.info(
            "generate_syllabus_field: section=%r field=%r mode=%r course=%r provider=%r chunks=%d",
            section, field_label, mode, course.course_code, provider, len(all_chunks),
        )

        return Response(
            {
                "success": True,
                "generated_text": generated_text,
                "provider_used": provider or llm.default_provider,
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
    """Extract raw text from .txt / .docx / .pdf / .xlsx files."""
    if filename.endswith(".txt"):
        return file_obj.read().decode("utf-8", errors="replace")

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
        return "\n".join(parts)

    if filename.endswith(".pdf"):
        from pypdf import PdfReader
        reader = PdfReader(file_obj)
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages)

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
        return "\n\n".join(sheets_text)

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


def _build_plain_syllabus_docx(data):
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

    # ── References ─────────────────────────────────────────────────────────
    refs = data.get('references') or []
    valid_refs = [r for r in refs if r and str(r).strip()]
    if valid_refs:
        heading('References', level=1)
        for ref in valid_refs:
            doc.add_paragraph(str(ref), style='List Bullet')

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
            else:
                doc = _build_plain_syllabus_docx(syllabus)

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
        parse_max_tokens = 8192
        # The syllabus parse prompt can be very large; prioritize Anthropic first.
        # OpenRouter may fail on credits, and Groq can reject oversized requests (413).
        raw_response = None
        last_exc = None
        openrouter_payment_blocked = False
        attempted_providers = []
        approx_prompt_tokens = (len(system_prompt) + len(user_prompt)) // 4
        if approx_prompt_tokens > 10000:
            # For oversized prompts, avoid OpenRouter providers entirely.
            provider_fallback_order = ["anthropic", "groq"]
        else:
            provider_fallback_order = ["anthropic", "groq", "gemini", "gpt"]
        logger.info(
            "parse_syllabus_upload: approx_prompt_tokens=%s provider_order=%s",
            approx_prompt_tokens,
            provider_fallback_order,
        )

        for provider_choice in provider_fallback_order:
            backend_name, _ = llm.get_provider_and_model(provider_choice)
            if provider_choice == "groq" and approx_prompt_tokens > 10000:
                logger.warning(
                    "parse_syllabus_upload: skipping groq due large prompt (~%s tokens)",
                    approx_prompt_tokens,
                )
                continue
            if openrouter_payment_blocked and backend_name == "openrouter":
                logger.warning(
                    "parse_syllabus_upload: skipping provider %s because OpenRouter credits are exhausted",
                    provider_choice,
                )
                continue

            try:
                attempted_providers.append(provider_choice)
                raw_response = llm.generate_response(
                    messages=[{"role": "user", "content": user_prompt}],
                    provider_choice=provider_choice,
                    system=system_prompt,
                    max_tokens=parse_max_tokens,
                )
                logger.info(
                    "parse_syllabus_upload: succeeded with provider %s for course %r",
                    provider_choice,
                    course.course_code,
                )
                break
            except Exception as exc:
                last_exc = exc
                status_code = getattr(getattr(exc, "response", None), "status_code", None)
                if backend_name == "openrouter" and status_code == 402:
                    openrouter_payment_blocked = True
                logger.warning(
                    "parse_syllabus_upload: provider %s failed for course %r: %s",
                    provider_choice,
                    course.course_code,
                    exc,
                )

        if raw_response is None:
            if openrouter_payment_blocked:
                user_error = (
                    "Syllabus parsing is unavailable: OpenRouter credits are exhausted and no other configured "
                    "provider succeeded (Groq/Anthropic). Please top up OpenRouter or configure another provider key."
                )
            else:
                user_error = (
                    "Syllabus parsing is unavailable: no configured LLM provider succeeded. "
                    "Check API keys for OpenRouter, Groq, and Anthropic."
                )
            logger.error(
                "parse_syllabus_upload: all providers failed for course %r. attempted=%s last_error=%s",
                course.course_code,
                attempted_providers,
                last_exc,
            )
            return Response(
                {"success": False, "error": user_error},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
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
                repaired = llm.generate_response(
                    messages=[{"role": "user", "content": repair_prompt}],
                    provider_choice="anthropic",
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
