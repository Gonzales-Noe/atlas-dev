import logging

from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import rag_service
from .anthropic_service import AnthropicService
from .document_processor import DocumentProcessor
from .llm_service import LLMService
from .models import (
    AuditLog,
    ChildChunk,
    Course,
    CourseFile,
    CourseLoad,
    GlobalDocument,
    GlobalDocumentChunk,
    ParentChunk,
    UserRole,
)
from .serializers import (
    AnthropicTestSerializer,
    CourseRagUploadSerializer,
    FileUploadSerializer,
    SemanticSearchSerializer,
)
from .trial import trial_generation_gate

logger = logging.getLogger(__name__)


def _is_admin_user(request) -> bool:
    return bool(request.user and getattr(request.user, 'role', None) == UserRole.ADMIN)


def _is_faculty_user(request) -> bool:
    return bool(request.user and getattr(request.user, 'role', None) == UserRole.FACULTY)


def _normalize_doc_type_label(doc_type: str | None) -> str:
    if not doc_type:
        return 'Uncategorized'

    raw = str(doc_type).strip()
    if not raw:
        return 'Uncategorized'

    mapping = {
        'CHED_Handbook': 'CHED Handbook',
        'CHED_Handbook_for_OBE': 'CHED Handbook for OBE',
        'CHED_Handbook_on_Topology': 'CHED Handbook on Topology',
        'Handbook_on_Typology': 'Handbook on Typology',
        'OBE_Handbook_on_Typology': 'OBE Handbook on Typology',
        'Institution_Knowledge_Base': 'Institution Knowledge Base',
        'Syllabus': 'Syllabus',
        'Assessment': 'Assessment',
        'Policy': 'Policy',
        'Reference': 'Reference',
        'Files': 'Files',
    }

    return mapping.get(raw, raw.replace('_', ' ').replace('-', ' ').title())


def _forbidden_admin_only_response():
    return Response(
        {
            'success': False,
            'detail': 'Not permitted. Only admin users can upload global knowledge documents.',
        },
        status=status.HTTP_403_FORBIDDEN,
    )


def _forbidden_faculty_only_response():
    return Response(
        {
            'success': False,
            'detail': 'Not permitted. Only faculty users can upload course knowledge documents.',
        },
        status=status.HTTP_403_FORBIDDEN,
    )


def _to_1536_dim(vector):
    """Pad or trim vectors so they fit ChildChunk.vector(1536)."""
    if vector is None:
        return None
    if len(vector) == 1536:
        return vector
    if len(vector) > 1536:
        return vector[:1536]
    return vector + [0.0] * (1536 - len(vector))


