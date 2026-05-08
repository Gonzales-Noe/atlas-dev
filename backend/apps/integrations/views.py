import logging
import os

from django.db import transaction
import httpx
import numpy as np
from pgvector.django import CosineDistance
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .anthropic_service import AnthropicService
from .document_processor import DocumentProcessor
from .models import GlobalDocument, GlobalDocumentChunk
from .serializers import (
    AnthropicTestSerializer,
    FileUploadSerializer,
    SemanticSearchSerializer,
)

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_IMPORT_ERROR = None
except ImportError as exc:
    SentenceTransformer = None
    SENTENCE_TRANSFORMERS_IMPORT_ERROR = str(exc)

logger = logging.getLogger(__name__)
_LOCAL_EMBEDDER = None


def _get_local_embedder():
    global _LOCAL_EMBEDDER
    if SentenceTransformer is None:
        detail = SENTENCE_TRANSFORMERS_IMPORT_ERROR or "unknown import error"
        raise ValueError(f"sentence-transformers package is not installed. Details: {detail}")
    if _LOCAL_EMBEDDER is None:
        model_name = os.environ.get("LOCAL_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
        _LOCAL_EMBEDDER = SentenceTransformer(model_name)
    return _LOCAL_EMBEDDER


def _get_embedding_client():
    """Return embedding backend and client details from env config."""
    provider = os.environ.get("EMBEDDING_PROVIDER", "hash").lower()

    if provider == "hash":
        return "hash", None

    if provider == "local":
        return "local", _get_local_embedder()

    openai_api_key = os.environ.get("OPENAI_API_KEY")
    if provider == "openai" and openai_api_key:
        if OpenAI is None:
            raise ValueError("openai package is not installed.")
        return "openai", OpenAI(api_key=openai_api_key)

    openrouter_api_key = os.environ.get("OPENROUTER_API_KEY")
    if provider == "openrouter_sdk" and openrouter_api_key:
        if OpenAI is None:
            raise ValueError("openai package is not installed.")
        referer = os.environ.get("OPENROUTER_SITE_URL", "http://localhost:8000")
        title = os.environ.get("OPENROUTER_APP_NAME", "ATLAS-Dev")
        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=openrouter_api_key,
            default_headers={
                "HTTP-Referer": referer,
                "X-Title": title,
            },
        )
        return "openrouter_sdk", client

    # Legacy raw-httpx path kept for reference
    if provider == "openrouter" and openrouter_api_key:
        return "openrouter", openrouter_api_key

    if provider == "groq":
        raise ValueError("Groq embeddings are not configured yet. Use EMBEDDING_PROVIDER=hash/local/openrouter_sdk/openai.")

    raise ValueError("Invalid embedding configuration. Set EMBEDDING_PROVIDER=hash/local/openrouter_sdk/openai.")


