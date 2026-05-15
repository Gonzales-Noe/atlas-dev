import logging

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.integrations.cot_prompt_builder import CoTPromptBuilder
from apps.integrations.llm_service import LLMService
from apps.integrations.models import (
    Assessment,
    Course,
    CourseLoad,
    Module,
    ParentChunk,
    Syllabus,
    UserRole,
)
from apps.integrations.rag_service import semantic_search, semantic_search_with_summary

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
        # Step 1 — Semantic search with progressive summary
        rag_result = semantic_search_with_summary(search_query, top_k=top_k)
        chunks = rag_result["chunks"]
        logger.info(
            "Module generation for %r / %r (week %d): retrieved %d RAG chunk(s) (abstained=%s)",
            course_name,
            module_title,
            week_number,
            len(chunks),
            rag_result["abstained"],
        )

        # Step 2 — Build CoT prompt (token-efficient via context summary)
        system_prompt, user_prompt = CoTPromptBuilder.build_module_prompt(
            course_name=course_name,
            module_title=module_title,
            week_number=week_number,
            context_chunks=chunks,
            extra_instructions=extra_instructions,
            context_summary=rag_result["context_summary"],
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

        # Strategy 1: extract JSON from a markdown code fence anywhere in the response
        fence_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw_response, re.DOTALL)
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
                    max_tokens=4096,
                )
                repaired_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', repaired, re.DOTALL)
                repaired_json = repaired_match.group(1) if repaired_match else repaired
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
            {"success": False, "error": "The model returned malformed JSON. Please try again."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
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
