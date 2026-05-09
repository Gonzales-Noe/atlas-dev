import logging

from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import rag_service
from .anthropic_service import AnthropicService
from .document_processor import DocumentProcessor
from .models import GlobalDocument, GlobalDocumentChunk
from .serializers import (
    AnthropicTestSerializer,
    FileUploadSerializer,
    SemanticSearchSerializer,
)

logger = logging.getLogger(__name__)


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
        
        # Call Claude API
        response = claude_service.send_message(
            messages=[{"role": "user", "content": user_message}],
            model=model,
            max_tokens=max_tokens,
            system=system_prompt
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
    serializer = FileUploadSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {"success": False, "errors": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    file_obj  = serializer.validated_data["file"]
    file_type = serializer.validated_data["file_type"]
    discipline = serializer.validated_data.get("discipline") or None
    program    = serializer.validated_data.get("program")    or None
    doc_type   = serializer.validated_data.get("doc_type")   or None

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

        # ── Batch-embed ALL child texts in one forward pass ──────────────────
        # Collect (parent_idx, child_data) pairs so we can assign embeddings
        # after the single batch encode call.
        child_records: list = []  # list of (parent_data_idx, child_data)
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
                title=file_obj.name[:255],
                discipline=discipline,
                program=program,
                doc_type=doc_type,
            )

            # Insert PARENT chunks and build a lookup by parent_data index.
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

            # Build CHILD bulk list using pre-computed embeddings.
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
    try:
        documents = GlobalDocument.objects.order_by("-created_at")
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