def _embed_text(client_config, text):
    """Generate embedding vector for one text chunk."""
    provider, client = client_config

    if provider == "hash":
        # Fast deterministic fallback embedding for environments without model/API access.
        # Produces stable 1536-d vectors so pgvector similarity works immediately.
        import hashlib
        values = []
        base = text.encode("utf-8", errors="ignore")
        for idx in range(1536):
            digest = hashlib.sha256(base + f":{idx}".encode("utf-8")).digest()
            values.append(((int.from_bytes(digest[:4], "big") / 2**32) * 2.0) - 1.0)
        return values

    if provider == "local":
        vector = client.encode(text).tolist()
        # Match DB VectorField dimension (1536).
        if len(vector) < 1536:
            vector = vector + [0.0] * (1536 - len(vector))
        elif len(vector) > 1536:
            vector = vector[:1536]
        return np.asarray(vector, dtype=float).tolist()

    if provider in ("openai", "openrouter_sdk"):
        env_key = "OPENAI_EMBEDDING_MODEL" if provider == "openai" else "OPENROUTER_EMBEDDING_MODEL"
        default_model = "text-embedding-3-small" if provider == "openai" else "openai/text-embedding-3-small"
        model_name = os.environ.get(env_key, default_model)
        result = client.embeddings.create(model=model_name, input=text)
        return result.data[0].embedding

    # Legacy OpenRouter embedding path with explicit Authorization header.
    model_name = os.environ.get("OPENROUTER_EMBEDDING_MODEL", "openai/text-embedding-3-small")
    response = httpx.post(
        "https://openrouter.ai/api/v1/embeddings",
        headers={
            "Authorization": f"Bearer {client}",
            "Content-Type": "application/json",
        },
        json={
            "model": model_name,
            "input": text,
        },
        timeout=30.0,
    )
    response.raise_for_status()
    payload = response.json()
    return payload["data"][0]["embedding"]


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
    Upload and ingest a document for RAG.
    
    Endpoint: POST /api/integrations/upload-rag-document/
    
    Expected Request (multipart/form-data):
    - file: Document file (PDF or DOCX)
    - file_type: 'pdf' or 'docx'
    - course_id: Optional course identifier
    - course_name: Optional course name
    
    Returns:
        201 Created: {
            "success": true,
            "document_id": 123,
            "file_name": "course_syllabus_IT301.docx",
            "total_segments": 24,
            "status": "indexed",
            "message": "[ATLAS RAG] Successfully chunked and embedded 24 segments..."
        }
        
        400 Bad Request: Validation errors
        401 Unauthorized: Missing/invalid JWT token
        500 Internal Server Error: Processing error
    """
    serializer = FileUploadSerializer(data=request.data)
    if not serializer.is_valid():
        logger.warning("Validation error: %s", serializer.errors)
        return Response(
            {"success": False, "errors": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    file_obj = serializer.validated_data["file"]
    file_type = serializer.validated_data["file_type"]
    description = serializer.validated_data.get("course_name", "") or serializer.validated_data.get("course_id", "")

    is_valid, error_msg = DocumentProcessor.validate_file(file_obj, file_type)
    if not is_valid:
        return Response(
            {"success": False, "error": error_msg},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        embedding_client = _get_embedding_client()
        # Pass the raw SentenceTransformer model to process_file so SemanticChunker
        # can use it for topic-boundary detection. For non-local providers the
        # embedder is None and RecursiveCharacterTextSplitter is used instead.
        provider, raw_client = embedding_client
        st_embedder = raw_client if provider == "local" else None
        segments_data = DocumentProcessor.process_file(file_obj, file_type, file_obj.name, embedder=st_embedder)
        if not segments_data:
            return Response(
                {"success": False, "error": "No text extracted from file."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            document = GlobalDocument.objects.create(
                title=file_obj.name[:255],
                description=description[:1000] if description else None,
            )

            chunks = []
            for segment in segments_data:
                text_content = segment["content"]
                embedding = _embed_text(embedding_client, text_content)
                chunks.append(
                    GlobalDocumentChunk(
                        document=document,
                        page_number=segment.get("page_number"),
                        text_content=text_content,
                        embedding_vector=embedding,
                    )
                )

            GlobalDocumentChunk.objects.bulk_create(chunks)

        message = (
            f"[ATLAS RAG] Stored {len(chunks)} embedded chunks from {file_obj.name} "
            "in global_document/global_document_chunk."
        )
        logger.info(message)

        return Response(
            {
                "success": True,
                "document_id": str(document.document_id),
                "file_name": file_obj.name,
                "total_chunks": len(chunks),
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
    Semantic search over global document chunks.

    Endpoint: POST /api/integrations/semantic-search/
    Body:
    {
      "query": "What is typology in OBE?",
      "top_k": 5
    }
    """
    serializer = SemanticSearchSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {"success": False, "errors": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    query_text = serializer.validated_data["query"]
    top_k = serializer.validated_data["top_k"]

    try:
        embedding_client = _get_embedding_client()
        query_embedding = _embed_text(embedding_client, query_text)

        matches = (
            GlobalDocumentChunk.objects.select_related("document")
            .filter(embedding_vector__isnull=False)
            .annotate(distance=CosineDistance("embedding_vector", query_embedding))
            .order_by("distance")[:top_k]
        )

        results = [
            {
                "chunk_id": str(item.chunk_id),
                "document_id": str(item.document.document_id),
                "document_title": item.document.title,
                "page_number": item.page_number,
                "text_content": item.text_content,
                "score": 1 - float(item.distance),
                "distance": float(item.distance),
            }
            for item in matches
        ]

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
