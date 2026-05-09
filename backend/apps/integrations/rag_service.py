"""
Advanced Parent-Child RAG service for ATLAS.

Retrieval pipeline (three steps):
    1. Embed query with BAAI/bge-base-en-v1.5 (768-dim, cosine, normalised).
    2. HNSW vector search over CHILD chunks to find top candidates.
    3. Collect unique PARENT chunks via the parent FK.
    4. Rerank parents with BAAI/bge-reranker-base (cross-encoder).
    5. Return top-k parent texts as rich context dicts for CoT prompts.

Embedding notes:
    - BGE asymmetric retrieval: queries use an instruction prefix; documents don't.
    - embed_document() is used at index time (upload).
    - embed_query()    is used at query time (search).
"""

import logging
import os

from pgvector.django import CosineDistance

from .models import GlobalDocumentChunk

logger = logging.getLogger(__name__)

# ── Lazy singletons ──────────────────────────────────────────────────────────
_EMBEDDER = None
_RERANKER = None


def _get_embedder():
    global _EMBEDDER
    if _EMBEDDER is None:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError:
            raise ValueError(
                "sentence-transformers is not installed. "
                "Run: pip install sentence-transformers"
            )
        model_name = os.environ.get("LOCAL_EMBEDDING_MODEL", "BAAI/bge-base-en-v1.5")
        _EMBEDDER = SentenceTransformer(model_name)
        logger.info("Loaded embedding model: %s", model_name)
    return _EMBEDDER


def _get_reranker():
    global _RERANKER
    # Skip reranker if disabled (to avoid downloading large models on networks with restrictions)
    if os.environ.get("ENABLE_RERANKER", "false").lower() != "true":
        return None
    
    if _RERANKER is None:
        try:
            from sentence_transformers import CrossEncoder
            model_name = os.environ.get("RERANKER_MODEL", "BAAI/bge-reranker-base")
            _RERANKER = CrossEncoder(model_name)
            logger.info("Loaded reranker model: %s", model_name)
        except ImportError:
            logger.warning(
                "CrossEncoder not available (sentence-transformers missing?). "
                "Reranking step will be skipped."
            )
    return _RERANKER


# ── Public embedding helpers (used by the upload view) ───────────────────────

def embed_document(text: str) -> list:
    """
    Embed a single document passage for indexing.

    BGE models do NOT use an instruction prefix for document-side encoding.
    Returns a list of 768 floats, L2-normalised.
    """
    embedder = _get_embedder()
    vector = embedder.encode(text, normalize_embeddings=True)
    return vector.tolist()


def embed_documents_batch(texts: list) -> list:
    """
    Embed a list of document passages in a single batched encode call.

    Much faster than calling embed_document() in a loop — the model processes
    all texts in parallel within a single forward pass (batch_size=32 default).
    Returns a list of lists (one 768-float vector per input text), L2-normalised.
    """
    if not texts:
        return []
    embedder = _get_embedder()
    vectors = embedder.encode(texts, normalize_embeddings=True, batch_size=32, show_progress_bar=False)
    return [v.tolist() for v in vectors]


def embed_query(text: str) -> list:
    """
    Embed a query string for retrieval.

    BGE asymmetric retrieval prepends an instruction prefix to the query only.
    Returns a list of 768 floats, L2-normalised.
    """
    embedder = _get_embedder()
    instruction = "Represent this sentence for searching relevant passages: "
    vector = embedder.encode(instruction + text, normalize_embeddings=True)
    return vector.tolist()


# ── Three-step retrieval ─────────────────────────────────────────────────────

def semantic_search(
    query: str,
    top_k: int = 5,
    discipline: str | None = None,
    program: str | None = None,
    doc_type: str | None = None,
) -> list:
    """
    Retrieve the most relevant PARENT passages for *query*.

    Steps:
        1. Vector search – find top (top_k × 3) CHILD chunks by cosine similarity.
        2. Parent retrieval – collect unique parent GlobalDocumentChunks.
        3. Reranking – score each parent's text against the query with a
           cross-encoder; sort descending, take top_k.

    Args:
        query:      Natural-language query string.
        top_k:      Number of parent passages to return after reranking.
        discipline: Optional filter on global_document.discipline.
        program:    Optional filter on global_document.program.
        doc_type:   Optional filter on global_document.doc_type.

    Returns:
        list of dicts:
            {
                "text":            str,         # full parent text (LLM context)
                "document_title":  str,
                "discipline":      str | None,
                "program":         str | None,
                "page_number":     int | None,
                "score":           float,        # reranker score (higher = better)
            }

        Returns [] on any error so callers can still generate without RAG context.
    """
    try:
        # ── Step 1: vector search over CHILD chunks ────────────────────────
        query_vec = embed_query(query)

        child_qs = (
            GlobalDocumentChunk.objects
            .select_related("document", "parent", "parent__document")
            .filter(chunk_role="CHILD", embedding_vector__isnull=False)
        )

        # Optional metadata pre-filtering (fast, uses the B-tree index)
        if discipline:
            child_qs = child_qs.filter(document__discipline__iexact=discipline)
        if program:
            child_qs = child_qs.filter(document__program__iexact=program)
        if doc_type:
            child_qs = child_qs.filter(document__doc_type__iexact=doc_type)

        # Retrieve 3× top_k children to ensure enough unique parents after dedup.
        child_matches = (
            child_qs
            .annotate(distance=CosineDistance("embedding_vector", query_vec))
            .order_by("distance")[: top_k * 3]
        )

        # ── Step 2: collect unique parent chunks ───────────────────────────
        seen_ids: set = set()
        parent_chunks: list = []

        for child in child_matches:
            if child.parent_id and child.parent_id not in seen_ids:
                seen_ids.add(child.parent_id)
                parent_chunks.append(child.parent)

        # Graceful fallback: if no parent was stored, treat the child itself
        # as context (supports legacy flat chunks without chunk_role).
        if not parent_chunks:
            for child in child_matches:
                if child.chunk_id not in seen_ids:
                    seen_ids.add(child.chunk_id)
                    parent_chunks.append(child)

        if not parent_chunks:
            return []

        # ── Step 3: rerank parents ─────────────────────────────────────────
        reranker = _get_reranker()
        if reranker is not None:
            pairs = [(query, p.text_content) for p in parent_chunks]
            scores = reranker.predict(pairs).tolist()
        else:
            # Position-based fallback (already ordered by vector similarity).
            scores = [1.0 / (i + 1) for i in range(len(parent_chunks))]

        ranked = sorted(
            zip(scores, parent_chunks), key=lambda x: x[0], reverse=True
        )[:top_k]

        results = []
        for score, chunk in ranked:
            doc = chunk.document
            results.append(
                {
                    "text": chunk.text_content,
                    "document_title": doc.title,
                    "discipline": getattr(doc, "discipline", None),
                    "program": getattr(doc, "program", None),
                    "page_number": chunk.page_number,
                    "score": round(float(score), 4),
                }
            )

        logger.info(
            "semantic_search(%r) → %d candidates → %d reranked results",
            query[:60],
            len(parent_chunks),
            len(results),
        )
        return results

    except Exception:
        logger.exception("semantic_search failed; returning empty context")
        return []
