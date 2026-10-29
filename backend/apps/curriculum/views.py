import json
import logging
import re
import time
from collections import defaultdict

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.integrations.cot_prompt_builder import (
    CoTPromptBuilder,
    assign_topic_weeks,
    complete_syllabus_field,
    syllabus_course_kind,
)
from apps.integrations.fixed_syllabus import apply_fixed_content, sections_for_course, seed_course_syllabi
from apps.integrations.llm_service import LLMService
from apps.integrations.models import (
    Assessment,
    AssessmentItem,
    AuditLog,
    Course,
    CourseLoad,
    CourseRequest,
    CourseRequestStatus,
    InstitutionCustomization,
    Module,
    Section,
    StudentData,
    Syllabus,
    UserRole,
)
from apps.integrations.rag_service import course_semantic_search, embed_queries, generation_reference
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
from .assessment_qa import (
    SOURCE_CHECK_PACK,
    SOURCE_LABELS,
    apply_source_results,
    approval_blockers,
    check_against_blueprint,
    grouped_source_check_prompt,
    normalize_bloom_key,
    pack_source_batches,
    run_grouped_source_checks,
    source_batches,
    source_check_max_tokens,
    verdicts_without_passages,
)
from .consistency_checker import (
    apply_topic_judgments,
    check_consistency,
    checked_now,
    is_orientation_or_exam,
    lecture_weeks,
    lock_module_outline,
    outline_subtopics,
    parse_topic_judgments,
    parse_topics_cell,
    stamp_module_ilos,
    topic_review_prompts,
    verb_levels,
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
    assignment = CourseLoad.objects.select_related('course', 'course__syllabus_owner').filter(
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


def _syllabus_owner_label(course):
    """Display name of the faculty who authors this course's syllabus."""
    owner = course.syllabus_owner if course else None
    if not owner:
        return ''
    return owner.full_name or owner.email or ''


def _can_edit_syllabus(user, course):
    """
    The admin-assigned owner authors the syllabus. Every other faculty handling
    the course can view and export it. Courses without an owner keep shared
    editing until an admin picks one.
    """
    owner = course.syllabus_owner if course else None
    return owner is None or owner.user_id == getattr(user, 'user_id', None)


def _module_owner_response(module, user):
    """Modules belong to the faculty who generated them; the syllabus is shared."""
    if module.faculty_id and module.faculty_id != getattr(user, 'user_id', None):
        return Response(
            {
                'success': False,
                'code': 'module_owned_by_other',
                'detail': 'This module belongs to another faculty member. Create your own from the shared syllabus.',
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


def _syllabus_readonly_response(course):
    owner_name = _syllabus_owner_label(course) or 'another faculty member'
    return Response(
        {
            'success': False,
            'code': 'syllabus_read_only',
            'detail': (
                f'The syllabus for this course is maintained by {owner_name}. '
                'You can view and export it, but only the assigned faculty can edit it.'
            ),
        },
        status=status.HTTP_403_FORBIDDEN,
    )


def _stamp_syllabus_owner(course, syllabus):
    """
    Every download carries the name of the faculty who authored the syllabus,
    even when another faculty handling the course exports it.
    """
    if not isinstance(syllabus, dict) or course is None or not course.syllabus_owner_id:
        return syllabus
    owner = course.syllabus_owner
    stamped = dict(syllabus)
    stamped['instructor_name'] = owner.full_name or owner.email or ''
    if not str(stamped.get('instructor_email') or '').strip():
        stamped['instructor_email'] = owner.email or ''
    return stamped


def _resolve_generation_course(request, course_id=None, course_code=""):
    """Return the faculty's course, looked up by id or by institution + code.

    A code that does not belong to this faculty yields no course, so generation
    cannot attach another course's uploaded chunks.
    """
    if course_id:
        return _get_assigned_course_or_403(request, course_id)
    code = str(course_code or "").strip()
    institution_id = getattr(request.user, "institution_id", None)
    if not code or not institution_id:
        return None, None
    match = Course.objects.filter(
        institution_id=institution_id,
        course_code__iexact=code,
    ).first()
    if not match:
        return None, None
    course, error = _get_assigned_course_or_403(request, match.course_id)
    if error:
        return None, None
    return course, None


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
        .filter(Q(faculty=request.user) | Q(faculty__isnull=True))
        .order_by('week_number', '-generated_at')
        .values('module_id', 'module_title', 'week_number', 'status', 'generated_at', 'module_content')
    )
    assessments = (
        Assessment.objects.filter(course=course)
        .order_by('-generated_at', '-assessment_id')
        .values('assessment_id', 'title', 'assessment_type', 'term', 'status', 'generated_at', 'qa_report')
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
                # The syllabus always carries its author's name, whoever is looking.
                'instructor_name': _syllabus_owner_label(course) or request.user.full_name,
                'instructor_email': (
                    course.syllabus_owner.email if course.syllabus_owner_id else request.user.email
                ),
                'syllabus_owner_id': str(course.syllabus_owner_id) if course.syllabus_owner_id else None,
                'syllabus_owner_name': _syllabus_owner_label(course),
                'can_edit_syllabus': _can_edit_syllabus(request.user, course),
                'module_topic_section_key': course.module_topic_section_key,
                'module_topic_subsection_key': course.module_topic_subsection_key,
                'module_topic_confirmed_at': (
                    course.module_topic_confirmed_at.isoformat()
                    if course.module_topic_confirmed_at
                    else None
                ),
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
                'syllabus_content': (
                    _stamp_syllabus_owner(course, latest_syllabus.syllabus_content)
                    if latest_syllabus else None
                ),
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
    if not _can_edit_syllabus(request.user, course):
        return _syllabus_readonly_response(course)

    content = request.data.get('syllabus_content')
    if not isinstance(content, dict):
        return Response(
            {'success': False, 'detail': 'syllabus_content is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    content = apply_fixed_content(content, sections_for_course(course))

    # Write the syllabus the workspace is showing. A Draft-only update can
    # leave the edits on a row the screen never loads again.
    syllabus = None
    syllabus_id = request.data.get('syllabus_id')
    if syllabus_id:
        syllabus = Syllabus.objects.filter(course=course, syllabus_id=syllabus_id).first()
    if syllabus is None:
        syllabus = (
            Syllabus.objects.filter(course=course)
            .order_by('-generated_at', '-syllabus_id')
            .first()
        )
    created = False
    if not syllabus:
        syllabus = Syllabus.objects.create(course=course, status='Draft', term='', version=1)
        created = True
    syllabus.syllabus_content = content
    update_fields = ['syllabus_content']
    if syllabus.generated_at is None:
        syllabus.generated_at = timezone.now()
        update_fields.append('generated_at')
    syllabus.save(update_fields=update_fields)

    return Response(
        {
            'success': True,
            'syllabus_id': str(syllabus.syllabus_id),
            'created': created,
            'syllabus_content': content,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["PATCH", "POST"])
@permission_classes([IsAuthenticated])
def save_course_module_topic(request, course_id):
    """Lock in the syllabus section/subsection the Module tab reads topics from.

    The choice is made once per course: once confirmed it cannot be changed,
    so every module for the course is generated from the same source.
    """
    if not _is_faculty_user(request):
        return _faculty_only_response()

    course, error_response = _get_assigned_course_or_403(request, course_id)
    if error_response:
        return error_response

    if course.module_topic_confirmed_at:
        return Response(
            {
                "success": False,
                "error": "The module topic source is already confirmed for this course.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    section_key = (request.data.get("section_key") or "").strip()
    subsection_key = (request.data.get("subsection_key") or "").strip()
    if not section_key:
        return Response(
            {"success": False, "error": "A syllabus section is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    course.module_topic_section_key = section_key
    course.module_topic_subsection_key = subsection_key
    course.module_topic_confirmed_at = timezone.now()
    course.save(
        update_fields=[
            "module_topic_section_key",
            "module_topic_subsection_key",
            "module_topic_confirmed_at",
        ]
    )

    return Response(
        {
            "success": True,
            "module_topic_section_key": course.module_topic_section_key,
            "module_topic_subsection_key": course.module_topic_subsection_key,
            "module_topic_confirmed_at": course.module_topic_confirmed_at.isoformat(),
        },
        status=status.HTTP_200_OK,
    )


def _stored_assessment_criteria(course) -> str:
    """Faculty Criteria for Assessment from the latest saved syllabus, if any."""
    latest = (
        Syllabus.objects.filter(course=course, syllabus_content__isnull=False)
        .order_by("-generated_at", "-syllabus_id")
        .first()
    )
    content = latest.syllabus_content if latest else None
    if not isinstance(content, dict):
        return ""
    return str(content.get("assessment_criteria") or "")


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
    course_category = "professional"
    assessment_criteria = ""
    top_k = data.get("top_k", 5)
    provider = data.get("provider") or None
    extra_instructions = data.get("extra_instructions", "")
    selected_doc_ids = [str(uid) for uid in (data.get("selected_doc_ids") or [])]
    search_query = data.get("search_query") or (
        f"{course_name} syllabus course outline curriculum learning outcomes OBE"
    )

    course, error_response = _resolve_generation_course(request, course_id, course_code)
    if error_response:
        return error_response
    if course is not None and not _can_edit_syllabus(request.user, course):
        return _syllabus_readonly_response(course)
    if course is not None:
        course_name = course.course_title
        course_code = course.course_code
        course_category = course.category or "professional"
        assessment_criteria = _stored_assessment_criteria(course)

    try:
        # Global knowledge base = structure. Child chunks of this course's uploads = content.
        reference = generation_reference(
            search_query,
            course=course,
            institution_id=request.user.institution_id,
            top_k=top_k,
            selected_doc_ids=selected_doc_ids,
        )
        source_chunks = reference["source_chunks"]
        logger.info(
            "Syllabus generation for %r: structure=%d course_sources=%d provider=%r",
            course_name,
            reference["global_chunk_count"],
            len(source_chunks),
            provider,
        )

        system_prompt, user_prompt = CoTPromptBuilder.build_syllabus_prompt(
            course_name=course_name,
            course_code=course_code,
            num_weeks=num_weeks,
            context_chunks=source_chunks,
            extra_instructions=extra_instructions,
            context_summary=reference["structure_summary"],
            course_category=course_category,
            assessment_criteria=assessment_criteria,
        )

        # Step 3 — Call LLM
        llm = LLMService()
        generated_text, provider_used = llm.generate_response_with_fallback(
            messages=[{"role": "user", "content": user_prompt}],
            preferred_provider=provider,
            system=system_prompt,
            max_tokens=CoTPromptBuilder.SYLLABUS_MAX_TOKENS,
            return_provider=True,
        )

        return Response(
            {
                "success": True,
                "course_name": course_name,
                "course_code": course_code,
                "num_weeks": num_weeks,
                "provider_used": provider_used,
                "rag_chunks_used": len(source_chunks),
                "generated_syllabus": generated_text,
            },
            status=status.HTTP_200_OK,
        )

    except Exception as exc:
        logger.exception("Error generating syllabus for %r", course_name)
        return Response(
            {"success": False, "error": "Something went wrong. Please try again."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


def _week_topic_from_chapters(chapters, week_number):
    """Return the Topics / Reading List cell for ``week_number``.

    Delivery method is ignored. Class orientation and examination rows are
    skipped. A row keeps the week(s) it covers in ``weeks`` ("2", "2-3") and
    its own row number in ``chapter`` ("1"). The UI sends the chapter number
    as the week number, so both are matched before falling back to a range hit.
    """
    kept = []
    for entry in chapters or []:
        if not isinstance(entry, dict):
            continue
        parsed = parse_topics_cell(entry.get("topics"))
        if not parsed["lines"] or is_orientation_or_exam(parsed["title"]):
            continue
        kept.append(entry)
    chapters = kept
    if not chapters:
        return ""
    target = str(week_number)
    for entry in chapters:
        if str(entry.get("chapter") or "").strip() == target:
            topic = str(entry.get("topics") or "").strip()
            if topic:
                return topic
    for entry in chapters:
        weeks_val = str(entry.get("weeks") or "").strip()
        if not weeks_val:
            continue
        if weeks_val == target:
            topic = str(entry.get("topics") or "").strip()
            if topic:
                return topic
        if "-" in weeks_val:
            parts = weeks_val.split("-")
            if len(parts) == 2:
                try:
                    start, end = int(parts[0]), int(parts[1])
                except ValueError:
                    continue
                if start <= week_number <= end:
                    topic = str(entry.get("topics") or "").strip()
                    if topic:
                        return topic
    return ""


def _section_context_from_syllabus(syllabus_content, section_key, subsection_key):
    """Pull the raw text of a syllabus section / subsection out of saved content."""
    if not syllabus_content or not section_key:
        return ""
    custom_subsections = syllabus_content.get("custom_subsections") or {}
    custom_sections = syllabus_content.get("custom_sections") or {}
    custom_tables = syllabus_content.get("custom_tables") or {}

    parts = []
    if subsection_key:
        text = (custom_subsections.get(section_key) or {}).get(subsection_key)
        if text:
            parts.append(str(text).strip())
        for row in (custom_tables.get(section_key) or {}).get(subsection_key) or []:
            if isinstance(row, list):
                cells = [str(cell).strip() for cell in row if str(cell).strip()]
                if cells:
                    parts.append(" | ".join(cells))
    else:
        text = custom_sections.get(section_key)
        if text:
            parts.append(str(text).strip())
        for sub_text in (custom_subsections.get(section_key) or {}).values():
            if sub_text:
                parts.append(str(sub_text).strip())
        for rows in (custom_tables.get(section_key) or {}).values():
            for row in rows or []:
                if isinstance(row, list):
                    cells = [str(cell).strip() for cell in row if str(cell).strip()]
                    if cells:
                        parts.append(" | ".join(cells))
    return "\n".join(part for part in parts if part)


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
    # ── Syllabus section / subsection the topic came from ─────────────────
    section_key = (data.get("section_key") or "").strip()
    section_label = (data.get("section_label") or "").strip()
    subsection_key = (data.get("subsection_key") or "").strip()
    subsection_label = (data.get("subsection_label") or "").strip()
    explicit_topic = (data.get("topic") or "").strip()
    structuring_level = (data.get("structuring_level") or "standard").strip()
    neighbor_titles = [str(item).strip() for item in (data.get("neighbors") or []) if str(item).strip()][:2]

    course, error_response = _get_assigned_course_or_403(request, course_id)
    if error_response:
        return error_response

    # Determine module number (sequential within this faculty's modules)
    existing_count = Module.objects.filter(syllabus__course=course, faculty=request.user).count()
    module_number = existing_count + 1

    # ── Extract real course data for prompt enrichment ─────────────────────
    course_description: str = course.description or ""
    syllabus_ilos: list = []
    week_topic: str = ""
    outline_subs = [str(item).strip() for item in (data.get("subtopics") or []) if str(item).strip()]
    outline_activity = str(data.get("activity_title") or "").strip()
    if ";" in module_title and not outline_subs:
        parts = [part.strip() for part in module_title.split(";") if part.strip()]
        if parts:
            module_title = parts[0]
            outline_subs = parts[1:]
    elif explicit_topic and not outline_subs and ";" in explicit_topic:
        parts = [part.strip() for part in explicit_topic.split(";") if part.strip()]
        if parts and (not module_title or module_title == explicit_topic):
            module_title = parts[0]
            outline_subs = parts[1:]
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
        week_row = next(
            (row for row in lecture_weeks(sc) if row["week"] == int(week_number)),
            None,
        )
        if week_row:
            saved_title = str(week_row.get("title") or "").strip()
            if saved_title and (not module_title or module_title == saved_title or module_title.startswith(saved_title)):
                module_title = saved_title
            if not outline_subs:
                outline_subs = outline_subtopics(week_row)
            if not outline_activity:
                outline_activity = str(week_row.get("activity") or "").strip()
            if not week_topic:
                week_topic = saved_title or str(week_row.get("title") or "").strip()

    from apps.integrations.tla_generation import module_max_tokens
    from apps.integrations.course_brief import get_course_brief

    try:
        llm = LLMService()
        course_brief, brief_cached = get_course_brief(
            course,
            institution_id=request.user.institution_id,
            selected_doc_ids=selected_doc_ids,
            llm=llm,
            provider=provider,
        )
        logger.info(
            "Module generation for %r / %r wk%d: brief_cached=%s provider=%r",
            course_name, module_title, week_number, brief_cached, provider,
        )

        system_prompt, user_prompt = CoTPromptBuilder.build_module_json_prompt(
            course_name=course_name,
            module_title=module_title,
            week_number=week_number,
            module_number=module_number,
            context_chunks=[],
            extra_instructions=extra_instructions,
            ilos=syllabus_ilos,
            course_description="",
            week_topic=module_title,
            section_label=section_label,
            subsection_label=subsection_label,
            section_context="",
            structuring_level=structuring_level,
            syllabus_subtopics=outline_subs,
            activity_title=outline_activity,
            course_brief=course_brief,
            neighbor_titles=neighbor_titles,
        )

        raw_text = llm.generate_response_with_fallback(
            messages=[{"role": "user", "content": user_prompt}],
            preferred_provider=provider,
            system=system_prompt,
            max_tokens=module_max_tokens(len(outline_subs)),
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

        if len(module_title) > 255:
            module_title = module_title[:252].rstrip() + "..."

        module_content = lock_module_outline(
            module_content,
            module_title,
            outline_subs,
            outline_activity,
        )

        # Ensure subtopic IDs are present
        for idx, st in enumerate(module_content.get("subtopics", [])):
            if "id" not in st:
                st["id"] = f"st_{idx}"

        module_content = stamp_module_ilos(
            module_content,
            latest_syllabus_for_data.syllabus_content if latest_syllabus_for_data else {},
            week_number,
        )

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
        seed_course_syllabi(course)

        module = Module.objects.create(
            syllabus=syllabus,
            faculty=request.user,
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
                "rag_chunks_used": 0,
                "brief_cached": brief_cached,
                "module_content": module_content,
            },
            status=status.HTTP_201_CREATED,
        )

    except Exception as exc:
        logger.exception("Error generating module %r for course %r", module_title, course_name)
        return Response(
            {"success": False, "error": "Something went wrong. Please try again."},
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
    owner_error = _module_owner_response(module, request.user)
    if owner_error:
        return owner_error

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
    owner_error = _module_owner_response(module, request.user)
    if owner_error:
        return owner_error

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


def _clear_assessment_qa(assessment, update_fields):
    """Drop a stored quality report after an item changes."""
    if getattr(assessment, 'qa_report', None):
        assessment.qa_report = None
        if 'qa_report' not in update_fields:
            update_fields.append('qa_report')
    return update_fields


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def check_syllabus_module_consistency(request, course_id):
    """Compare lecture weeks, ILO codes, and saved modules for one course."""
    if not _is_faculty_user(request):
        return _faculty_only_response()

    course, error_response = _get_assigned_course_or_403(request, course_id)
    if error_response:
        return error_response
    can_edit = _can_edit_syllabus(request.user, course)

    syllabus = (
        Syllabus.objects.filter(course=course, syllabus_content__isnull=False)
        .order_by('-generated_at', '-syllabus_id')
        .first()
    )
    if not syllabus or not isinstance(syllabus.syllabus_content, dict):
        return Response(
            {'success': False, 'detail': 'Save a syllabus before checking alignment.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    modules = [
        {
            'module_id': str(module.module_id),
            'module_title': module.module_title,
            'week_number': module.week_number,
            'module_content': module.module_content if isinstance(module.module_content, dict) else {},
        }
        for module in Module.objects.filter(syllabus__course=course).order_by('week_number', '-generated_at')
    ]
    report = check_consistency(syllabus.syllabus_content, modules)
    use_cot = bool(request.data.get('use_cot', True))
    cot_error = ''
    if use_cot and report.get('needs_review'):
        try:
            system_prompt, user_prompt = topic_review_prompts(report)
            llm = LLMService()
            raw = llm.generate_response_with_fallback(
                messages=[{'role': 'user', 'content': user_prompt}],
                preferred_provider=request.data.get('provider') or None,
                system=system_prompt,
                max_tokens=700,
            )
            report = apply_topic_judgments(report, parse_topic_judgments(raw))
        except Exception as exc:
            logger.exception('Topic wording review failed for course %s', course_id)
            cot_error = 'Wording review could not be completed.'
    report['checked_at'] = checked_now()
    if cot_error:
        report['cot_error'] = cot_error

    if can_edit:
        content = dict(syllabus.syllabus_content)
        content['consistency_report'] = report
        syllabus.syllabus_content = content
        syllabus.save(update_fields=['syllabus_content'])
    return Response({'success': True, 'report': report}, status=status.HTTP_200_OK)


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
    owner_error = _module_owner_response(module, request.user)
    if owner_error:
        return owner_error

    search_query = f"{module.module_title} {subtopic_title} concepts explanation"

    try:
        reference = generation_reference(
            search_query,
            course=course,
            institution_id=request.user.institution_id,
            top_k=5,
            selected_doc_ids=[str(d) for d in selected_doc_ids],
        )

        system_prompt, user_prompt = CoTPromptBuilder.build_subtopic_content_prompt(
            course_name=course.course_title,
            module_title=module.module_title,
            subtopic_title=subtopic_title,
            existing_content=existing_content,
            context_chunks=reference["source_chunks"],
            context_summary=reference["structure_summary"],
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
            {"success": False, "error": "Something went wrong. Please try again."},
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
    owner_error = _module_owner_response(module, request.user)
    if owner_error:
        return owner_error

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
            {"success": False, "error": "Something went wrong. Please try again."},
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
    """Return the best matching assessment task or TOS exam by code or label."""
    entries = entries if isinstance(entries, list) else []
    code = (code or '').strip().lower()
    label = (label or '').strip().lower()
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        entry_code = str(entry.get('code') or entry.get('examCode') or '').strip().lower()
        entry_label = str(
            entry.get('task') or entry.get('label') or entry.get('examLabel') or ''
        ).strip().lower()
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


BLOOM_ORDER = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']


def _to_float(value, default=0.0):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if number != number:
        return default
    return number


def _materialize_tos_exam(exam):
    """Fill weight, minutes, points, and Bloom item counts from the TOS formula.

    Weight of Topic (%) = instructional hours on the topic / total instructional hours × 100.
    Number of items for the topic = (that weight / 100) × total exam items.
    Topic points and exam minutes use that same share, via largest-remainder
    so the integers add up to the exam totals. Bloom items use each topic's
    Bloom percentages against that topic's points. Stored Bloom counts are
    kept when the row has no percentages yet.
    """
    if not isinstance(exam, dict):
        return exam

    topics = [row if isinstance(row, dict) else {} for row in (exam.get('topics') or [])]
    total_items = max(0, _to_int(exam.get('totalTestItems')))
    total_minutes = max(0, _to_int(exam.get('totalExamMinutes')))
    hours = [max(0.0, _to_float(row.get('hours_class'))) for row in topics]
    hour_sum = sum(hours)
    points = (
        _largest_remainder_allocation(total_items, hours)
        if hour_sum > 0 and total_items > 0
        else None
    )
    minutes = (
        _largest_remainder_allocation(total_minutes, hours)
        if hour_sum > 0 and total_minutes > 0
        else None
    )

    materialized = []
    for index, row in enumerate(topics):
        next_row = dict(row)
        topic_points = points[index] if points is not None else max(0, _to_int(row.get('total_points')))
        if points is not None:
            next_row['total_points'] = topic_points
            next_row['weight'] = round((hours[index] / hour_sum) * 100, 1) if hour_sum else 0
        if minutes is not None:
            next_row['hours_min'] = minutes[index]

        bloom_pct = row.get('bloom_pct') if isinstance(row.get('bloom_pct'), dict) else {}
        percentages = [max(0.0, _to_float(bloom_pct.get(key))) for key in BLOOM_ORDER]
        if any(value > 0 for value in percentages):
            bloom_alloc = _largest_remainder_allocation(topic_points, percentages)
            next_row['bloom_items'] = {
                key: bloom_alloc[bloom_index]
                for bloom_index, key in enumerate(BLOOM_ORDER)
            }
        materialized.append(next_row)

    next_exam = dict(exam)
    next_exam['topics'] = materialized
    return next_exam


def _build_sectioned_assessment_payload(
    topic_rows, assessment_type, total_items, ilos=None, ilo_bloom=None,
    assessment_label='Assessment', default_bloom_weights=None,
):
    """
    Build sectioned assessment items from TOS topic rows.

    Topic size comes from the hours formula already stored on the row:
    weight (%) = topic hours / total hours × 100, and the item count is
    (weight / 100) × N. Bloom cells the faculty filled are copied as entered.
    A row with no Bloom cells uses only the ILO levels checked on that row,
    split evenly. Item numbers follow the TOS from top to bottom, and within
    a topic from left to right across the Bloom cells that have items.
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
                'item_share': row_total,
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

    any_share = any(_to_int(section.get('item_share')) > 0 for section in sections)
    if any_share:
        section_alloc = [_to_int(section.get('item_share')) for section in sections]
    else:
        total_items = max(1, int(total_items or 1))
        section_alloc = _largest_remainder_allocation(total_items, [s['weight'] for s in sections])

    ilo_bloom_map = {}
    ilo_text_map = {}
    ilos = ilos or []
    ilo_bloom = ilo_bloom or []
    for idx, text in enumerate(ilos):
        if not text:
            continue
        key = str(idx + 1)
        ilo_text_map[key] = str(text).strip()
        bloom = ilo_bloom[idx] if idx < len(ilo_bloom) and isinstance(ilo_bloom[idx], dict) else {}
        ilo_bloom_map[key] = {
            'level': str(bloom.get('level') or '').strip(),
            'verb': str(bloom.get('verb') or '').strip(),
        }

    def _checked_ilo_levels(section):
        levels = []
        for ilo_ref in section['ilos']:
            ref_num = re.sub(r'\D+', '', str(ilo_ref))
            level = _normalize_bloom_key((ilo_bloom_map.get(ref_num) or {}).get('level'))
            if level in BLOOM_ORDER and level not in levels:
                levels.append(level)
        return levels

    def _slot_ilo_context(section, bloom_key):
        matched_verb = ''
        matched_texts = []
        fallback_texts = []
        for ilo_ref in section['ilos']:
            ref_num = re.sub(r'\D+', '', str(ilo_ref))
            info = ilo_bloom_map.get(ref_num) or {}
            text = ilo_text_map.get(ref_num) or ''
            if text:
                fallback_texts.append(text)
            if _normalize_bloom_key(info.get('level')) == bloom_key:
                if info.get('verb') and not matched_verb:
                    matched_verb = info['verb']
                if text and text not in matched_texts:
                    matched_texts.append(text)
        return matched_verb, (matched_texts or fallback_texts)

    bloom_order = list(BLOOM_ORDER)
    checked_levels = [_checked_ilo_levels(section) for section in sections]
    faculty_set_cognition = any(
        sum(section['bloom_counts'].values()) > 0 or checked_levels[index]
        for index, section in enumerate(sections)
    )
    plans = []
    for idx, section in enumerate(sections):
        allocated = max(0, section_alloc[idx])
        bloom_weights = [section['bloom_counts'].get(key, 0) for key in bloom_order]
        if sum(bloom_weights) > 0:
            bloom_alloc = list(bloom_weights)
            allocated = sum(bloom_weights)
        elif allocated > 0 and checked_levels[idx]:
            selected = checked_levels[idx]
            bloom_alloc = _largest_remainder_allocation(
                allocated,
                [1 if key in selected else 0 for key in bloom_order],
            )
            allocated = sum(bloom_alloc)
        elif allocated > 0 and default_bloom_weights:
            fallback_weights = list(default_bloom_weights)
            nonzero_bloom_indices = [i for i, weight in enumerate(fallback_weights) if weight > 0]
            nonzero_alloc = _largest_remainder_allocation(
                allocated,
                [fallback_weights[i] for i in nonzero_bloom_indices],
            )
            bloom_alloc = [0] * len(bloom_order)
            for bloom_index, count in zip(nonzero_bloom_indices, nonzero_alloc):
                bloom_alloc[bloom_index] = count
        elif allocated > 0 and not faculty_set_cognition:
            bloom_alloc = [0] * len(bloom_order)
            bloom_alloc[0] = allocated
        else:
            bloom_alloc = [0] * len(bloom_order)
            allocated = 0
        plans.append(
            {
                'section': section,
                'allocated': allocated,
                'bloom_alloc': bloom_alloc,
                'items': [],
            }
        )

    running_item_no = 1
    for plan in plans:
        section = plan['section']
        for bloom_index, bloom_key in enumerate(bloom_order):
            count = plan['bloom_alloc'][bloom_index]
            verb, ilo_texts = _slot_ilo_context(section, bloom_key)
            for local_idx in range(count):
                plan['items'].append(
                    {
                        'item_number': running_item_no,
                        'item_type': assessment_type,
                        'section_title': section['section_title'],
                        'exam_label': section['exam_label'],
                        'bloom_level': bloom_key.title(),
                        'bloom_verb': verb,
                        'ilo_refs': section['ilos'],
                        'ilo_text': '; '.join(ilo_texts),
                        'question_text': (
                            f"[{section['section_title']}] {assessment_type.title()} item "
                            f"{local_idx + 1} ({bloom_key.title()})"
                        ).strip(),
                    }
                )
                running_item_no += 1

    section_payloads = []
    for plan in plans:
        if plan['allocated'] <= 0:
            continue
        section_payloads.append(
            {
                'section_title': plan['section']['section_title'],
                'exam_label': plan['section']['exam_label'],
                'allocated_items': plan['allocated'],
                'bloom_distribution': {
                    bloom_order[i].title(): plan['bloom_alloc'][i]
                    for i in range(len(bloom_order))
                    if plan['bloom_alloc'][i] > 0
                },
                'items': plan['items'],
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


def _align_generated_section_to_blueprint(generated_section, blueprint_section):
    """Keep the blueprint's item count and Bloom level on every generated item."""
    blueprint_items = blueprint_section.get('items') or []
    generated_items = generated_section.get('items') if isinstance(generated_section, dict) else []
    if not isinstance(generated_items, list):
        generated_items = []

    by_number = {}
    for item in generated_items:
        if not isinstance(item, dict):
            continue
        number = _to_int(item.get('item_number'), 0)
        if number > 0 and number not in by_number:
            by_number[number] = item

    aligned = []
    for index, blueprint_item in enumerate(blueprint_items):
        source = by_number.get(_to_int(blueprint_item.get('item_number'), 0))
        if source is None and index < len(generated_items) and isinstance(generated_items[index], dict):
            source = generated_items[index]
        source = source or {}
        question = str(source.get('question_text') or '').strip() or str(blueprint_item.get('question_text') or '').strip()
        choices = _normalize_choices(source.get('choices')) or _normalize_choices(blueprint_item.get('choices'))
        aligned.append(
            {
                'item_number': blueprint_item.get('item_number'),
                'item_type': str(source.get('item_type') or blueprint_item.get('item_type') or 'Multiple Choice'),
                'section_title': blueprint_section.get('section_title') or '',
                'exam_label': blueprint_section.get('exam_label') or '',
                'bloom_level': blueprint_item.get('bloom_level') or '',
                'bloom_verb': blueprint_item.get('bloom_verb') or '',
                'ilo_refs': blueprint_item.get('ilo_refs') or [],
                'question_text': _exam_wording(question),
                'choices': [_exam_wording(choice) for choice in choices],
                'correct_answer': str(source.get('correct_answer') or blueprint_item.get('correct_answer') or 'A').strip()[:1].upper() or 'A',
                'answer_key': _exam_wording(source.get('answer_key') or ''),
                'points': _to_int(source.get('points'), 0),
            }
        )

    return {
        'section_title': blueprint_section.get('section_title') or '',
        'exam_label': blueprint_section.get('exam_label') or '',
        'allocated_items': len(aligned),
        'bloom_distribution': blueprint_section.get('bloom_distribution') or {},
        'items': aligned,
    }


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


_PLACEHOLDER_QUESTION = re.compile(
    r'^\[[^\]]+\]\s+.+\sitem\s+\d+\s+\([^)]+\)\s*$',
    re.IGNORECASE,
)
ASSESSMENT_SLOT_BATCH = 6


def _is_placeholder_question(question_text):
    text = str(question_text or '').strip()
    if not text or text.lower() in {'...', 'tbd', 'na', 'n/a'}:
        return True
    return bool(_PLACEHOLDER_QUESTION.match(text))


_SOURCE_CITE = re.compile(
    r'(?i)\b(?:according to|based on|as (?:stated|described|mentioned|explained) in|'
    r'mentioned in|described in|from)\s+(?:the\s+)?'
    r'(?:module|lesson|passage|course(?:\s+material)?|text|introductory module|hci introduction)\b[:,]?\s*'
)
_SOURCE_SUBJECT = re.compile(
    r'(?i)\b(?:the|this)\s+(?:module|lesson|passage|course material|text)\s+'
    r'(?:says|states|lists|explains|describes|mentions|highlights|notes)\s+(?:that\s+)?'
)
_GROUNDED_LABEL = re.compile(r'(?i)\bgrounded on (?:the )?module:?\s*')


def _exam_wording(text):
    """Drop citations of the module or the passage. The stem should read as an exam item."""
    cleaned = _GROUNDED_LABEL.sub('', str(text or ''))
    cleaned = _SOURCE_CITE.sub('', cleaned)
    cleaned = _SOURCE_SUBJECT.sub('', cleaned)
    cleaned = re.sub(r'\s{2,}', ' ', cleaned).strip(' ,;')
    if not cleaned:
        return str(text or '').strip()
    return cleaned[0].upper() + cleaned[1:]


def _coerce_generated_item_fields(item):
    """Map common model key names onto the assessment item fields."""
    if not isinstance(item, dict):
        return {}
    coerced = dict(item)
    if not str(coerced.get('question_text') or '').strip():
        for key in ('question', 'stem', 'prompt'):
            text = str(coerced.get(key) or '').strip()
            if text:
                coerced['question_text'] = text
                break
    if not coerced.get('choices') and coerced.get('options'):
        coerced['choices'] = coerced.get('options')
    if not str(coerced.get('correct_answer') or '').strip():
        for key in ('answer', 'correct', 'correct_option'):
            text = str(coerced.get(key) or '').strip()
            if text:
                coerced['correct_answer'] = text[:1].upper()
                break
    if not str(coerced.get('answer_key') or '').strip():
        for key in ('explanation', 'rationale', 'answer_explanation'):
            text = str(coerced.get(key) or '').strip()
            if text:
                coerced['answer_key'] = text
                break
    return coerced


def _fill_answer_key_fallback(item):
    if str(item.get('answer_key') or '').strip():
        return item
    letter = str(item.get('correct_answer') or '').strip()[:1].upper()
    if letter in 'ABCD':
        item['answer_key'] = f'Option {letter} is the correct answer.'
    return item


def _errors_are_only_missing_answer_key(errors):
    return errors == ['answer_key (explanation) is missing.']


def _compact_assessment_slot(section):
    """Prompt payload for one section: slot identity only, no dummy stems or choices."""
    return {
        'section_title': section.get('section_title') or '',
        'exam_label': section.get('exam_label') or '',
        'allocated_items': section.get('allocated_items') or len(section.get('items') or []),
        'bloom_distribution': section.get('bloom_distribution') or {},
        'items': [
            {
                'item_number': item.get('item_number'),
                'bloom_level': item.get('bloom_level') or '',
                'bloom_verb': item.get('bloom_verb') or '',
                'ilo_refs': item.get('ilo_refs') or [],
                'ilo_text': item.get('ilo_text') or '',
            }
            for item in (section.get('items') or [])
            if isinstance(item, dict)
        ],
    }


def _section_for_slots(section, items):
    distribution = {}
    for item in items:
        level = str(item.get('bloom_level') or '').strip()
        if level:
            distribution[level] = distribution.get(level, 0) + 1
    return {
        'section_title': section.get('section_title') or '',
        'exam_label': section.get('exam_label') or '',
        'allocated_items': len(items),
        'bloom_distribution': distribution,
        'items': list(items),
    }


def _prepare_generated_section(generated_section):
    if isinstance(generated_section, list):
        generated_section = {'items': generated_section}
    if not isinstance(generated_section, dict):
        return {'items': []}
    items = generated_section.get('items')
    if not isinstance(items, list):
        if generated_section.get('question_text') or generated_section.get('question') or generated_section.get('stem'):
            items = [generated_section]
        else:
            items = []
    prepared = dict(generated_section)
    prepared['items'] = [
        _coerce_generated_item_fields(item) if isinstance(item, dict) else item
        for item in items
    ]
    return prepared


def _collect_section_items(blueprint_section, generated_section):
    """Keep items that already pass, and list slot numbers that need another try."""
    aligned = _align_generated_section_to_blueprint(
        _prepare_generated_section(generated_section),
        blueprint_section,
    )
    accepted = {}
    retry_numbers = []
    for item in aligned.get('items') or []:
        coerced = _coerce_generated_item_fields(item)
        number = _to_int(coerced.get('item_number'), 0)
        slot_bloom = normalize_bloom_key(coerced.get('bloom_level'))
        asked = verb_levels(coerced.get('question_text'))
        if _generated_item_quality_errors(coerced) or (asked and slot_bloom and slot_bloom not in asked):
            if number > 0:
                retry_numbers.append(number)
            continue
        if number > 0:
            accepted[number] = coerced
    return accepted, retry_numbers


def _normalize_slot_item(parsed, blueprint_item, section):
    parsed = _coerce_generated_item_fields(parsed)
    return {
        'item_number': blueprint_item.get('item_number'),
        'item_type': 'Multiple Choice',
        'section_title': section.get('section_title') or '',
        'exam_label': section.get('exam_label') or blueprint_item.get('exam_label') or '',
        'bloom_level': blueprint_item.get('bloom_level') or '',
        'bloom_verb': str(parsed.get('bloom_verb') or blueprint_item.get('bloom_verb') or '').strip(),
        'ilo_refs': blueprint_item.get('ilo_refs') or [],
        'question_text': str(parsed.get('question_text') or '').strip(),
        'choices': _normalize_choices(parsed.get('choices')),
        'correct_answer': str(parsed.get('correct_answer') or '').strip()[:1].upper(),
        'answer_key': str(parsed.get('answer_key') or '').strip(),
        'points': max(0, _to_int(parsed.get('points'), 0)),
    }


def _parse_model_json(text):
    if not isinstance(text, str) or not text.strip():
        return None
    clean = re.sub(r'^```(?:json)?\s*', '', text.strip())
    clean = re.sub(r'\s*```$', '', clean).strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', clean, re.DOTALL)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None


def _closed_dicts(text):
    """JSON objects that closed, even when the reply was cut off around them."""
    found = []
    starts = []
    in_string = False
    escape = False
    body = str(text or '')
    for index, char in enumerate(body):
        if in_string:
            if escape:
                escape = False
            elif char == '\\':
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == '{':
            starts.append(index)
        elif char == '}' and starts:
            start = starts.pop()
            try:
                obj = json.loads(body[start:index + 1])
            except json.JSONDecodeError:
                continue
            if isinstance(obj, dict):
                found.append(obj)
    return found


def _items_from_model_text(text):
    """Items from a JSON reply, including a reply that stopped mid-array."""
    parsed = _parse_model_json(text)
    if isinstance(parsed, list) and parsed:
        return [row for row in parsed if isinstance(row, dict)]
    if isinstance(parsed, dict):
        items = parsed.get('items')
        if isinstance(items, list) and items:
            return [row for row in items if isinstance(row, dict)]
        if str(parsed.get('question_text') or '').strip():
            return [parsed]
    recovered = []
    seen = set()
    for obj in _closed_dicts(text):
        question = str(obj.get('question_text') or '').strip()
        if not question:
            continue
        number = obj.get('item_number')
        key = number if number else id(obj)
        if key in seen:
            continue
        seen.add(key)
        recovered.append(obj)
    return recovered


def _generated_item_quality_errors(item_payload):
    errors = []

    question_text = str(item_payload.get('question_text') or '').strip()
    if not question_text or _is_placeholder_question(question_text):
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


def _clip_words(text, limit):
    body = str(text or '').strip()
    if len(body) <= limit:
        return body
    clipped = body[:limit].rsplit(' ', 1)[0].strip()
    return (clipped or body[:limit]) + '…'


def _module_teaching_text(module, char_limit=2000):
    """Lesson text for one module: introduction plus each subtopic's body.

    The title-only excerpt left generation with nothing to ask about, so items
    were written from general subject knowledge instead of the module.
    """
    module_content = module.module_content if isinstance(module.module_content, dict) else {}
    parts = [f"Module: {getattr(module, 'module_title', '') or 'Module'}"]
    introduction = _clip_words(module_content.get('introduction'), 600)
    if introduction:
        parts.append(introduction)
    objectives = [
        str(value).strip()
        for value in (module_content.get('learning_objectives') or [])
        if str(value).strip()
    ]
    if objectives:
        parts.append('Objectives: ' + '; '.join(objectives[:6]))
    used = len('\n'.join(parts))
    for subtopic in (module_content.get('subtopics') or []):
        if not isinstance(subtopic, dict):
            continue
        title = str(subtopic.get('title') or '').strip()
        body = str(subtopic.get('content') or '').strip()
        block = f"{title}: {body}".strip(': ') if title or body else ''
        if not block:
            continue
        room = char_limit - used - 1
        if room < 80:
            break
        block = _clip_words(block, room)
        parts.append(block)
        used += len(block) + 1
    activity = module_content.get('short_activity') if isinstance(module_content.get('short_activity'), dict) else {}
    description = str(activity.get('description') or '').strip()
    if description and used < char_limit - 40:
        parts.append('Activity: ' + _clip_words(description, char_limit - used))
    return '\n'.join(parts)[:char_limit]


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


def _topic_upload_passages(course, topics, selected_doc_ids, top_k=3):
    """Retrieve one passage set per topic from this course's uploads.

    Batch generation used to see only a course brief and a title list, so the
    items were not written from the uploaded material.
    """
    labels = []
    seen = set()
    for topic in topics or []:
        label = str(topic or '').strip()
        key = _normalize_topic_key(label)
        if not key or key in seen:
            continue
        seen.add(key)
        labels.append(label)
    if not labels:
        return {}
    queries = [f"{getattr(course, 'course_title', '')} {label}".strip() for label in labels]
    try:
        vectors = embed_queries(queries)
    except Exception:
        logger.exception('Assessment topic embeddings failed')
        return {}
    if len(vectors) != len(queries):
        return {}
    found = {}
    for label, query, vector in zip(labels, queries, vectors):
        if vector is None:
            continue
        try:
            chunks = course_semantic_search(
                query,
                course=course,
                top_k=top_k,
                selected_doc_ids=selected_doc_ids or None,
                query_vec=vector,
            )
        except Exception:
            logger.exception('Assessment topic search failed for %s', label)
            chunks = []
        text = _clip_words(_qa_passage_text(chunks, ''), 1800)
        if text:
            found[_normalize_topic_key(label)] = text
    return found


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
        selected_exam = _materialize_tos_exam(selected_exam)
        exam_label = str(selected_exam.get('examLabel') or selected_exam.get('examCode') or '').strip()
        exam_code = str(selected_exam.get('examCode') or '').strip()
        topic_rows = [row for row in (selected_exam.get('topics') or []) if isinstance(row, dict)]

    normalized_faculty_topics = [
        {
            'topic': str(topic).strip(),
            'ilos': [],
            'weight': '',
            'bloom_items': {},
            'total_points': '',
        }
        for topic in (faculty_topics or [])
        if str(topic).strip()
    ]
    if normalized_faculty_topics:
        # Faculty selection narrows the selected TOS exam, but never replaces its
        # Bloom distribution, ILO mapping, or item allocation. This keeps TOS as
        # the assessment authority while allowing topic-level selection in the UI.
        requested_topics = {
            _normalize_topic_key(row.get('topic'))
            for row in normalized_faculty_topics
            if _normalize_topic_key(row.get('topic'))
        }
        tos_topic_rows = [
            row for row in topic_rows
            if _normalize_topic_key(row.get('topic') or row.get('label')) in requested_topics
        ]
        topic_rows = tos_topic_rows or topic_rows

    bloom_total = 0
    for row in topic_rows:
        bloom_items = row.get('bloom_items') if isinstance(row.get('bloom_items'), dict) else {}
        bloom_total += sum(_to_int(bloom_items.get(key)) for key in BLOOM_ORDER)

    total_items = bloom_total
    if total_items <= 0 and isinstance(selected_exam, dict):
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
    qa_report = assessment.qa_report if isinstance(assessment.qa_report, dict) else None
    qa_items = (qa_report or {}).get('items') if isinstance((qa_report or {}).get('items'), dict) else {}
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
                'question_text': _exam_wording(item.question_text),
                'choices': [_exam_wording(choice) for choice in (metadata.get('choices') or [])],
                'correct_answer': metadata.get('correct_answer') or '',
                'answer_key': _exam_wording(metadata.get('answer_key') or ''),
                'points': _to_int(metadata.get('points'), 0),
                'matched_module_id': metadata.get('matched_module_id'),
                'matched_module_title': metadata.get('matched_module_title') or '',
                'matched_module_week': metadata.get('matched_module_week'),
                'qa': qa_items.get(str(item.item_id)),
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
        'qa_report': qa_report,
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


def _assessment_docx_items(assessment_payload):
    """Questions in number order, whether they arrive grouped or as a flat list."""
    collected = []
    sections = assessment_payload.get('sections') if isinstance(assessment_payload, dict) else None
    if isinstance(sections, list) and sections:
        for section in sections:
            if isinstance(section, dict):
                collected.extend(section.get('items') or [])
    elif isinstance(assessment_payload, dict):
        collected.extend(assessment_payload.get('items') or [])
    items = [item for item in collected if isinstance(item, dict)]
    items.sort(key=lambda item: (_to_int(item.get('item_number'), 10**9), str(item.get('question_text') or '')))
    return items


def _exam_choice_line(choice, index):
    text = re.sub(r'^[A-Da-d][\.\)]\s*', '', str(choice or '').strip()).strip()
    if not text:
        return ''
    return f'{chr(65 + index)}. {text}'


def _exam_answer_letter(item):
    raw = str(item.get('correct_answer') or '').strip().upper()
    match = re.match(r'^([A-D])(?:\b|[\.\)])', raw)
    return match.group(1) if match else ''


def _build_plain_assessment_docx(assessment_payload, include_choices=True, include_answer_key=True):
    """Exam pages are the question and its choices. Answer letters, if requested, start on the last page."""
    from docx import Document
    from docx.shared import Pt, RGBColor, Inches
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    doc = Document()
    for section in doc.sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1.1)
        section.right_margin = Inches(1.1)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run(assessment_payload.get('title') or 'Assessment')
    run.bold = True
    run.font.size = Pt(15)
    run.font.color.rgb = RGBColor(0x8B, 0x00, 0x00)

    doc.add_paragraph()
    items = _assessment_docx_items(assessment_payload)
    for index, item in enumerate(items, start=1):
        number = _to_int(item.get('item_number'), 0) or index
        question = doc.add_paragraph(f"{number}. {str(item.get('question_text') or '').strip()}")
        if question.runs:
            question.runs[0].font.size = Pt(11)
        if include_choices:
            for choice_index, choice in enumerate((item.get('choices') or [])[:4]):
                line = _exam_choice_line(choice, choice_index)
                if not line:
                    continue
                choice_paragraph = doc.add_paragraph(line)
                choice_paragraph.paragraph_format.left_indent = Inches(0.35)
                if choice_paragraph.runs:
                    choice_paragraph.runs[0].font.size = Pt(11)
        doc.add_paragraph()

    if include_answer_key:
        letters = [
            (_to_int(item.get('item_number'), 0) or index, _exam_answer_letter(item))
            for index, item in enumerate(items, start=1)
        ]
        letters = [(number, letter) for number, letter in letters if letter]
        if letters:
            doc.add_page_break()
            for number, letter in letters:
                answer = doc.add_paragraph(f'{number}. {letter}')
                if answer.runs:
                    answer.runs[0].font.size = Pt(12)

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
    # Assessments are TOS-based. A major examination with topic rows is required;
    # faculty_topics can only narrow that TOS selection.
    has_tos_exam = isinstance(source.get('selected_exam'), dict)
    if not has_tos_exam:
        if not source['topic_rows']:
            return Response(
                {
                    'success': False,
                    'detail': 'No major examination with TOS topics found. Complete the TOS tab before creating an assessment.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        requested_total_items = _to_int(request.data.get('total_items'), 0)
        if requested_total_items > 0:
            source['total_items'] = requested_total_items

    total_items = source['total_items'] or 1
    sections = _build_sectioned_assessment_payload(
        source['topic_rows'],
        assessment_type or source['assessment_type'],
        total_items,
        ilos=syllabus_content.get('ilos') or [],
        ilo_bloom=syllabus_content.get('ilo_bloom') or [],
        assessment_label=source['assessment_name'],
        default_bloom_weights=None,
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
        module_excerpt = _module_teaching_text(matched_module) if matched_module else ''

        search_query = request.data.get('search_query') or (
            f"{course.course_title} {source['assessment_name']} {target_section.get('section_title')} MCQ"
        )
        top_k = max(1, _to_int(request.data.get('top_k'), 3))
        reference = generation_reference(
            search_query,
            course=course,
            institution_id=request.user.institution_id,
            top_k=top_k,
            selected_doc_ids=selected_doc_ids,
        )
        reference_material = CoTPromptBuilder._format_context(
            reference["source_chunks"],
            reference["structure_summary"],
        )

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
        item_slot = {
            'item_number': target_item_number,
            'section_title': target_section.get('section_title') or '',
            'exam_label': target_item_blueprint.get('exam_label') or source['assessment_name'],
            'bloom_level': target_item_blueprint.get('bloom_level') or '',
            'bloom_verb': target_item_blueprint.get('bloom_verb') or '',
            'ilo_refs': target_item_blueprint.get('ilo_refs') or [],
        }
        item_blueprint_json = json.dumps(item_slot, ensure_ascii=False, indent=2)

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
{reference_material}

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
{reference_material}

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
7. The slot has no question yet. Write a new question_text and four real choices. Do not use placeholder text such as ellipsis, TBD, N/A, or Option A.
8. Put the explanation of the correct choice in answer_key.
9. Write a college exam stem for the blueprint bloom_level. Remember asks which fact is true. Understand asks what the idea means. Apply, Analyze, Evaluate, and Create use a short new situation like the source, not the source's own example.
10. The correct choice must follow from the reference material. Do not name a standard, scale, method, or principle that text does not name.
11. Do not write according to the module, the passage, the lesson, or the course. The answer_key must not cite them either.
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
        if not manual_mode and isinstance(parsed_item, dict):
            parsed_item = _coerce_generated_item_fields(parsed_item)
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
                else _exam_wording(parsed_item.get('question_text'))
            ),
            'choices': _normalize_choices(parsed_item.get('choices')),
            'correct_answer': str(parsed_item.get('correct_answer') or 'A').strip()[:1].upper() or 'A',
            'answer_key': _exam_wording(parsed_item.get('answer_key')),
            'points': max(0, _to_int(parsed_item.get('points'), _to_int(target_item_blueprint.get('points'), 0))),
        }

        if not manual_mode:
            quality_errors = _generated_item_quality_errors(normalized_item)
            if _errors_are_only_missing_answer_key(quality_errors):
                normalized_item = _fill_answer_key_fallback(normalized_item)
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
        update_fields = []
        if target_assessment.status != next_status:
            target_assessment.status = next_status
            target_assessment.generated_at = timezone.now()
            update_fields.extend(['status', 'generated_at'])
        update_fields = _clear_assessment_qa(target_assessment, update_fields)
        if update_fields:
            target_assessment.save(update_fields=update_fields)

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
            update_fields = _clear_assessment_qa(target_assessment, ['status', 'generated_at'])
            target_assessment.save(update_fields=update_fields)
        elif target_assessment.qa_report or str(target_assessment.status or '').lower() == 'approved':
            target_assessment.qa_report = None
            update_fields = ['qa_report']
            if str(target_assessment.status or '').lower() == 'approved':
                target_assessment.status = 'Draft'
                update_fields.append('status')
            target_assessment.save(update_fields=update_fields)

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

    # Use a brief modules already cached. Do not distill one here: that call
    # runs before any item is saved, so the screen stays on "Preparing".
    from django.core.cache import cache
    from apps.integrations.course_brief import brief_cache_key, document_stamp
    from apps.integrations.tla_generation import assessment_batch_max_tokens

    cached_brief = cache.get(brief_cache_key(course.course_id, document_stamp(course, selected_doc_ids)))
    course_brief = cached_brief.strip() if isinstance(cached_brief, str) else ""
    brief_cached = bool(course_brief)
    llm = LLMService()
    logger.info(
        'Assessment generation module grounding: matched_sections=%d total_sections=%d course_id=%s brief_cached=%s',
        len(section_module_matches),
        len(sections),
        str(course.course_id),
        brief_cached,
    )

    system_prompt = (
        "You write college examination items. Reply with JSON only. No markdown."
    )
    providers_unavailable = False
    topic_passages = {}

    def _module_excerpt_for(section):
        section_key = _normalize_topic_key(section.get('section_title'))
        matched_module = section_module_matches.get(section_key)
        if not matched_module:
            return ''
        return _module_teaching_text(matched_module, char_limit=700)

    def _call_model(prompt, max_tokens):
        nonlocal providers_unavailable
        if providers_unavailable:
            raise ValueError('AI generation failed with all available providers.')
        try:
            return llm.generate_response_with_fallback(
                messages=[{'role': 'user', 'content': prompt}],
                preferred_provider=provider,
                system=system_prompt,
                max_tokens=max_tokens,
            )
        except ValueError as exc:
            message = str(exc)
            if 'all available providers' in message or 'No providers are configured' in message:
                providers_unavailable = True
            raise

    def _slice_prompt(slice_section):
        slots = _compact_assessment_slot(slice_section).get('items') or []
        count = len(slots)
        section_title = slice_section.get('section_title') or ''
        slot_json = json.dumps(slots, ensure_ascii=False, separators=(',', ':'))
        excerpt = _module_excerpt_for(slice_section)
        passages = _clip_words(topic_passages.get(_normalize_topic_key(section_title), ''), 500)
        lines = [
            f"Course: {course.course_title} ({course.course_code})",
            f"Assessment: {source['assessment_name']}",
            f"Section: {section_title}",
        ]
        if extra_instructions:
            lines.append(f"Instructions: {extra_instructions[:300]}")
        lines.extend([
            "",
            "Course brief:",
            (course_brief or "No course brief.").strip(),
            "",
            "Facts the answer must follow:",
            excerpt or "None",
            "",
            "Source examples. Invent a similar case. Do not copy these:",
            passages or "None",
            "",
            f"Write {count} college exam items, one per slot, in this order.",
            slot_json,
            "",
            'Return {"items":[{"item_number":1,"question_text":"...","choices":["A. ...","B. ...","C. ...","D. ..."],"correct_answer":"A","answer_key":"...","bloom_level":"...","bloom_verb":"...","ilo_refs":[]}]}',
            "Keep each slot's item_number, bloom_level, bloom_verb, and ilo_refs.",
            "Stay on the slot's bloom_level. Remember and Understand ask which fact is true, and may use a new case.",
            "Apply, Analyze, Evaluate, and Create use a new case. Do not open a Remember stem with Evaluate, Judge, Design, or Create.",
            "The correct choice must follow from the facts. Do not add a standard or method the facts do not name.",
            "Do not write according to the module, the passage, the lesson, or the course.",
            "Each item asks a different question. Stem under 40 words. Each choice under 14 words.",
            "Exactly 4 choices. correct_answer is A, B, C, or D. answer_key is one sentence with no source citation.",
            "No placeholder text. JSON only.",
        ])
        return "\n".join(lines)

    def _generate_slice(slice_section):
        count = len(slice_section.get('items') or [])
        raw = _call_model(_slice_prompt(slice_section), assessment_batch_max_tokens(count))
        items = _items_from_model_text(raw)
        if items:
            return _collect_section_items(slice_section, {'items': items})
        logger.warning(
            'Assessment slice for %s returned no items. Reply starts: %s',
            slice_section.get('section_title'),
            str(raw or '')[:300],
        )
        return {}, [item.get('item_number') for item in (slice_section.get('items') or [])]

    incremental = _to_bool(request.data.get('incremental'), False)
    planned_numbers = []
    for section in sections:
        for item in (section.get('items') or []):
            number = _to_int(item.get('item_number'), 0)
            if number > 0:
                planned_numbers.append(number)
    planned_total = len(planned_numbers) or total_generated
    incremental_assessment = None
    existing_numbers = set()
    if incremental:
        if assessment_id:
            incremental_assessment = Assessment.objects.filter(
                assessment_id=assessment_id,
                course=course,
            ).first()
            if not incremental_assessment:
                return Response(
                    {'success': False, 'detail': 'assessment_id was not found for this course.'},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            incremental_assessment = Assessment.objects.create(
                course=course,
                title=assessment_title,
                assessment_type=source['assessment_type'],
                term=term,
                status='Draft',
                generated_at=timezone.now(),
            )
        for saved_item in AssessmentItem.objects.filter(assessment=incremental_assessment):
            metadata = saved_item.rubric if isinstance(saved_item.rubric, dict) else {}
            item_no = _to_int(metadata.get('item_number'), 0)
            if item_no > 0:
                existing_numbers.add(item_no)

        def _incremental_payload(batch_generated, saved_count, missing, detail=''):
            completed = not missing
            next_status = 'Generated' if completed else 'Draft'
            update_fields = []
            if incremental_assessment.status != next_status:
                incremental_assessment.status = next_status
                incremental_assessment.generated_at = timezone.now()
                update_fields.extend(['status', 'generated_at'])
            update_fields = _clear_assessment_qa(incremental_assessment, update_fields)
            if update_fields:
                incremental_assessment.save(update_fields=update_fields)
            return {
                'success': batch_generated > 0 or completed,
                'incremental': True,
                'completed': completed,
                'batch_generated': batch_generated,
                'returned_count': batch_generated,
                'generated_count': saved_count,
                'total_items': planned_total,
                'missing_item_numbers': missing,
                'detail': detail,
                'assessment': {
                    'assessment_id': str(incremental_assessment.assessment_id),
                    'title': incremental_assessment.title,
                    'assessment_type': incremental_assessment.assessment_type,
                    'term': incremental_assessment.term,
                    'status': incremental_assessment.status,
                    'generated_at': incremental_assessment.generated_at,
                    'target_total_items': planned_total,
                    'total_items': saved_count,
                },
            }

        already_done = bool(planned_numbers) and set(planned_numbers).issubset(existing_numbers)
        if already_done or not planned_numbers:
            saved_count = AssessmentItem.objects.filter(assessment=incremental_assessment).count()
            return Response(
                _incremental_payload(0, saved_count, [] if already_done else planned_numbers),
                status=status.HTTP_200_OK,
            )

        remaining = ASSESSMENT_SLOT_BATCH
        narrowed = []
        for section in sections:
            if remaining <= 0:
                break
            kept = []
            for item in (section.get('items') or []):
                number = _to_int(item.get('item_number'), 0)
                if number > 0 and number not in existing_numbers:
                    kept.append(item)
            if not kept:
                continue
            take = kept[:remaining]
            remaining -= len(take)
            narrowed.append(_section_for_slots(section, take))
        sections = narrowed

    topic_passages.update(_topic_upload_passages(
        course,
        [section.get('section_title') for section in sections],
        selected_doc_ids,
    ))

    accepted_by_section = []
    saved_numbers = set()
    for section in sections:
        if providers_unavailable:
            break
        section_items = [item for item in (section.get('items') or []) if isinstance(item, dict)]
        accepted = {}
        for start in range(0, len(section_items), ASSESSMENT_SLOT_BATCH):
            if providers_unavailable:
                break
            item_slice = section_items[start:start + ASSESSMENT_SLOT_BATCH]
            slice_section = _section_for_slots(section, item_slice)
            retry_numbers = [item.get('item_number') for item in item_slice]
            try:
                got, retry_numbers = _generate_slice(slice_section)
                accepted.update(got)
            except Exception:
                logger.exception(
                    'Assessment section batch failed for %s',
                    section.get('section_title'),
                )
            if providers_unavailable:
                break
            if not retry_numbers:
                continue
            missing_numbers = {_to_int(number, 0) for number in retry_numbers}
            missing = [
                item for item in item_slice
                if _to_int(item.get('item_number'), 0) in missing_numbers
            ]
            if not missing:
                continue
            try:
                got, _still_missing = _generate_slice(_section_for_slots(section, missing))
                accepted.update(got)
            except Exception:
                logger.exception(
                    'Assessment section retry failed for %s',
                    section.get('section_title'),
                )
            still = [
                item for item in missing
                if _to_int(item.get('item_number'), 0) not in accepted
            ]
            if len(still) > 2 and not providers_unavailable:
                for pair_start in range(0, len(still), 2):
                    if providers_unavailable:
                        break
                    pair = still[pair_start:pair_start + 2]
                    try:
                        got, _ignored = _generate_slice(_section_for_slots(section, pair))
                        accepted.update(got)
                    except Exception:
                        logger.exception(
                            'Assessment pair retry failed for %s',
                            section.get('section_title'),
                        )
        for number, item in accepted.items():
            saved_numbers.add(number)
        ordered = [accepted[number] for number in sorted(accepted)]
        if ordered:
            accepted_by_section.append({
                'section_title': section.get('section_title') or '',
                'exam_label': section.get('exam_label') or '',
                'allocated_items': len(ordered),
                'bloom_distribution': _section_for_slots(section, ordered).get('bloom_distribution') or {},
                'items': ordered,
            })

    if incremental:
        create_items = []
        for section in accepted_by_section:
            section_key = _normalize_topic_key(section.get('section_title'))
            matched_module = section_module_matches.get(section_key)
            for item in section['items']:
                number = _to_int(item.get('item_number'), 0)
                if number <= 0 or number in existing_numbers:
                    continue
                existing_numbers.add(number)
                create_items.append(
                    AssessmentItem(
                        assessment=incremental_assessment,
                        module=matched_module,
                        question_text=str(item.get('question_text') or '').strip() or f"{item.get('item_number')}. Item",
                        item_type=source['assessment_type'],
                        difficulty=item.get('bloom_level') or '',
                        rubric={
                            'item_number': item.get('item_number'),
                            'section_title': item.get('section_title') or section.get('section_title'),
                            'exam_label': item.get('exam_label') or section.get('exam_label'),
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
                            'assessment_total_items': planned_total,
                            'matched_module_id': str(matched_module.module_id) if matched_module else None,
                            'matched_module_title': matched_module.module_title if matched_module else '',
                            'matched_module_week': matched_module.week_number if matched_module else None,
                        },
                    )
                )
        if create_items:
            AssessmentItem.objects.bulk_create(create_items)
        missing = [number for number in planned_numbers if number not in existing_numbers]
        saved_count = AssessmentItem.objects.filter(assessment=incremental_assessment).count()
        returned_items = [
            {
                'item_number': item.rubric.get('item_number'),
                'question_text': item.question_text,
                'section_title': item.rubric.get('section_title') or '',
            }
            for item in create_items
        ]
        detail = '' if returned_items or not missing else 'This batch did not return valid items.'
        payload = _incremental_payload(len(returned_items), saved_count, missing, detail)
        payload['returned_count'] = len(returned_items)
        payload['items'] = returned_items
        return Response(
            payload,
            status=status.HTTP_201_CREATED if returned_items else status.HTTP_200_OK,
        )

    requested_numbers = []
    for section in sections:
        for item in (section.get('items') or []):
            number = _to_int(item.get('item_number'), 0)
            if number > 0:
                requested_numbers.append(number)
    missing_item_numbers = [number for number in requested_numbers if number not in saved_numbers]
    saved_item_count = len(saved_numbers)

    if saved_item_count <= 0:
        if providers_unavailable:
            return Response(
                {'error': 'AI generation failed with all available providers.'},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
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
                'detail': 'Assessment generation did not return valid MCQ items for the TOS slots. Please retry.',
                'manual_entry_allowed': True,
                'assessment_id': str(fallback_assessment.assessment_id),
                'tos_counters': _build_tos_counters(source['topic_rows'], {}),
                'missing_item_numbers': missing_item_numbers,
                'manual_item_schema': {
                    'manual_items': [
                        {
                            'section_title': 'Topic from TOS',
                            'bloom_level': 'Remember|Understand|Apply|Analyze|Evaluate|Create',
                            'question_text': 'Question stem',
                            'choices': ['A. first option', 'B. second option', 'C. third option', 'D. fourth option'],
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

    sections = accepted_by_section
    assessment_status = 'Generated' if not missing_item_numbers else 'Draft'
    logger.info(
        'Assessment generation kept %s of %s TOS items; missing=%s course_id=%s assessment=%s',
        saved_item_count,
        len(requested_numbers),
        missing_item_numbers,
        str(course.course_id),
        source['assessment_name'],
    )

    assessment = Assessment.objects.create(
        course=course,
        title=assessment_title,
        assessment_type=source['assessment_type'],
        term=term,
        status=assessment_status,
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
            'total_items': saved_item_count,
            'missing_item_numbers': missing_item_numbers,
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


def _load_faculty_assessment(request, assessment_id):
    if not _is_faculty_user(request):
        return None, _faculty_only_response()
    try:
        assessment = Assessment.objects.select_related('course').get(assessment_id=assessment_id)
    except Assessment.DoesNotExist:
        return None, Response(
            {'success': False, 'detail': 'Assessment not found.'},
            status=status.HTTP_404_NOT_FOUND,
        )
    _, error_response = _get_assigned_course_or_403(request, assessment.course.course_id)
    if error_response:
        return None, error_response
    return assessment, None


def _check_assessment_sources(course, batches, section_matches, top_k, selected_doc_ids):
    """Judge each item against the module lesson and the uploaded passages.

    A matching module used to replace the upload search with a short title
    list, and one call tried to judge up to 40 items. The reply then stopped
    before the last items. The call uses a non-reasoning Groq model and does
    not fall through to Ollama.
    """
    from concurrent.futures import ThreadPoolExecutor
    from django.db import close_old_connections, connection

    topics = []
    seen = set()
    excerpts = {}
    for batch in batches:
        key = _normalize_topic_key(batch['topic'])
        if key not in excerpts:
            matched = section_matches.get(key)
            excerpts[key] = _module_teaching_text(matched, char_limit=2000) if matched else ''
        if key and key not in seen:
            seen.add(key)
            topics.append((key, batch['topic']))

    queries = [f"{course.course_title} {topic}".strip() for _key, topic in topics]
    try:
        vectors = embed_queries(queries) if queries else []
    except Exception:
        logger.exception('Assessment QA embeddings failed')
        vectors = []
    if len(vectors) != len(queries):
        vectors = [None] * len(queries)

    def passages_for(spec):
        key, query, vector = spec
        chunks = []
        if vector is not None:
            chunks = course_semantic_search(
                query,
                course=course,
                top_k=top_k,
                selected_doc_ids=selected_doc_ids or None,
                query_vec=vector,
            )
        return key, _qa_passage_text(chunks, '')

    def passages_for_thread(spec):
        close_old_connections()
        try:
            return passages_for(spec)
        finally:
            connection.close()

    specs = [
        (key, query, vector)
        for (key, _topic), query, vector in zip(topics, queries, vectors)
    ]
    if len(specs) > 1:
        with ThreadPoolExecutor(max_workers=min(4, len(specs))) as pool:
            retrieved = list(pool.map(passages_for_thread, specs))
    else:
        retrieved = [passages_for(spec) for spec in specs]
    uploads = {key: text for key, text in retrieved}

    prepared = []
    results = []
    for batch in batches:
        key = _normalize_topic_key(batch['topic'])
        passages = "\n\n".join(part for part in (excerpts.get(key), uploads.get(key)) if part)
        if passages:
            prepared.append({**batch, 'passages': passages})
        else:
            results.extend(verdicts_without_passages(batch['items']))

    groups = pack_source_batches(prepared, size=SOURCE_CHECK_PACK, char_budget=9000)
    llm = LLMService()

    def complete(group):
        system_prompt, user_prompt = grouped_source_check_prompt(group)
        item_count = sum(len(row.get('items') or []) for row in group)
        return llm.generate_quick_json(
            messages=[{'role': 'user', 'content': user_prompt}],
            system=system_prompt,
            max_tokens=source_check_max_tokens(item_count),
        )

    model_results, errors = run_grouped_source_checks(groups, complete)
    results.extend(model_results)
    calls = len(groups)

    covered = {
        row['item_id']
        for row in results
        if row.get('item_id') and row.get('verdict') in SOURCE_LABELS
    }
    retry = []
    for batch in prepared:
        missed = [
            item for item in (batch.get('items') or [])
            if str(item.get('item_id') or '') not in covered
        ]
        if missed:
            retry.append({**batch, 'items': missed})
    paused = any('paused' in str(err).lower() for err in errors)
    if retry and not paused:
        retry_groups = pack_source_batches(retry, size=SOURCE_CHECK_PACK, char_budget=9000)
        retry_results, retry_errors = run_grouped_source_checks(retry_groups, complete)
        results.extend(retry_results)
        errors.extend(retry_errors)
        calls += len(retry_groups)

    return results, errors, calls


def _qa_passage_text(chunks, excerpt):
    """Keep the matched span and a short surrounding section for the verdict."""
    lean = []
    for chunk in chunks or []:
        if not isinstance(chunk, dict):
            continue
        parent = str(chunk.get('parent_text') or '').strip()
        if len(parent) > 1400:
            parent = parent[:1400].rsplit(' ', 1)[0].strip() + '…'
        lean.append({**chunk, 'parent_text': parent})
    chunk_text = CoTPromptBuilder._format_source_passages(lean) if lean else ''
    return "\n\n".join(part for part in (chunk_text, excerpt) if part)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def run_assessment_qa(request, assessment_id):
    """Check saved items against the TOS blueprint and the retrieved source passages."""
    assessment, error_response = _load_faculty_assessment(request, assessment_id)
    if error_response:
        return error_response

    course = assessment.course
    latest_syllabus = (
        Syllabus.objects.filter(course=course)
        .order_by('-generated_at', '-syllabus_id')
        .first()
    )
    if not latest_syllabus or not isinstance(latest_syllabus.syllabus_content, dict):
        return Response(
            {'success': False, 'detail': 'Save a syllabus with a TOS before running the quality check.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    syllabus_content = latest_syllabus.syllabus_content
    saved_rows = []
    exam_code = ''
    exam_label = ''
    for item in AssessmentItem.objects.filter(assessment=assessment):
        rubric = item.rubric if isinstance(item.rubric, dict) else {}
        exam_code = exam_code or str(rubric.get('assessment_code') or '')
        exam_label = exam_label or str(rubric.get('exam_label') or '')
        saved_rows.append({
            'item_id': str(item.item_id),
            'item_number': _to_int(rubric.get('item_number'), 0),
            'section_title': rubric.get('section_title') or '',
            'bloom_level': rubric.get('bloom_level') or '',
            'ilo_refs': rubric.get('ilo_refs') or [],
            'question_text': item.question_text,
            'choices': rubric.get('choices') or [],
            'correct_answer': rubric.get('correct_answer') or '',
            'answer_key': rubric.get('answer_key') or '',
        })
    if not saved_rows:
        return Response(
            {'success': False, 'detail': 'This assessment has no items to check.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    source = _derive_assessment_source(
        syllabus_content,
        source_exam_code=exam_code,
        source_exam_label=exam_label or assessment.title,
    )
    if not source.get('topic_rows'):
        return Response(
            {'success': False, 'detail': 'No TOS topics found for this assessment.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    sections = _build_sectioned_assessment_payload(
        source['topic_rows'],
        assessment.assessment_type or source.get('assessment_type') or 'quiz',
        source.get('total_items') or len(saved_rows),
        ilos=syllabus_content.get('ilos') or [],
        ilo_bloom=syllabus_content.get('ilo_bloom') or [],
        assessment_label=source.get('assessment_name') or assessment.title,
    )
    structural = check_against_blueprint(sections, saved_rows)
    section_matches = _match_sections_to_course_modules(course, sections)
    batches = source_batches(structural)
    started = time.perf_counter()
    results, errors, model_calls = _check_assessment_sources(
        course,
        batches,
        section_matches,
        top_k=max(1, _to_int(request.data.get('top_k'), 2)),
        selected_doc_ids=[str(uid) for uid in (request.data.get('selected_doc_ids') or [])],
    )
    logger.info(
        'Assessment QA %s: %d topics, %d model calls, %.1fs',
        assessment.assessment_id,
        len(batches),
        model_calls,
        time.perf_counter() - started,
    )

    report = apply_source_results(structural, results, error='; '.join(errors))
    report['checked_at'] = checked_now()
    if errors:
        report['source_error'] = '; '.join(errors)
    assessment.qa_report = report
    assessment.status = 'Draft'
    assessment.save(update_fields=['qa_report', 'status'])
    return Response(
        {'success': True, 'qa_report': report, 'assessment': _assessment_detail_payload(assessment)},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def approve_assessment(request, assessment_id):
    """Record faculty approval once every item passed or carries an override note."""
    assessment, error_response = _load_faculty_assessment(request, assessment_id)
    if error_response:
        return error_response

    notes = request.data.get('notes') or {}
    if not isinstance(notes, dict):
        return Response(
            {'success': False, 'detail': 'notes must be an object of item id to override note.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    allocation_note = str(request.data.get('allocation_note') or '').strip()
    blockers = approval_blockers(assessment.qa_report, notes, allocation_note)
    if blockers:
        return Response(
            {'success': False, 'detail': 'The assessment is not ready to approve.', 'blockers': blockers},
            status=status.HTTP_400_BAD_REQUEST,
        )

    report = dict(assessment.qa_report or {})
    items = {}
    for item_id, record in (report.get('items') or {}).items():
        next_record = dict(record)
        note = str(notes.get(item_id) or '').strip()
        if note and not next_record.get('passed'):
            next_record['override_note'] = note
        items[item_id] = next_record
    report['items'] = items
    report['approval'] = {
        'approved_by': getattr(request.user, 'email', '') or '',
        'approved_at': timezone.now().isoformat(),
        'notes': {key: str(value).strip() for key, value in notes.items() if str(value).strip()},
        'allocation_note': allocation_note,
    }
    report['ready_to_approve'] = True
    assessment.qa_report = report
    assessment.status = 'Approved'
    assessment.save(update_fields=['qa_report', 'status'])
    try:
        AuditLog.objects.create(
            user=request.user,
            action_type='assessment_approved',
            resource_type='assessment',
            resource_id=assessment.assessment_id,
            details={
                'override_count': len(report['approval']['notes']),
                'allocation_note': allocation_note,
            },
        )
    except Exception:
        logger.exception('Could not write the assessment approval audit log')
    return Response(
        {'success': True, 'assessment': _assessment_detail_payload(assessment)},
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
        assessment = item.assessment
        qa_fields = _clear_assessment_qa(assessment, [])
        if (assessment.status or '').lower() == 'approved':
            assessment.status = 'Draft'
            qa_fields.append('status')
        if qa_fields:
            assessment.save(update_fields=qa_fields)
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
        if str(assessment.status or '').lower() != 'approved':
            return Response(
                {
                    'success': False,
                    'error': 'Approve the assessment after the quality check before exporting.',
                },
                status=status.HTTP_409_CONFLICT,
            )
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
            {'success': False, 'error': 'Could not generate that document.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


def _serialize_course_request(item):
    return {
        "request_id": str(item.request_id),
        "course_code": item.course_code,
        "course_title": item.course_title,
        "description": item.description,
        "category": item.category,
        "units": str(item.units) if item.units is not None else None,
        "section": str(item.section_id) if item.section_id else None,
        "section_code": item.section.code if item.section_id and item.section else None,
        "justification": item.justification,
        "status": item.status,
        "admin_note": item.admin_note,
        "requested_by_name": getattr(item.requested_by, "full_name", "") or "",
        "requested_by_email": getattr(item.requested_by, "email", "") or "",
        "reviewed_by_name": getattr(item.reviewed_by, "full_name", "") if item.reviewed_by_id else None,
        "reviewed_at": item.reviewed_at.isoformat() if item.reviewed_at else None,
        "created_course_id": str(item.created_course_id) if item.created_course_id else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


def _course_request_section(request, section_id):
    from django.db.models import Q

    if not section_id:
        return None, None
    section = Section.objects.filter(section_id=section_id).filter(
        Q(institution_id=request.user.institution_id)
        | Q(program__institution_id=request.user.institution_id),
    ).first()
    if not section:
        return None, Response(
            {"success": False, "detail": "The selected section was not found."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return section, None


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def course_requests_mine(request):
    """Return the requesting faculty member's own course requests (newest first)."""
    if not _is_faculty_user(request):
        return _faculty_only_response()
    if not request.user.institution_id:
        return Response(
            {"success": False, "detail": "Your account is not linked to an institution."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    queryset = (
        CourseRequest.objects.filter(
            institution_id=request.user.institution_id,
            requested_by=request.user,
        )
        .select_related("section", "requested_by", "reviewed_by", "created_course")
        .order_by("-created_at")
    )
    return Response(
        {"success": True, "requests": [_serialize_course_request(item) for item in queryset]},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_course(request):
    """File a new-course request for admin review (faculty cannot self-publish)."""
    if not _is_faculty_user(request):
        return _faculty_only_response()
    if not request.user.institution_id:
        return Response(
            {"success": False, "detail": "Your account is not linked to an institution."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    course_code = (request.data.get("course_code") or "").strip().upper()
    course_title = (request.data.get("course_title") or "").strip()
    description = (request.data.get("description") or "").strip()
    category = (request.data.get("category") or "professional").strip().lower() or "professional"
    units_raw = request.data.get("units")
    section_key = request.data.get("section") or request.data.get("section_id") or None
    justification = (request.data.get("justification") or "").strip()

    valid_categories = {choice for choice, _ in CourseRequest._meta.get_field("category").choices}
    if category not in valid_categories:
        category = "professional"
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

    if len(course_code) > 100:
        return Response(
            {"success": False, "detail": "Course code must be 100 characters or fewer."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if len(course_title) > 255:
        return Response(
            {"success": False, "detail": "Course title must be 255 characters or fewer."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    units = None
    if units_raw not in (None, ""):
        try:
            units = float(units_raw)
        except (TypeError, ValueError):
            return Response(
                {"success": False, "detail": "Units must be a number."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if units < 0 or units > 30:
            return Response(
                {"success": False, "detail": "Units must be between 0 and 30."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    section, section_error = _course_request_section(request, section_key)
    if section_error:
        return section_error

    if Course.objects.filter(
        course_code__iexact=course_code,
        institution_id=request.user.institution_id,
    ).exists():
        return Response(
            {"success": False, "detail": f"A course with code '{course_code}' already exists."},
            status=status.HTTP_409_CONFLICT,
        )

    if CourseRequest.objects.filter(
        course_code__iexact=course_code,
        institution_id=request.user.institution_id,
        status=CourseRequestStatus.PENDING,
    ).exists():
        return Response(
            {
                "success": False,
                "detail": f"A request for '{course_code}' is already waiting for admin review.",
            },
            status=status.HTTP_409_CONFLICT,
        )

    course_request = CourseRequest.objects.create(
        institution_id=request.user.institution_id,
        requested_by=request.user,
        course_code=course_code,
        course_title=course_title,
        description=description or None,
        category=category,
        units=units,
        section=section,
        justification=justification or None,
    )
    try:
        AuditLog.objects.create(
            user=request.user,
            action_type="course_request_submitted",
            resource_type="course_request",
            resource_id=course_request.request_id,
            details={
                "course_code": course_code,
                "course_title": course_title,
                "institution_id": str(request.user.institution_id),
            },
        )
    except Exception:
        logger.exception("Failed to log course request submission")

    logger.info(
        "Faculty %s requested course %s (%s)",
        request.user.email, course_code, course_request.request_id,
    )

    return Response(
        {
            "success": True,
            "detail": "Request sent. Your admin will review it before the course appears in your workspace.",
            "request": _serialize_course_request(course_request),
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
    section = str(request.data.get("section") or "").strip().lower()
    field_label = request.data.get("field_label", "Syllabus Field")
    existing_content = request.data.get("existing_content", "")
    mode = request.data.get("mode", "generate")
    instruction_limit = 8000 if section == "framework_columns" else 4000
    extra_instructions = str(request.data.get("extra_instructions") or "").strip()[:instruction_limit]
    provider = request.data.get("provider") or None
    top_k = max(1, int(request.data.get("top_k", 5)))
    selected_doc_ids = [str(uid) for uid in (request.data.get("selected_doc_ids") or [])]

    if not course_id:
        return Response(
            {"success": False, "detail": "course_id is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    course, error_response = _get_assigned_course_or_403(request, course_id)
    if error_response:
        return error_response
    if not _can_edit_syllabus(request.user, course):
        return _syllabus_readonly_response(course)
    trial_response = trial_generation_gate(request.user, syllabus_generation=True)
    if trial_response:
        return trial_response
    if section not in CoTPromptBuilder.GENERATABLE_SYLLABUS_SECTIONS:
        return Response(
            {
                "success": False,
                "detail": (
                    "This part of the syllabus is stored or entered by the faculty. "
                    "It is not generated."
                ),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    if "assessment_criteria" in request.data:
        assessment_criteria = str(request.data.get("assessment_criteria") or "")
    else:
        assessment_criteria = _stored_assessment_criteria(course)

    try:
        if section == "framework_columns":
            system_prompt, user_prompt = CoTPromptBuilder.build_syllabus_field_prompt(
                course_name=course.course_title,
                course_code=course.course_code,
                field_label=field_label,
                section=section,
                existing_content=existing_content,
                mode=mode,
                context_chunks=[],
                extra_instructions=extra_instructions,
                course_category=course.category or "professional",
                assessment_criteria=assessment_criteria,
            )
            llm = LLMService()
            generated_text, provider_used = complete_syllabus_field(
                llm,
                section=section,
                messages=[{"role": "user", "content": user_prompt}],
                system=system_prompt,
                preferred_provider="ollama",
            )
            return Response(
                {
                    "success": True,
                    "generated_text": generated_text,
                    "provider_used": provider_used,
                    "rag_chunks_used": 0,
                },
                status=status.HTTP_200_OK,
            )

        course_brief = ""
        brief_cached = False
        if section == "topic_map":
            source_chunks = []
            context_summary = ""
        elif section in {"week_plan", "topics", "topic_outcome", "rationale", "tlas"}:
            from apps.integrations.course_brief import get_course_brief

            course_brief, brief_cached = get_course_brief(
                course,
                institution_id=request.user.institution_id,
                selected_doc_ids=selected_doc_ids,
                llm=LLMService(),
                provider=provider,
            )
            source_chunks = []
            context_summary = ""
        else:
            search_query = f"{section} {field_label} {course.course_title} OBE curriculum"
            reference = generation_reference(
                search_query,
                course=course,
                institution_id=request.user.institution_id,
                top_k=top_k,
                selected_doc_ids=selected_doc_ids,
            )
            source_chunks = reference["source_chunks"]
            context_summary = reference["structure_summary"]

        system_prompt, user_prompt = CoTPromptBuilder.build_syllabus_field_prompt(
            course_name=course.course_title,
            course_code=course.course_code,
            field_label=field_label,
            section=section,
            existing_content=existing_content,
            mode=mode,
            context_chunks=source_chunks,
            context_summary=context_summary,
            extra_instructions=extra_instructions,
            course_category=course.category or "professional",
            assessment_criteria=assessment_criteria,
            course_brief=course_brief,
        )

        # ── Step 4: Call LLM. One cloud retry, then Ollama if the reply stops. ─
        llm = LLMService()
        generated_text, provider_used = complete_syllabus_field(
            llm,
            section=section,
            messages=[{"role": "user", "content": user_prompt}],
            system=system_prompt,
            preferred_provider=provider,
        )

        if section == "week_plan":
            _stored, kind = syllabus_course_kind(
                course.course_title, course.course_code, course.category or "professional",
            )
            generated_text = assign_topic_weeks(
                generated_text,
                term_weeks=18,
                pad_to_term=kind != "internship",
            )

        logger.info(
            "generate_syllabus_field: section=%r field=%r mode=%r course=%r provider=%r chunks=%d",
            section, field_label, mode, course.course_code, provider_used, len(source_chunks),
        )

        return Response(
            {
                "success": True,
                "generated_text": generated_text,
                "provider_used": provider_used,
                "rag_chunks_used": len(source_chunks),
                "brief_cached": brief_cached,
            },
            status=status.HTTP_200_OK,
        )

    except Exception as exc:
        logger.exception("Error in generate_syllabus_field for course %r", course_id)
        return Response(
            {"success": False, "error": "Something went wrong. Please try again."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


def _tla_rows_from_request(raw_rows):
    rows = []
    for item in raw_rows or []:
        if not isinstance(item, dict):
            continue
        weeks = str(item.get("weeks") or "").strip()
        title = str(item.get("title") or "").strip()
        try:
            span = int(item.get("span") or 1)
        except (TypeError, ValueError):
            span = 1
        rows.append({"weeks": weeks, "title": title, "span": 2 if span >= 2 else 1})
    return rows


def _tla_neighbors_from_request(raw_neighbors):
    neighbors = []
    for item in raw_neighbors or []:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        neighbors.append({
            "weeks": str(item.get("weeks") or "").strip(),
            "title": title,
        })
    return neighbors[:2]


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def generate_tla(request):
    """Generate the TLA table in a few calls that share one cached course brief.

    ``stage`` is ``plan`` (topic titles), ``rows`` (up to five topic cells and
    their outcomes), or ``map`` (ILO and SO indexes, no course brief).
    """
    from apps.integrations.course_brief import get_course_brief
    from apps.integrations.tla_generation import (
        TLA_BATCH,
        build_tla_rows_prompt,
        map_max_tokens,
        parse_tla_rows,
    )

    if not _is_faculty_user(request):
        return _faculty_only_response()

    course_id = request.data.get("course_id")
    stage = str(request.data.get("stage") or "").strip().lower()
    if not course_id:
        return Response(
            {"success": False, "detail": "course_id is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if stage not in {"plan", "rows", "map"}:
        return Response(
            {"success": False, "detail": "stage must be plan, rows, or map."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    course, error_response = _get_assigned_course_or_403(request, course_id)
    if error_response:
        return error_response
    if not _can_edit_syllabus(request.user, course):
        return _syllabus_readonly_response(course)
    trial_response = trial_generation_gate(request.user, syllabus_generation=True)
    if trial_response:
        return trial_response

    provider = request.data.get("provider") or None
    selected_doc_ids = [str(uid) for uid in (request.data.get("selected_doc_ids") or [])]
    llm = LLMService()

    try:
        if stage == "map":
            topics = [str(item).strip() for item in (request.data.get("topics") or []) if str(item).strip()]
            ilos = [str(item).strip() for item in (request.data.get("ilos") or []) if str(item).strip()]
            sos = [str(item).strip() for item in (request.data.get("sos") or []) if str(item).strip()]
            instructions = "\n".join([
                "Intended learning outcomes:",
                *ilos,
                "",
                "Student outcomes:",
                *sos,
                "",
                "Topics, in order:",
                *topics,
            ])
            system_prompt, user_prompt = CoTPromptBuilder.build_syllabus_field_prompt(
                course_name=course.course_title,
                course_code=course.course_code,
                field_label="ILO and SO mapping",
                section="topic_map",
                existing_content="",
                mode="generate",
                context_chunks=[],
                extra_instructions=instructions,
                course_category=course.category or "professional",
            )
            generated_text, provider_used = complete_syllabus_field(
                llm,
                section="topic_map",
                messages=[{"role": "user", "content": user_prompt}],
                system=system_prompt,
                preferred_provider=provider,
                max_tokens=map_max_tokens(len(topics)),
            )
            return Response(
                {
                    "success": True,
                    "generated_text": generated_text,
                    "provider_used": provider_used,
                    "brief_cached": False,
                    "rag_chunks_used": 0,
                },
                status=status.HTTP_200_OK,
            )

        course_brief, brief_cached = get_course_brief(
            course,
            institution_id=request.user.institution_id,
            selected_doc_ids=selected_doc_ids,
            llm=llm,
            provider=provider,
        )

        if stage == "plan":
            system_prompt, user_prompt = CoTPromptBuilder.build_syllabus_field_prompt(
                course_name=course.course_title,
                course_code=course.course_code,
                field_label="Weekly topic plan",
                section="week_plan",
                existing_content="",
                mode="generate",
                context_chunks=[],
                course_category=course.category or "professional",
                assessment_criteria=str(request.data.get("assessment_criteria") or ""),
                course_brief=course_brief,
            )
            generated_text, provider_used = complete_syllabus_field(
                llm,
                section="week_plan",
                messages=[{"role": "user", "content": user_prompt}],
                system=system_prompt,
                preferred_provider=provider,
            )
            _stored, kind = syllabus_course_kind(
                course.course_title, course.course_code, course.category or "professional",
            )
            generated_text = assign_topic_weeks(
                generated_text,
                term_weeks=18,
                pad_to_term=kind != "internship",
            )
            return Response(
                {
                    "success": True,
                    "generated_text": generated_text,
                    "provider_used": provider_used,
                    "brief_cached": brief_cached,
                    "rag_chunks_used": 0,
                },
                status=status.HTTP_200_OK,
            )

        rows = _tla_rows_from_request(request.data.get("rows"))
        if not rows or len(rows) > TLA_BATCH:
            return Response(
                {"success": False, "detail": f"rows must contain 1 to {TLA_BATCH} items."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        neighbors = _tla_neighbors_from_request(request.data.get("neighbors"))
        system_prompt, user_prompt = build_tla_rows_prompt(
            course.course_title,
            course.course_code,
            course_brief,
            rows,
            neighbors,
        )
        generated_text, provider_used = complete_syllabus_field(
            llm,
            section="tla_rows",
            messages=[{"role": "user", "content": user_prompt}],
            system=system_prompt,
            preferred_provider=provider,
            max_tokens=min(720, 140 * len(rows)),
        )
        parsed = parse_tla_rows(generated_text, len(rows))
        if len(parsed) != len(rows):
            return Response(
                {"success": False, "error": "The topic batch was not readable. Try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(
            {
                "success": True,
                "rows": parsed,
                "provider_used": provider_used,
                "brief_cached": brief_cached,
                "rag_chunks_used": 0,
            },
            status=status.HTTP_200_OK,
        )
    except Exception:
        logger.exception("Error in generate_tla for course %r", course_id)
        return Response(
            {"success": False, "error": "Something went wrong. Please try again."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


def _reject_mismatched_upload(file_obj, filename):
    from apps.integrations.document_processor import upload_type_error

    extension = filename.rsplit('.', 1)[-1] if '.' in (filename or '') else ''
    message = upload_type_error(file_obj, extension)
    if not message:
        return None
    return Response(
        {"success": False, "detail": message},
        status=status.HTTP_400_BAD_REQUEST,
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
    template_bytes = b''
    # Prefer working DOCX for fill; fall back to original when it is already a DOCX.
    working = customization.syllabus_working_docx
    source = working if working else customization.syllabus_template
    if source:
        try:
            source.open('rb')
            template_bytes = source.read()
            source.close()
        except Exception:
            template_bytes = b''
    return {
        'header_text': customization.header_text or '',
        'footer_text': customization.footer_text or '',
        'header_image': customization.header_image_url or '',
        'footer_image': customization.footer_image_url or '',
        'header_image_url': customization.header_image_url or '',
        'footer_image_url': customization.footer_image_url or '',
        'syllabus_sections': customization.syllabus_sections or [],
        'syllabus_style_profile': customization.syllabus_style_profile or {},
        'syllabus_field_map': customization.syllabus_field_map or {},
        'syllabus_preview_blocks': customization.syllabus_preview_blocks or [],
        'syllabus_template_bytes': template_bytes,
        'syllabus_template_name': customization.syllabus_template_name or '',
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


def _enrich_syllabus_for_standard_export(syllabus, course, request):
    """Fill identity fields from the course/account when the syllabus lacks them.

    The exported CIS form always shows the full course header, so anything the
    faculty has not typed yet is taken from the course record instead of being
    left blank when the record already knows the answer.
    """
    def _faculty_name():
        user = request.user
        return (
            getattr(user, 'full_name', '')
            or getattr(user, 'name', '')
            or (user.get_full_name() if hasattr(user, 'get_full_name') else '')
        )

    data = dict(syllabus) if isinstance(syllabus, dict) else {}
    if course is None:
        for key, value in (
            ('instructor_name', _faculty_name()),
            ('instructor_email', getattr(request.user, 'email', '')),
        ):
            if value and not data.get(key):
                data[key] = value
        return data

    program = course.program if getattr(course, 'program_id', None) else None
    college = program.college if program is not None and program.college_id else None
    defaults = {
        'university_name': course.institution.name if course.institution_id else '',
        'college': college.name if college else '',
        'program': program.name if program else '',
        'course_title': course.course_title,
        'course_code': course.course_code,
        'credit_hours': str(course.units) if course.units is not None else '',
        'course_category': course.get_category_display() if hasattr(course, 'get_category_display') else '',
        'year_level': course.year_level.display_name if course.year_level_id else '',
        'instructor_name': _faculty_name(),
        'instructor_email': getattr(request.user, 'email', ''),
    }
    if not defaults['year_level'] and getattr(course, 'section_id', None):
        defaults['year_level'] = course.section.year_label
    for key, value in defaults.items():
        if value and not data.get(key):
            data[key] = value
    return data


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def export_syllabus_docx(request):
    """
    Export syllabus data as a DOCX file in the fixed CIS format.

    Endpoint: POST /api/curriculum/export-syllabus-docx/

    Body (multipart/form-data):
        course_id     — optional UUID; if provided, export uses latest saved syllabus_content from DB
        syllabus_data — optional JSON string fallback when no saved syllabus is available

    The download always uses the standard Course Information Syllabus layout;
    uploaded templates are ignored.
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

    branding = _resolve_institution_branding(course)
    syllabus = _enrich_syllabus_for_standard_export(syllabus, course, request)
    syllabus = _stamp_syllabus_owner(course, syllabus)

    try:
        from django.http import HttpResponse
        from apps.integrations.syllabus_standard import build_standard_syllabus_docx

        course_code = (syllabus.get('course_code') or 'syllabus').replace('/', '-').replace(' ', '_')
        docx_bytes = build_standard_syllabus_docx(syllabus, branding)
        filename = f"{course_code}_syllabus.docx"
        http_response = HttpResponse(
            docx_bytes,
            content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )
        http_response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return http_response

    except Exception as exc:
        logger.exception('Error generating DOCX for syllabus export')
        return Response(
            {'success': False, 'error': 'Could not generate that document.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def export_syllabus_pdf(request):
    """
    Export a filled syllabus as a styled PDF using the institution style profile.

    Endpoint: POST /api/curriculum/export-syllabus-pdf/

    Body (multipart/form-data or JSON):
        course_id     — optional UUID; uses latest saved syllabus_content when set
        syllabus_data — optional JSON fallback
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

    if not isinstance(syllabus, dict) or not syllabus:
        return Response(
            {'success': False, 'error': 'No syllabus data found to export.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    branding = _resolve_institution_branding(course)
    syllabus = _enrich_syllabus_for_standard_export(syllabus, course, request)
    syllabus = _stamp_syllabus_owner(course, syllabus)
    try:
        from apps.integrations.syllabus_export import export_syllabus_pdf as render_pdf
        from django.http import HttpResponse

        pdf_bytes, engine = render_pdf(
            syllabus,
            branding=branding,
            style_profile=branding.get('syllabus_style_profile') or {},
        )
        course_code = (syllabus.get('course_code') or 'syllabus').replace('/', '-').replace(' ', '_')
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{course_code}_syllabus.pdf"'
        response['X-ATLAS-PDF-Engine'] = engine
        return response
    except Exception as exc:
        logger.exception('Error generating styled syllabus PDF')
        return Response(
            {'success': False, 'error': 'Could not generate that document.'},
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
            {'success': False, 'error': 'Could not generate that document.'},
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
        owner_error = _module_owner_response(module, request.user)
        if owner_error:
            return owner_error

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
    if template_file:
        rejected_template = _reject_mismatched_upload(template_file, template_file.name)
        if rejected_template:
            return rejected_template

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
            {'success': False, 'error': 'Could not generate that document.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def prepare_syllabus_tabs(request):
    """
    Read one syllabus file and split it into tab texts. No language model.

    Endpoint: POST /api/curriculum/prepare-syllabus-tabs/
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

    _course, error_response = _get_assigned_course_or_403(request, course_id)
    if error_response:
        return error_response

    filename = file_obj.name.lower()
    allowed = (".txt", ".docx", ".pdf", ".xlsx")
    if not any(filename.endswith(ext) for ext in allowed):
        return Response(
            {"success": False, "detail": "Unsupported file type. Please upload PDF, DOCX, XLSX, or TXT."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    rejected_upload = _reject_mismatched_upload(file_obj, filename)
    if rejected_upload:
        return rejected_upload

    try:
        data = file_obj.read()
        suffix = filename.rsplit('.', 1)[-1]
        if suffix in {'pdf', 'docx'}:
            from apps.integrations.syllabus_tab_split import tabs_from_layout_bytes
            prepared = tabs_from_layout_bytes(data, suffix)
        else:
            from io import BytesIO
            from apps.integrations.syllabus_tab_split import split_markdown_into_tabs
            text = _extract_text_from_file(BytesIO(data), filename)
            prepared = {'parser': 'text', 'tabs': split_markdown_into_tabs(text)}
    except Exception as exc:
        logger.exception('prepare_syllabus_tabs failed')
        return Response(
            {"success": False, "error": "Could not read that syllabus file."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not prepared.get('tabs'):
        return Response(
            {"success": False, "error": "Could not find syllabus sections in this file."},
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    return Response(
        {"success": True, "parser": prepared.get('parser') or '', "tabs": prepared['tabs']},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def import_syllabus_json(request):
    """
    Read one syllabus file and return the JSON object the form stores.

    Endpoint: POST /api/curriculum/import-syllabus-json/
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

    _course, error_response = _get_assigned_course_or_403(request, course_id)
    if error_response:
        return error_response
    if not _can_edit_syllabus(request.user, _course):
        return _syllabus_readonly_response(_course)
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
    rejected_upload = _reject_mismatched_upload(file_obj, filename)
    if rejected_upload:
        return rejected_upload

    try:
        from io import BytesIO
        from apps.integrations.syllabus_json_import import syllabus_content_from_markdown
        from apps.integrations.syllabus_parse import _markdown_via_legacy, extract_layout

        data = file_obj.read()
        suffix = filename.rsplit('.', 1)[-1]
        if suffix == 'docx':
            markdown = _markdown_via_legacy(BytesIO(data), 'docx')
        elif suffix == 'pdf':
            markdown = _markdown_via_legacy(BytesIO(data), 'pdf')
            if len(markdown) < 400:
                markdown = (extract_layout(data, 'pdf').get('markdown') or markdown)
        else:
            markdown = _extract_text_from_file(BytesIO(data), filename)
        content = syllabus_content_from_markdown(markdown)
    except Exception as exc:
        logger.exception('import_syllabus_json failed')
        return Response(
            {"success": False, "error": "Could not read that syllabus file."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not content:
        return Response(
            {"success": False, "error": "Could not find syllabus text in this file."},
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    return Response(
        {"success": True, "syllabus_content": content},
        status=status.HTTP_200_OK,
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
    if not _can_edit_syllabus(request.user, course):
        return _syllabus_readonly_response(course)
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
    rejected_upload = _reject_mismatched_upload(file_obj, filename)
    if rejected_upload:
        return rejected_upload

    # ── Extract text ──────────────────────────────────────────────────────
    try:
        extracted_text = _extract_text_from_file(file_obj, filename)
    except Exception as exc:
        return Response(
            {"success": False, "error": "Could not read that file."},
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
            {"success": False, "error": "Something went wrong. Please try again."},
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
    if not _can_edit_syllabus(request.user, course):
        return _syllabus_readonly_response(course)
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
    rejected_upload = _reject_mismatched_upload(file_obj, filename)
    if rejected_upload:
        return rejected_upload

    # Extract text
    try:
        extracted_text = _extract_text_from_file(file_obj, filename)
    except Exception as exc:
        return Response(
            {"success": False, "error": "Could not read that file."},
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
                {"success": False, "error": "Could not split that syllabus."},
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
            {"success": False, "error": "Could not split that syllabus."},
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
    if not _can_edit_syllabus(request.user, course):
        return _syllabus_readonly_response(course)

    if not segment_text or not segment_text.strip():
        return Response(
            {"success": True, "parsed_data": {}},
            status=status.HTTP_200_OK,
        )
    count_trial = request.data.get("count_trial", True)
    if count_trial not in (False, 0, "0", "false", "False"):
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
        # The fast cloud chain goes first. Ollama stays the last resort inside
        # the fallback, because the local 3B model is too slow for every tab.
        chosen = str(request.data.get("provider") or "").strip().lower()
        if chosen in {"", "auto"}:
            chosen = None
        try:
            raw_response = llm.generate_response_with_fallback(
                [{"role": "user", "content": user_prompt}],
                preferred_provider=chosen,
                system=system_prompt,
                max_tokens=4096,
            )
        except ValueError as exc:
            return Response(
                {"success": False, "error": "Could not read that syllabus section."},
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
                    preferred_provider=chosen,
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

        if isinstance(parsed_data, dict):
            from apps.integrations.syllabus_tab_split import faithful_parsed_data
            parsed_data = faithful_parsed_data(parsed_data, segment_text)

        return Response(
            {"success": True, "parsed_data": parsed_data},
            status=status.HTTP_200_OK,
        )

    except Exception as exc:
        logger.exception("Error during syllabus section parsing: %s", section_key)
        return Response(
            {"success": False, "error": "Could not read that syllabus section."},
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
            {"success": False, "error": "Something went wrong. Please try again."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
