import logging

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.integrations.cot_prompt_builder import CoTPromptBuilder
from apps.integrations.llm_service import LLMService
from apps.integrations.models import Assessment, CourseLoad, Module, Syllabus, UserRole
from apps.integrations.rag_service import semantic_search

from .serializers import GenerateModuleSerializer, GenerateSyllabusSerializer

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
        .values('module_id', 'module_title', 'week_number', 'status', 'generated_at')
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
        # Step 1 — Semantic search
        chunks = semantic_search(search_query, top_k=top_k)
        logger.info(
            "Syllabus generation for %r: retrieved %d RAG chunk(s) using provider=%r",
            course_name,
            len(chunks),
            provider,
        )

        # Step 2 — Build CoT prompt
        system_prompt, user_prompt = CoTPromptBuilder.build_syllabus_prompt(
            course_name=course_name,
            course_code=course_code,
            num_weeks=num_weeks,
            context_chunks=chunks,
            extra_instructions=extra_instructions,
        )

        # Step 3 — Call LLM
        llm = LLMService()
        generated_text = llm.generate_response(
            messages=[{"role": "user", "content": user_prompt}],
            provider_choice=provider,
            system=system_prompt,
            max_tokens=3000,
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
    Generate a detailed OBE-aligned teaching module using RAG + CoT + LLM.

    Endpoint: POST /api/curriculum/generate-module/

    Body (JSON):
    {
        "course_name": "Data Structures and Algorithms",
        "module_title": "Binary Search Trees",
        "week_number": 7,                 // optional, default 1
        "provider": "gemini",             // optional
        "top_k": 5,                       // optional
        "search_query": "...",            // optional override
        "extra_instructions": "..."       // optional
    }

    Pipeline: same as generate_syllabus but targets a single weekly module.
    """
    serializer = GenerateModuleSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {"success": False, "errors": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    data = serializer.validated_data
    course_name = data["course_name"]
    module_title = data["module_title"]
    week_number = data.get("week_number", 1)
    top_k = data.get("top_k", 5)
    provider = data.get("provider") or None
    extra_instructions = data.get("extra_instructions", "")
    search_query = data.get("search_query") or (
        f"{course_name} {module_title} teaching module learning outcomes activities"
    )

    try:
        # Step 1 — Semantic search
        chunks = semantic_search(search_query, top_k=top_k)
        logger.info(
            "Module generation for %r / %r (week %d): retrieved %d RAG chunk(s)",
            course_name,
            module_title,
            week_number,
            len(chunks),
        )

        # Step 2 — Build CoT prompt
        system_prompt, user_prompt = CoTPromptBuilder.build_module_prompt(
            course_name=course_name,
            module_title=module_title,
            week_number=week_number,
            context_chunks=chunks,
            extra_instructions=extra_instructions,
        )

        # Step 3 — Call LLM
        llm = LLMService()
        generated_text = llm.generate_response(
            messages=[{"role": "user", "content": user_prompt}],
            provider_choice=provider,
            system=system_prompt,
            max_tokens=2500,
        )

        return Response(
            {
                "success": True,
                "course_name": course_name,
                "module_title": module_title,
                "week_number": week_number,
                "provider_used": provider or llm.default_provider,
                "rag_chunks_used": len(chunks),
                "generated_module": generated_text,
            },
            status=status.HTTP_200_OK,
        )

    except Exception as exc:
        logger.exception(
            "Error generating module %r for course %r", module_title, course_name
        )
        return Response(
            {"success": False, "error": str(exc)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
