import logging

from django.core.cache import cache
from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import indexing, rag_service
from .document_processor import DocumentProcessor
from .llm_service import LLMService
from .traffic import concurrent_snapshot
from .models import (
    AuditLog,
    ChildChunk,
    Course,
    CourseFile,
    CourseLoad,
    GlobalDocument,
    ParentChunk,
    RagStatusEnum,
    UserRole,
)
from .serializers import (
    CourseRagUploadSerializer,
    FileUploadSerializer,
    SemanticSearchSerializer,
)
logger = logging.getLogger(__name__)
_AUDIT_CACHE_SECONDS = 15


def _cache_get(key):
    try:
        return cache.get(key)
    except Exception:
        logger.warning('Cache read failed for %s', key, exc_info=True)
        return None


def _cache_set(key, value, timeout):
    try:
        cache.set(key, value, timeout=timeout)
    except Exception:
        logger.warning('Cache write failed for %s', key, exc_info=True)


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
        # The upload's temp file is closed when the request ends, so the
        # background job gets the bytes instead of the file object.
        file_obj.seek(0)
        file_bytes = file_obj.read()
        file_name = file_obj.name

        document = GlobalDocument.objects.create(
            institution=request.user.institution,
            title=file_name[:255],
            discipline=discipline,
            program=program,
            doc_type=doc_type,
            status=GlobalDocument.IndexStatus.PROCESSING,
        )
        AuditLog.objects.create(
            user=request.user,
            action_type="admin_document_upload",
            resource_type="GlobalDocument",
            resource_id=document.document_id,
            details={
                "document_title": document.title,
                "file_name": file_name,
                "discipline": discipline,
                "program": program,
                "doc_type": doc_type,
                "institution_id": str(request.user.institution_id) if request.user.institution_id else None,
            },
        )
        transaction.on_commit(
            lambda: indexing.enqueue_global_document(
                document.document_id, file_bytes, file_type, file_name
            )
        )

        return Response(
            {
                "success": True,
                "document_id": str(document.document_id),
                "file_name": file_name,
                "status": document.status,
                "message": "Upload received. The document is being indexed in the background.",
            },
            status=status.HTTP_202_ACCEPTED,
        )

    except Exception as exc:
        logger.exception("Error uploading RAG document")
        return Response(
            {"success": False, "error": "Could not upload that document."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


def _is_superadmin_user(request) -> bool:
    role = getattr(request.user, 'role', None)
    return role in {UserRole.SUPERADMIN, 'superadmin', 'super_admin'}


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def traffic_status(request):
    """Superadmin view of users active in the current traffic window."""
    if not _is_superadmin_user(request):
        return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
    return Response({'success': True, **concurrent_snapshot()}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def llm_health(request):
    """Superadmin view of model health, unused quota, and when a limit returns."""
    if not _is_superadmin_user(request):
        return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
    refresh = str(request.query_params.get('refresh') or '').lower() in {'1', 'true', 'yes'}
    llm = LLMService()
    return Response(
        {
            'success': True,
            'default_provider': llm.default_provider,
            'providers': llm.llm_health(refresh=refresh),
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def llm_provider_status(request):
    """Return configuration status for supported LLM providers."""
    llm = LLMService()
    providers = {name: info['configured'] for name, info in llm.provider_status().items()}
    providers['ollama'] = bool(llm.is_ollama_available())
    return Response(
        {
            'success': True,
            'providers': providers,
            'details': llm.provider_status(),
            'chain': llm.chain,
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
        2. Save a GlobalDocument with status PROCESSING and return 202.
        3. In the background (indexing.py): hierarchical chunking, embed
           CHILD chunks with BGE-Base-v1.5 (768-dim), save parent/child
           chunks, then set status READY (or FAILED with error_message).
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
        file_obj.seek(0)
        file_bytes = file_obj.read()
        file_name = file_obj.name

        course_file = CourseFile.objects.create(
            uploader=request.user,
            course=course,
            storage_path=file_name,
            rag_status=RagStatusEnum.PROCESSING,
        )
        transaction.on_commit(
            lambda: indexing.enqueue_course_file(
                course_file.records_id, file_bytes, file_type, file_name, module_tag, term_tag,
            )
        )

        return Response(
            {
                'success': True,
                'records_id': str(course_file.records_id),
                'course_id': str(course.course_id),
                'course_code': course.course_code,
                'file_name': file_name,
                'rag_status': course_file.rag_status,
                'message': 'Upload received. The file is being indexed in the background.',
            },
            status=status.HTTP_202_ACCEPTED,
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
        if indexing.is_stale_course_file(record):
            record.rag_status = RagStatusEnum.FAILED
            record.error_message = indexing.STALE_PROCESSING_MESSAGE
            record.save(update_fields=['rag_status', 'error_message'])
        parent_count = ParentChunk.objects.filter(records=record).count()
        child_count = ChildChunk.objects.filter(parent__records=record).count()
        payload.append(
            {
                'records_id': str(record.records_id),
                'storage_path': record.storage_path,
                'rag_status': record.rag_status,
                'error_message': record.error_message,
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
            if indexing.is_stale_processing(doc):
                doc.status = GlobalDocument.IndexStatus.FAILED
                doc.error_message = indexing.STALE_PROCESSING_MESSAGE
                doc.save(update_fields=["status", "error_message"])
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
                    "status": doc.status,
                    "error_message": doc.error_message,
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
            {"success": False, "error": "Could not load documents."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_global_rag_document(request, document_id):
    """Delete one institution knowledge-base document and its chunks (cascade)."""
    if not _is_admin_user(request):
        return _forbidden_admin_only_response()

    if not request.user.institution_id:
        return Response(
            {"success": False, "detail": "Your account is not linked to an institution."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    document = GlobalDocument.objects.filter(
        document_id=document_id,
        institution_id=request.user.institution_id,
    ).first()
    if not document:
        return Response(
            {"success": False, "detail": "Document not found or you do not have permission to delete it."},
            status=status.HTTP_404_NOT_FOUND,
        )

    try:
        document.delete()
        return Response({"success": True}, status=status.HTTP_200_OK)
    except Exception as exc:
        logger.exception("Error deleting global RAG document")
        return Response(
            {"success": False, "error": "Could not delete that document."},
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

    query = (request.query_params.get("q") or "").strip().lower()[:120]
    try:
        page = max(int(request.query_params.get("page") or 1), 1)
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.query_params.get("page_size") or 25)
    except (TypeError, ValueError):
        page_size = 25
    page_size = min(max(page_size, 1), 100)

    cache_key = f"audit-logs:{request.user.institution_id}:{query}:{page}:{page_size}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return Response(cached, status=status.HTTP_200_OK)

    logs = list(
        AuditLog.objects
        .select_related("user")
        .filter(user__institution_id=request.user.institution_id)
        .order_by("-timestamp")[:500]
    )
    if query:
        def haystack(log):
            user_label = ""
            if log.user_id and log.user:
                user_label = log.user.full_name or log.user.email or ""
            return " ".join([
                user_label,
                log.action_type or "",
                log.resource_type or "",
                str(log.resource_id or ""),
            ]).lower()

        logs = [log for log in logs if query in haystack(log)]

    total = len(logs)
    start = (page - 1) * page_size
    page_logs = logs[start:start + page_size]
    payload = {
        "success": True,
        "count": total,
        "page": page,
        "page_size": page_size,
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
            for log in page_logs
        ],
    }
    _cache_set(cache_key, payload, _AUDIT_CACHE_SECONDS)
    return Response(payload, status=status.HTTP_200_OK)


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
            {"success": False, "error": "Search could not be completed."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
