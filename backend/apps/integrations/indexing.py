"""
Background indexing for knowledge-base uploads.

Upload requests only validate the file and create a PROCESSING record
(GlobalDocument for admin uploads, CourseFile for faculty uploads); chunking,
embedding and chunk storage happen here so the request returns immediately.
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import BytesIO

from django.db import close_old_connections, transaction
from django.utils import timezone

from . import rag_service
from .document_processor import DocumentProcessor
from .models import (
    ChildChunk,
    CourseFile,
    GlobalDocument,
    GlobalDocumentChunk,
    ParentChunk,
    RagStatusEnum,
)

logger = logging.getLogger(__name__)

# Embedding is CPU- and memory-heavy, so documents are indexed one at a time.
_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="rag-indexer")

# Indexing runs in-process; a record still PROCESSING after this long was lost
# to a server restart and will never finish.
STALE_PROCESSING_AFTER = timedelta(hours=1)
STALE_PROCESSING_MESSAGE = "Indexing was interrupted by a server restart. Please upload the file again."


def _is_stale(status, created_at) -> bool:
    return (
        status == "PROCESSING"
        and created_at is not None
        and timezone.now() - created_at > STALE_PROCESSING_AFTER
    )


def is_stale_processing(document) -> bool:
    return _is_stale(document.status, document.created_at)


def is_stale_course_file(course_file) -> bool:
    return _is_stale(course_file.rag_status, course_file.created_at)


def _chunk_and_embed(file_bytes, file_type, file_name):
    """Return (parents_data, child_records, embeddings) for a file."""
    from .pii_masking import assert_no_high_confidence_pii, mask_and_verify

    hierarchical = DocumentProcessor.process_file_hierarchical(
        BytesIO(file_bytes), file_type, file_name
    )
    parents_data = hierarchical.get("parents", [])
    if not parents_data:
        raise ValueError("No text could be extracted from the file.")

    # Defense in depth: re-verify parent/child text before embedding.
    # Vectors cannot be inspected for PII; we gate the text that becomes vectors
    # (and is later retrieved into LLM prompts).
    for p_idx, parent_data in enumerate(parents_data):
        parent_text = parent_data.get("content") or parent_data.get("parent_content") or ""
        if parent_text:
            parent_data["content"] = mask_and_verify(
                parent_text, context=f"{file_name}:parent[{p_idx}]"
            )
        for c_idx, child_data in enumerate(parent_data.get("children", [])):
            child_text = child_data.get("content") or ""
            if not child_text:
                continue
            redacted = mask_and_verify(
                child_text, context=f"{file_name}:child[{p_idx}.{c_idx}]"
            )
            child_data["content"] = redacted
            assert_no_high_confidence_pii(
                redacted, context=f"pre-embed:{file_name}:child[{p_idx}.{c_idx}]"
            )

    child_records: list = []
    for p_idx, parent_data in enumerate(parents_data):
        for child_data in parent_data.get("children", []):
            child_records.append((p_idx, child_data))

    texts_to_embed = [c["content"] for _, c in child_records]
    for i, text in enumerate(texts_to_embed):
        assert_no_high_confidence_pii(text, context=f"embedding-batch[{i}]")

    logger.info("[ATLAS RAG] Batch-embedding %d PII-scrubbed child chunks…", len(child_records))
    embeddings = rag_service.embed_documents_batch(texts_to_embed)
    return parents_data, child_records, embeddings


def _run_job(index_fn, mark_failed, file_name, *args):
    close_old_connections()
    try:
        index_fn(*args)
    except Exception as exc:
        logger.exception("[ATLAS RAG] Indexing failed for %s", file_name)
        mark_failed(str(exc)[:1000] or exc.__class__.__name__)
    finally:
        close_old_connections()


# ── Global (admin) knowledge-base documents ─────────────────────────────────

def enqueue_global_document(document_id, file_bytes, file_type, file_name):
    _EXECUTOR.submit(_run_index_job, document_id, file_bytes, file_type, file_name)


def _run_index_job(document_id, file_bytes, file_type, file_name):
    def mark_failed(message):
        GlobalDocument.objects.filter(document_id=document_id).update(
            status=GlobalDocument.IndexStatus.FAILED, error_message=message,
        )

    _run_job(
        index_global_document, mark_failed, file_name,
        document_id, file_bytes, file_type, file_name,
    )


def index_global_document(document_id, file_bytes, file_type, file_name):
    """Chunk, embed and store a global document, then mark it READY."""
    parents_data, child_records, embeddings = _chunk_and_embed(file_bytes, file_type, file_name)

    with transaction.atomic():
        document = (
            GlobalDocument.objects.select_for_update()
            .filter(document_id=document_id)
            .first()
        )
        if document is None:
            logger.info("[ATLAS RAG] %s was deleted before indexing finished.", file_name)
            return

        parent_chunk_map: dict = {}
        for p_idx, parent_data in enumerate(parents_data):
            parent_chunk_map[p_idx] = GlobalDocumentChunk.objects.create(
                document=document,
                chunk_role="PARENT",
                page_number=parent_data.get("page_number"),
                text_content=parent_data["content"],
                token_count=parent_data.get("token_count"),
                embedding_vector=None,
            )

        GlobalDocumentChunk.objects.bulk_create([
            GlobalDocumentChunk(
                document=document,
                parent=parent_chunk_map[p_idx],
                chunk_role="CHILD",
                page_number=child_data.get("page_number"),
                text_content=child_data["content"],
                token_count=child_data.get("token_count"),
                embedding_vector=embeddings[i],
            )
            for i, (p_idx, child_data) in enumerate(child_records)
        ])

        document.status = GlobalDocument.IndexStatus.READY
        document.error_message = None
        document.save(update_fields=["status", "error_message"])

    logger.info(
        "[ATLAS RAG] Indexed %d parents and %d children from %s.",
        len(parents_data), len(child_records), file_name,
    )


# ── Course (faculty) knowledge-base files ───────────────────────────────────

def enqueue_course_file(records_id, file_bytes, file_type, file_name, module_tag, term_tag):
    _EXECUTOR.submit(
        _run_course_job, records_id, file_bytes, file_type, file_name, module_tag, term_tag,
    )


def _run_course_job(records_id, file_bytes, file_type, file_name, module_tag, term_tag):
    def mark_failed(message):
        CourseFile.objects.filter(records_id=records_id).update(
            rag_status=RagStatusEnum.FAILED, error_message=message,
        )

    _run_job(
        index_course_file, mark_failed, file_name,
        records_id, file_bytes, file_type, file_name, module_tag, term_tag,
    )


def _to_1536_dim(vector):
    """Pad or trim vectors so they fit ChildChunk.vector(1536)."""
    if vector is None:
        return None
    if len(vector) >= 1536:
        return vector[:1536]
    return vector + [0.0] * (1536 - len(vector))


def index_course_file(records_id, file_bytes, file_type, file_name, module_tag, term_tag):
    """Chunk, embed and store a faculty course file, then mark it COMPLETED."""
    parents_data, child_records, embeddings = _chunk_and_embed(file_bytes, file_type, file_name)

    with transaction.atomic():
        course_file = (
            CourseFile.objects.select_for_update()
            .filter(records_id=records_id)
            .first()
        )
        if course_file is None:
            logger.info("[ATLAS RAG] %s was deleted before indexing finished.", file_name)
            return

        parent_rows = {}
        for p_idx, parent_data in enumerate(parents_data):
            parent_rows[p_idx] = ParentChunk.objects.create(
                records=course_file,
                uploader_id=course_file.uploader_id,
                module_tag=module_tag,
                term_tag=term_tag,
                parent_content=parent_data["content"],
            )

        ChildChunk.objects.bulk_create([
            ChildChunk(
                parent=parent_rows[p_idx],
                uploader_id=course_file.uploader_id,
                overlap_text=child_data["content"],
                embedding_vector=_to_1536_dim(embeddings[i]),
            )
            for i, (p_idx, child_data) in enumerate(child_records)
        ])

        course_file.rag_status = RagStatusEnum.COMPLETED
        course_file.error_message = None
        course_file.save(update_fields=["rag_status", "error_message"])

    logger.info(
        "[ATLAS RAG] Indexed %d parents and %d children from course file %s.",
        len(parents_data), len(child_records), file_name,
    )