def _get_faculty_course_or_403(request, course_id):
    course = Course.objects.filter(course_id=course_id).first()
    if not course:
        return None, Response(
            {'success': False, 'detail': 'Course not found.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    is_assigned = CourseLoad.objects.filter(course=course, faculty=request.user).exists()
    if not is_assigned:
        return None, Response(
            {'success': False, 'detail': 'You can only manage knowledge files for your assigned courses.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    return course, None


def _handle_global_rag_upload(request):
    """Shared implementation for global RAG document uploads."""
    if not request.user.institution_id:
        return Response(
            {"success": False, "detail": "Your account is not linked to an institution."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = FileUploadSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {"success": False, "errors": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    file_obj = serializer.validated_data["file"]
    file_type = serializer.validated_data["file_type"]
    discipline = serializer.validated_data.get("discipline") or None
    program = serializer.validated_data.get("program") or None
    doc_type = serializer.validated_data.get("doc_type") or None

    is_valid, error_msg = DocumentProcessor.validate_file(file_obj, file_type)
    if not is_valid:
        return Response(
            {"success": False, "error": error_msg},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        hierarchical = DocumentProcessor.process_file_hierarchical(
            file_obj, file_type, file_obj.name
        )
        parents_data = hierarchical.get("parents", [])

        if not parents_data:
            return Response(
                {"success": False, "error": "No text extracted from file."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Batch embedding keeps upload latency manageable for large handbooks.
        child_records: list = []
        all_child_texts: list = []
        for p_idx, parent_data in enumerate(parents_data):
            for child_data in parent_data.get("children", []):
                child_records.append((p_idx, child_data))
                all_child_texts.append(child_data["content"])

        logger.info(
            "[ATLAS RAG] Batch-embedding %d child chunks…", len(all_child_texts)
        )
        all_embeddings = rag_service.embed_documents_batch(all_child_texts)
        logger.info("[ATLAS RAG] Embedding complete.")

        with transaction.atomic():
            document = GlobalDocument.objects.create(
                institution=request.user.institution,
                title=file_obj.name[:255],
                discipline=discipline,
                program=program,
                doc_type=doc_type,
            )

            parent_chunk_map: dict = {}
            for p_idx, parent_data in enumerate(parents_data):
                parent_chunk = GlobalDocumentChunk.objects.create(
                    document=document,
                    chunk_role="PARENT",
                    page_number=parent_data.get("page_number"),
                    text_content=parent_data["content"],
                    token_count=parent_data.get("token_count"),
                    embedding_vector=None,
                )
                parent_chunk_map[p_idx] = parent_chunk

            child_bulk: list = []
            for i, (p_idx, child_data) in enumerate(child_records):
                child_bulk.append(
                    GlobalDocumentChunk(
                        document=document,
                        parent=parent_chunk_map[p_idx],
                        chunk_role="CHILD",
                        page_number=child_data.get("page_number"),
                        text_content=child_data["content"],
                        token_count=child_data.get("token_count"),
                        embedding_vector=all_embeddings[i],
                    )
                )

            GlobalDocumentChunk.objects.bulk_create(child_bulk)
            total_children = len(child_bulk)

        message = (
            f"[ATLAS RAG] Indexed {len(parents_data)} parents and "
            f"{total_children} children from {file_obj.name}."
        )
        logger.info(message)

        return Response(
            {
                "success": True,
                "document_id": str(document.document_id),
                "file_name": file_obj.name,
                "total_parents": len(parents_data),
                "total_children": total_children,
                "status": "indexed",
                "message": message,
            },
            status=status.HTTP_201_CREATED,
        )

    except Exception as exc:
        logger.exception("Error uploading RAG document")
        return Response(
            {"success": False, "error": f"Failed to upload document: {exc}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def claude_api_test(request):
    """
    Test endpoint for Anthropic Claude API.
    
    Endpoint: POST /api/integrations/claude-test/
    
    Expected Request Body:
    {
        "user_message": "What is OBE?",
        "model": "claude-3-5-sonnet-20241022",  # Optional
        "max_tokens": 1024,  # Optional
        "system_prompt": ""  # Optional
    }
    
    Returns:
        200 OK: {
            "success": true,
            "model": "claude-3-5-sonnet-20241022",
            "content": [{"type": "text", "text": "..."}],
            "usage": {"input_tokens": X, "output_tokens": Y}
        }
        
        400 Bad Request: Validation errors
        401 Unauthorized: Missing/invalid JWT token
        500 Internal Server Error: API error
    """
    trial_response = trial_generation_gate(request.user, syllabus_generation=False)
    if trial_response:
        return trial_response

    try:
        # Validate request
        serializer = AnthropicTestSerializer(data=request.data)
        if not serializer.is_valid():
            logger.warning(f"Validation error: {serializer.errors}")
            return Response(
                {
                    "success": False,
                    "errors": serializer.errors
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Extract validated data
        user_message = serializer.validated_data.get('user_message')
        model = serializer.validated_data.get('model')
        max_tokens = serializer.validated_data.get('max_tokens')
        system_prompt = serializer.validated_data.get('system_prompt') or None
        
        # Initialize Anthropic service
        claude_service = AnthropicService()
        
        if not claude_service.is_configured():
            logger.error("Anthropic API not configured")
            return Response(
                {
                    "success": False,
                    "error": "Anthropic API is not configured. "
                             "Set ANTHROPIC_API_KEY environment variable."
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        response = claude_service.send_message(
            messages=[{"role": "user", "content": user_message}],
            model=model,
            max_tokens=max_tokens,
            system=system_prompt,
        )

        logger.info(f"Claude API test successful for user {request.user.username}")

        return Response(response, status=status.HTTP_200_OK)

    except Exception as e:
        logger.error(f"Error in Claude API test: {str(e)}")
        return Response(
            {
                "success": False,
                "error": f"Failed to call Claude API: {str(e)}"
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def llm_provider_status(request):
    """Return configuration status for supported LLM providers."""
    llm = LLMService()
    providers = {
        'ollama': bool(llm.is_ollama_available()),
        'openrouter': bool(llm.openrouter_configured),
        'gemini': bool(llm.openrouter_configured),
        'gpt': bool(llm.openrouter_configured),
        'groq': bool(llm.groq_configured),
        'anthropic': bool(llm.anthropic_service.is_configured()),
    }
    return Response(
        {
            'success': True,
            'providers': providers,
            'default_provider': llm.default_provider,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_rag_document(request):
    """
    Upload and ingest a document into the Parent-Child RAG knowledge base.

    Endpoint: POST /api/integrations/upload-rag-document/

    Request (multipart/form-data):
        file        – PDF or DOCX file
        file_type   – 'pdf' | 'docx'
        discipline  – optional, e.g. 'Engineering'
        program     – optional, e.g. 'BSCS'
        doc_type    – optional, e.g. 'CHED_Handbook'

    Pipeline:
        1. Validate file.
        2. Two-pass hierarchical chunking (Parent ≈1200 tokens, Child ≈200 tokens).
        3. Save GlobalDocument record with metadata.
        4. Save PARENT GlobalDocumentChunks (no embedding — context only).
        5. Embed each CHILD chunk with BGE-Base-v1.5 (768-dim) and bulk-save.

    Returns 201 on success with parent/child counts.
    """
    if not _is_admin_user(request):
        return _forbidden_admin_only_response()
    return _handle_global_rag_upload(request)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_global_rag_document(request):
    """
    Admin-only endpoint for uploading global RAG knowledge documents.

    Endpoint: POST /api/integrations/upload-global-rag-document/
    """
    if not _is_admin_user(request):
        return _forbidden_admin_only_response()
    return _handle_global_rag_upload(request)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_course_rag_document(request):
    """
    Faculty-only upload endpoint for course-level RAG knowledge.

    Stores parent and child chunks in separate tables:
      - parent_chunk
      - child_chunk
    """
    if not _is_faculty_user(request):
        return _forbidden_faculty_only_response()

    serializer = CourseRagUploadSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {'success': False, 'errors': serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    file_obj = serializer.validated_data['file']
    file_type = serializer.validated_data['file_type']
    course_id = serializer.validated_data['course_id']
    module_tag = serializer.validated_data.get('module_tag') or None
    term_tag = serializer.validated_data.get('term_tag') or None

    course, course_error = _get_faculty_course_or_403(request, course_id)
    if course_error:
        return course_error

    is_valid, error_msg = DocumentProcessor.validate_file(file_obj, file_type)
    if not is_valid:
        return Response({'success': False, 'error': error_msg}, status=status.HTTP_400_BAD_REQUEST)

    try:
        hierarchical = DocumentProcessor.process_file_hierarchical(
            file_obj, file_type, file_obj.name
        )
        parents_data = hierarchical.get('parents', [])
        if not parents_data:
            return Response(
                {'success': False, 'error': 'No readable text was found in the uploaded file.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        child_records = []
        all_child_texts = []
        for p_idx, parent_data in enumerate(parents_data):
            for child_data in parent_data.get('children', []):
                child_records.append((p_idx, child_data))
                all_child_texts.append(child_data['content'])

        all_embeddings = rag_service.embed_documents_batch(all_child_texts)

        with transaction.atomic():
            course_file = CourseFile.objects.create(
                uploader=request.user,
                course=course,
                storage_path=file_obj.name,
                rag_status='PROCESSING',
            )

            parent_rows = {}
            for p_idx, parent_data in enumerate(parents_data):
                parent_rows[p_idx] = ParentChunk.objects.create(
                    records=course_file,
                    uploader=request.user,
                    module_tag=module_tag,
                    term_tag=term_tag,
                    parent_content=parent_data['content'],
                )

            child_bulk = []
            for idx, (p_idx, child_data) in enumerate(child_records):
                child_bulk.append(
                    ChildChunk(
                        parent=parent_rows[p_idx],
                        uploader=request.user,
                        overlap_text=child_data['content'],
                        embedding_vector=_to_1536_dim(all_embeddings[idx]),
                    )
                )

            if child_bulk:
                ChildChunk.objects.bulk_create(child_bulk)

            course_file.rag_status = 'COMPLETED'
            course_file.save(update_fields=['rag_status'])

        return Response(
            {
                'success': True,
                'course_id': str(course.course_id),
                'course_code': course.course_code,
                'file_name': file_obj.name,
                'parents_saved': len(parents_data),
                'children_saved': len(child_records),
                'message': 'Upload complete. This document is now available for your course generation tools.',
            },
            status=status.HTTP_201_CREATED,
        )
    except Exception as exc:
        logger.exception('Error uploading course RAG document')
        return Response(
            {'success': False, 'error': f'Failed to upload course document: {exc}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_course_rag_document(request, records_id):
    """Delete a CourseFile and all its parent/child chunks (cascade)."""
    if not _is_faculty_user(request):
        return _forbidden_faculty_only_response()

    course_file = CourseFile.objects.filter(records_id=records_id, uploader=request.user).first()
    if not course_file:
        return Response(
            {'success': False, 'detail': 'Document not found or you do not have permission to delete it.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    try:
        course_file.delete()
        return Response({'success': True}, status=status.HTTP_200_OK)
    except Exception as exc:
        logger.exception('Error deleting course RAG document')
        return Response(
            {'success': False, 'error': f'Failed to delete document: {exc}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_course_rag_documents(request):
    """List faculty-uploaded course files with chunk counts for the selected course."""
    if not _is_faculty_user(request):
        return _forbidden_faculty_only_response()

    course_id = request.query_params.get('course_id')
    if not course_id:
        return Response(
            {'success': False, 'detail': 'course_id is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    course, course_error = _get_faculty_course_or_403(request, course_id)
    if course_error:
        return course_error

    files = CourseFile.objects.filter(course=course, uploader=request.user).order_by('-records_id')
    payload = []
    for record in files:
        parent_count = ParentChunk.objects.filter(records=record).count()
        child_count = ChildChunk.objects.filter(parent__records=record).count()
        payload.append(
            {
                'records_id': str(record.records_id),
                'storage_path': record.storage_path,
                'rag_status': record.rag_status,
                'parent_chunks': parent_count,
                'child_chunks': child_count,
            }
        )

    return Response(
        {
            'success': True,
            'course_id': str(course.course_id),
            'course_code': course.course_code,
            'total': len(payload),
            'documents': payload,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_rag_documents(request):
    """
    List all RAG documents uploaded by the authenticated user.
    
    Endpoint: GET /api/integrations/rag-documents/
    
    Returns:
        200 OK: {
            "success": true,
            "total": 5,
            "documents": [...]
        }
    """
    if not _is_admin_user(request):
        return _forbidden_admin_only_response()

    if not request.user.institution_id:
        return Response(
            {"success": False, "detail": "Your account is not linked to an institution."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        documents = GlobalDocument.objects.filter(
            institution_id=request.user.institution_id,
        ).order_by("-created_at")
        payload = []

        for doc in documents:
            payload.append(
                {
                    "document_id": str(doc.document_id),
                    "title": doc.title,
                    "description": doc.description,
                    "discipline": doc.discipline,
                    "program": doc.program,
                    "doc_type": doc.doc_type,
                    "doc_type_label": _normalize_doc_type_label(doc.doc_type),
                    "created_at": doc.created_at,
                    "total_chunks": doc.globaldocumentchunk_set.count(),
                }
            )

        return Response(
            {"success": True, "total": len(payload), "documents": payload},
            status=status.HTTP_200_OK,
        )
    except Exception as exc:
        logger.exception("Error listing RAG documents")
        return Response(
            {"success": False, "error": f"Failed to list documents: {exc}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_audit_logs(request):
    """List persisted audit events for the authenticated admin's institution."""
    if not _is_admin_user(request):
        return _forbidden_admin_only_response()
    if not request.user.institution_id:
        return Response(
            {"success": False, "detail": "Your account is not linked to an institution."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    logs = (
        AuditLog.objects
        .select_related("user")
        .filter(user__institution_id=request.user.institution_id)
        .order_by("-timestamp")[:500]
    )
    return Response(
        {
            "success": True,
            "logs": [
                {
                    "log_id": str(log.log_id),
                    "timestamp": log.timestamp,
                    "user": (
                        log.user.full_name or log.user.email
                        if log.user_id else "Unknown user"
                    ),
                    "action": log.action_type,
                    "resource_type": log.resource_type,
                    "resource_id": str(log.resource_id) if log.resource_id else None,
                    "details": log.details or {},
                }
                for log in logs
            ],
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def semantic_search(request):
    """
    Parent-Child semantic search with BGE-Base-v1.5 + BGE-Reranker.

    Endpoint: POST /api/integrations/semantic-search/
    Body:
    {
      "query":      "What is typology in OBE?",
      "top_k":      5,
      "discipline": "Engineering",   # optional pre-filter
      "program":    "BSCS",          # optional pre-filter
      "doc_type":   "CHED_Handbook"  # optional pre-filter
    }

    Pipeline (delegated to rag_service):
        1. Embed query with BGE-Base-v1.5 (768-dim).
        2. HNSW vector search over CHILD chunks (top_k × 3 candidates).
        3. Collect unique PARENT chunks via parent FK.
        4. Rerank with BGE-Reranker-Base cross-encoder.
        5. Return top_k parent passages with reranker scores.
    """
    serializer = SemanticSearchSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {"success": False, "errors": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    query_text  = serializer.validated_data["query"]
    top_k       = serializer.validated_data["top_k"]
    discipline  = serializer.validated_data.get("discipline") or None
    program     = serializer.validated_data.get("program")    or None
    doc_type    = serializer.validated_data.get("doc_type")   or None

    try:
        results = rag_service.semantic_search(
            query=query_text,
            institution_id=request.user.institution_id,
            top_k=top_k,
            discipline=discipline,
            program=program,
            doc_type=doc_type,
        )

        return Response(
            {
                "success": True,
                "query": query_text,
                "top_k": top_k,
                "total_results": len(results),
                "results": results,
            },
            status=status.HTTP_200_OK,
        )
    except Exception as exc:
        logger.exception("Error running semantic search")
        return Response(
            {"success": False, "error": f"Failed to run semantic search: {exc}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
