"""
Advanced Parent-Child RAG service for ATLAS.

Retrieval pipeline:
    1. Embed query with BAAI/bge-base-en-v1.5 (768-dim, cosine, normalised).
    2. HNSW vector search over CHILD chunks (over-retrieve 6× top_k).
    3. Collect unique PARENT chunks via the parent FK.
    4. Hybrid scoring: 70% dense cosine similarity + 30% BM25 keyword score.
    5. Optionally rerank parents with BAAI/bge-reranker-base (cross-encoder).
    6. Filter by similarity threshold (0.75); gracefully abstain if none pass.
    7. Progressive context summarisation: batch → sentence-score → top-10 summary.

Embedding notes:
    - BGE asymmetric retrieval: queries use an instruction prefix; documents don't.
    - embed_document() is used at index time (upload).
    - embed_query()    is used at query time (search).
"""

import logging
import math
import os
import re
import threading
import time

from pgvector.django import CosineDistance

from .models import GlobalDocumentChunk, ChildChunk, ParentChunk

logger = logging.getLogger(__name__)

# ── Optional BM25 ────────────────────────────────────────────────────────────
try:
    from rank_bm25 import BM25Okapi
    BM25_AVAILABLE = True
except ImportError:
    BM25_AVAILABLE = False
    BM25Okapi = None  # type: ignore

# ── RAG hyper-parameters (mirror PEA defaults) ───────────────────────────────
_SIMILARITY_THRESHOLD: float = 0.75   # cosine similarity floor; abstain below
_DENSE_WEIGHT: float = 0.70           # hybrid score: 70 % dense
_BM25_WEIGHT: float = 0.30            # hybrid score: 30 % BM25
_OVER_RETRIEVE_FACTOR: int = 6        # fetch 6× top_k children before dedup

# Progressive summarisation settings (mirror PEA)
_SUMMARY_BATCH_WORDS: int = 1_200
_SUMMARY_SENTENCES_PER_BATCH: int = 4
_SUMMARY_MAX_SENTENCES: int = 10

# Stop words for BM25 tokenisation — common English function words.
# Academic / OBE domain terms (ilo, clo, bloom, obe, …) are intentionally kept.
_STOP_WORDS: frozenset = frozenset({
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'shall', 'can', 'it', 'its', 'this',
    'that', 'these', 'those', 'he', 'she', 'they', 'we', 'you', 'i', 'me',
    'him', 'her', 'us', 'them', 'my', 'your', 'his', 'our', 'their',
    'what', 'which', 'who', 'when', 'where', 'how', 'as', 'so', 'if',
    'not', 'no', 'nor', 'than', 'then', 'also', 'both', 'each', 'more',
    'most', 'other', 'some', 'such', 'into', 'through', 'during', 'before',
    'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under',
    'again', 'further', 'once', 'about', 'up', 'down', 'any', 'all',
    'very', 'too', 'just', 'am', 'within',
})

# ── Lazy singletons ──────────────────────────────────────────────────────────
_EMBEDDER = None
_EMBEDDER_LOCK = threading.Lock()
_RERANKER = None


def _get_embedder():
    global _EMBEDDER
    if _EMBEDDER is not None:
        return _EMBEDDER
    with _EMBEDDER_LOCK:
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
                "CrossEncoder not available. Reranking step will be skipped."
            )
    return _RERANKER


# ── Public embedding helpers ─────────────────────────────────────────────────

def embedding_provider() -> str:
    """'local' (sentence-transformers) or 'huggingface' (hosted HF Inference API)."""
    return os.environ.get("EMBEDDING_PROVIDER", "local").strip().lower()


_HF_BATCH_SIZE = 32
_HF_MAX_ATTEMPTS = 4


def _hf_encode(texts: list) -> list:
    """
    Embed texts with the same BGE model via the Hugging Face Inference API, so
    vectors match locally-indexed ones without installing PyTorch.
    """
    import requests

    token = os.environ.get("HF_TOKEN", "").strip()
    if not token:
        raise ValueError(
            "EMBEDDING_PROVIDER=huggingface requires HF_TOKEN "
            "(a Hugging Face token with Inference Providers permission)."
        )
    model_name = os.environ.get("LOCAL_EMBEDDING_MODEL", "BAAI/bge-base-en-v1.5")
    url = os.environ.get(
        "HF_EMBEDDING_URL",
        f"https://router.huggingface.co/hf-inference/models/{model_name}/pipeline/feature-extraction",
    )
    headers = {"Authorization": f"Bearer {token}"}

    vectors: list = []
    for start in range(0, len(texts), _HF_BATCH_SIZE):
        batch = texts[start:start + _HF_BATCH_SIZE]
        for attempt in range(1, _HF_MAX_ATTEMPTS + 1):
            response = requests.post(
                url,
                headers=headers,
                json={"inputs": batch, "normalize": True, "truncate": True},
                timeout=120,
            )
            # 503 = model cold-starting, 429 = rate limited; both are transient.
            if response.status_code in (429, 503) and attempt < _HF_MAX_ATTEMPTS:
                time.sleep(2 ** attempt)
                continue
            if response.status_code != 200:
                raise ValueError(
                    f"Hugging Face embedding request failed "
                    f"({response.status_code}): {response.text[:300]}"
                )
            break
        vectors.extend(response.json())

    return [_l2_normalize(v) for v in vectors]


def _l2_normalize(vector: list) -> list:
    norm = math.sqrt(sum(x * x for x in vector)) or 1.0
    return [x / norm for x in vector]


def _encode(texts: list) -> list:
    if embedding_provider() == "huggingface":
        return _hf_encode(texts)
    embedder = _get_embedder()
    vectors = embedder.encode(texts, normalize_embeddings=True, batch_size=32, show_progress_bar=False)
    return [v.tolist() for v in vectors]


def embed_document(text: str) -> list:
    """Embed a single document passage for indexing (no instruction prefix)."""
    return _encode([text])[0]


def embed_documents_batch(texts: list) -> list:
    """Batch-embed document passages (faster than looping embed_document)."""
    if not texts:
        return []
    return _encode(texts)


def embed_query(text: str) -> list:
    """Embed a query string with the BGE asymmetric instruction prefix."""
    instruction = "Represent this sentence for searching relevant passages: "
    return _encode([instruction + text])[0]


# ── Internal helpers ─────────────────────────────────────────────────────────

def _tokenize_for_bm25(text: str) -> list:
    """
    Tokenise text for BM25: lowercase, strip punctuation, remove stop words.
    Preserves domain terms (ilo, clo, obe, bloom, …) since they are not stop words.
    """
    tokens = re.sub(r'[^\w\s]', ' ', text.lower()).split()
    return [t for t in tokens if t not in _STOP_WORDS and len(t) > 1]


def _progressive_context_summary(query: str, chunks: list) -> tuple:
    """
    Build a token-efficient summary from retrieved chunks.

    Algorithm (mirrors PEA):
      1. Batch chunks into ~1 200-word bins.
      2. Within each batch score every sentence by query-term overlap.
      3. Keep top-4 sentences per batch.
      4. Globally re-sort and keep top-10 sentences as the final summary.

    Returns:
        (summary_text: str, source_refs: list[str])
    """
    if not chunks:
        return "", []

    query_terms = set(_tokenize_for_bm25(query))

    # ── Batch chunks ──────────────────────────────────────────────────────
    batches: list = []
    current_batch: list = []
    current_words: int = 0
    for chunk in chunks:
        words = len(chunk["text"].split())
        if current_words + words > _SUMMARY_BATCH_WORDS and current_batch:
            batches.append(current_batch)
            current_batch = [chunk]
            current_words = words
        else:
            current_batch.append(chunk)
            current_words += words
    if current_batch:
        batches.append(current_batch)

    # ── Score sentences per batch ─────────────────────────────────────────
    all_scored: list = []
    source_refs: list = []

    for batch in batches:
        batch_text = " ".join(c["text"] for c in batch)
        sentences = re.split(r"(?<=[.!?])\s+", batch_text)
        batch_scored: list = []
        for sent in sentences:
            if len(sent.split()) < 5:
                continue
            sent_terms = set(_tokenize_for_bm25(sent))
            overlap = len(query_terms & sent_terms) / max(len(query_terms), 1)
            batch_scored.append((overlap, sent))
        batch_scored.sort(key=lambda x: x[0], reverse=True)
        all_scored.extend(batch_scored[:_SUMMARY_SENTENCES_PER_BATCH])
        for c in batch:
            ref = c.get("document_title", "Unknown")
            if c.get("page_number"):
                ref += f" | p.{c['page_number']}"
            source_refs.append(ref)

    # ── Consolidate ───────────────────────────────────────────────────────
    all_scored.sort(key=lambda x: x[0], reverse=True)
    top_sentences = [s for _, s in all_scored[:_SUMMARY_MAX_SENTENCES]]

    summary = " ".join(top_sentences) if top_sentences else ""
    unique_refs = list(dict.fromkeys(source_refs))   # preserve order, deduplicate
    return summary, unique_refs


# ── Retrieval ────────────────────────────────────────────────────────────────

def semantic_search(
    query: str,
    institution_id: str | None = None,
    top_k: int = 5,
    discipline: str | None = None,
    program: str | None = None,
    doc_type: str | None = None,
) -> list:
    """
    Retrieve the most relevant PARENT passages for *query*.

    Improvements over the original three-step retrieval:
      - Over-retrieves 6× top_k children (was 3×) for a richer reranking pool.
      - Converts cosine distance → similarity (1 – distance) for interpretability.
      - BM25 keyword scoring (rank_bm25) blended 70 % dense / 30 % BM25.
      - Cross-encoder reranking (if ENABLE_RERANKER=true).

    Returns:
        list of dicts with keys: text, document_title, discipline, program,
        page_number, score.  Returns [] on error or empty DB.
    """
    if not institution_id:
        logger.warning("Skipping global RAG search without an institution context.")
        return []

    try:
        query_vec = embed_query(query)

        child_qs = (
            GlobalDocumentChunk.objects
            .select_related("document", "parent", "parent__document")
            .filter(chunk_role="CHILD", embedding_vector__isnull=False)
            .filter(document__institution_id=institution_id)
        )
        if discipline:
            child_qs = child_qs.filter(document__discipline__iexact=discipline)
        if program:
            child_qs = child_qs.filter(document__program__iexact=program)
        if doc_type:
            child_qs = child_qs.filter(document__doc_type__iexact=doc_type)

        # Over-retrieve for a larger reranking / BM25 pool
        child_matches = list(
            child_qs
            .annotate(distance=CosineDistance("embedding_vector", query_vec))
            .order_by("distance")[: top_k * _OVER_RETRIEVE_FACTOR]
        )

        if not child_matches:
            return []

        # ── Collect unique parents with best child similarity per parent ──
        parent_best: dict = {}   # parent_id → {"chunk": ..., "sim": float}
        for child in child_matches:
            sim = max(0.0, 1.0 - float(child.distance))
            if child.parent_id:
                prev = parent_best.get(child.parent_id)
                if prev is None or sim > prev["sim"]:
                    parent_best[child.parent_id] = {"chunk": child.parent, "sim": sim}

        # Fallback: treat child itself as context (no parent stored)
        if not parent_best:
            seen: set = set()
            for child in child_matches:
                if child.chunk_id not in seen:
                    seen.add(child.chunk_id)
                    sim = max(0.0, 1.0 - float(child.distance))
                    parent_best[str(child.chunk_id)] = {"chunk": child, "sim": sim}

        if not parent_best:
            return []

        parent_chunks = [v["chunk"] for v in parent_best.values()]
        dense_scores  = [v["sim"]   for v in parent_best.values()]

        # ── Hybrid BM25 + dense scoring ───────────────────────────────────
        if BM25_AVAILABLE and len(parent_chunks) > 1:
            tokenized_corpus = [_tokenize_for_bm25(p.text_content) for p in parent_chunks]
            bm25 = BM25Okapi(tokenized_corpus)
            query_tokens = _tokenize_for_bm25(query)
            bm25_raw = bm25.get_scores(query_tokens).tolist()
            max_bm25 = max(bm25_raw) if max(bm25_raw) > 0 else 1.0
            bm25_norm = [s / max_bm25 for s in bm25_raw]
            hybrid_scores = [
                _DENSE_WEIGHT * d + _BM25_WEIGHT * b
                for d, b in zip(dense_scores, bm25_norm)
            ]
            scoring_mode = "bm25-hybrid"
        else:
            hybrid_scores = dense_scores
            scoring_mode = "dense-only"

        # ── Cross-encoder reranking (optional) ───────────────────────────
        reranker = _get_reranker()
        if reranker is not None:
            pairs = [(query, p.text_content) for p in parent_chunks]
            final_scores = reranker.predict(pairs).tolist()
            scoring_mode = "cross-encoder"
        else:
            final_scores = hybrid_scores

        ranked = sorted(
            zip(final_scores, parent_chunks),
            key=lambda x: x[0],
            reverse=True,
        )[:top_k]

        results = []
        for score, chunk in ranked:
            doc = chunk.document
            results.append({
                "text":           chunk.text_content,
                "document_title": doc.title,
                "discipline":     getattr(doc, "discipline", None),
                "program":        getattr(doc, "program", None),
                "page_number":    chunk.page_number,
                "score":          round(float(score), 4),
            })

        logger.info(
            "semantic_search(%r) → %d parents → %d %s results",
            query[:60], len(parent_chunks), len(results), scoring_mode,
        )
        return results

    except Exception:
        logger.exception("semantic_search failed; returning empty context")
        return []


def semantic_search_with_summary(
    query: str,
    institution_id: str | None = None,
    top_k: int = 5,
    discipline: str | None = None,
    program: str | None = None,
    doc_type: str | None = None,
) -> dict:
    """
    Enhanced semantic search that also computes a progressive context summary.

    The summary batches retrieved chunks into ~1 200-word bins, scores every
    sentence by query-term overlap (BM25 stop-word–filtered), and returns the
    top-10 most relevant sentences.  This gives the CoT prompt builder a
    token-efficient grounding string instead of raw chunk dumps.

    Also applies the similarity threshold (0.75) and sets *abstained=True*
    when no result meets the bar, so callers can skip context injection.

    Returns:
        {
            "abstained":       bool,
            "chunks":          list,        # same format as semantic_search()
            "context_summary": str,         # condensed, query-relevant sentences
            "summary_sources": list[str],   # unique "Title | p.N" refs
        }
    """
    chunks = semantic_search(
        query=query, institution_id=institution_id, top_k=top_k,
        discipline=discipline, program=program, doc_type=doc_type,
    )

    if not chunks:
        return {
            "abstained": True,
            "chunks": [],
            "context_summary": "",
            "summary_sources": [],
        }

    # Graceful abstention: warn if best score is below threshold but still return
    best_score = max(c["score"] for c in chunks)
    abstained = best_score < _SIMILARITY_THRESHOLD
    if abstained:
        logger.warning(
            "semantic_search_with_summary: best score %.3f < threshold %.2f "
            "for query %r — context may be weakly relevant",
            best_score, _SIMILARITY_THRESHOLD, query[:60],
        )

    summary, sources = _progressive_context_summary(query, chunks)

    return {
        "abstained": abstained,
        "chunks": chunks,
        "context_summary": summary,
        "summary_sources": sources,
    }


# ── Course-specific retrieval ─────────────────────────────────────────────────

def _to_1536_dim(vector: list) -> list:
    """Pad or trim a vector to 1536 dimensions (matches ChildChunk storage format)."""
    if len(vector) == 1536:
        return vector
    if len(vector) > 1536:
        return vector[:1536]
    return vector + [0.0] * (1536 - len(vector))


def course_semantic_search(
    query: str,
    course,          # Course model instance
    top_k: int = 5,
    selected_doc_ids: list | None = None,   # list of records_id UUID strings
) -> list:
    """
    Search within course-specific ChildChunk embeddings.

    Returns the top-k most relevant ParentChunk passages for *query*,
    filtered to the given course (and optionally to specific uploaded files).

    Returns:
        list of dicts: text, document_title, score
    """
    try:
        query_vec_768 = embed_query(query)
        query_vec = _to_1536_dim(query_vec_768)

        child_qs = (
            ChildChunk.objects
            .select_related("parent", "parent__records")
            .filter(embedding_vector__isnull=False, parent__records__course=course)
        )
        if selected_doc_ids:
            child_qs = child_qs.filter(parent__records__records_id__in=selected_doc_ids)

        over_retrieve = top_k * _OVER_RETRIEVE_FACTOR
        child_matches = list(
            child_qs
            .annotate(distance=CosineDistance("embedding_vector", query_vec))
            .order_by("distance")[:over_retrieve]
        )

        if not child_matches:
            return []

        # Collect unique parents with best child similarity
        parent_best: dict = {}
        for child in child_matches:
            sim = max(0.0, 1.0 - float(child.distance))
            pid = str(child.parent_id)
            prev = parent_best.get(pid)
            if prev is None or sim > prev["sim"]:
                parent_best[pid] = {"chunk": child.parent, "sim": sim}

        if not parent_best:
            return []

        parent_chunks = [v["chunk"] for v in parent_best.values()]
        dense_scores  = [v["sim"]   for v in parent_best.values()]

        # Hybrid BM25 + dense scoring
        if BM25_AVAILABLE and len(parent_chunks) > 1:
            tokenized_corpus = [_tokenize_for_bm25(p.parent_content) for p in parent_chunks]
            bm25 = BM25Okapi(tokenized_corpus)
            query_tokens = _tokenize_for_bm25(query)
            bm25_raw = bm25.get_scores(query_tokens).tolist()
            max_bm25 = max(bm25_raw) if max(bm25_raw) > 0 else 1.0
            bm25_norm = [s / max_bm25 for s in bm25_raw]
            final_scores = [
                _DENSE_WEIGHT * d + _BM25_WEIGHT * b
                for d, b in zip(dense_scores, bm25_norm)
            ]
        else:
            final_scores = dense_scores

        ranked = sorted(
            zip(final_scores, parent_chunks),
            key=lambda x: x[0],
            reverse=True,
        )[:top_k]

        results = []
        for score, chunk in ranked:
            results.append({
                "text":           chunk.parent_content,
                "document_title": getattr(chunk.records, "storage_path", "Course Upload").split("/")[-1],
                "page_number":    None,
                "score":          round(float(score), 4),
            })

        logger.info(
            "course_semantic_search(%r, course=%s) → %d results",
            query[:60], course, len(results),
        )
        return results

    except Exception:
        logger.exception("course_semantic_search failed; returning empty context")
        return []


def course_semantic_search_with_summary(
    query: str,
    course,
    top_k: int = 5,
    selected_doc_ids: list | None = None,
) -> dict:
    """
    Like semantic_search_with_summary() but searches course-specific uploads.
    """
    chunks = course_semantic_search(query, course, top_k=top_k, selected_doc_ids=selected_doc_ids)

    if not chunks:
        return {
            "abstained": True,
            "chunks": [],
            "context_summary": "",
            "summary_sources": [],
        }

    best_score = max(c["score"] for c in chunks)
    abstained = best_score < _SIMILARITY_THRESHOLD

    summary, sources = _progressive_context_summary(query, chunks)

    return {
        "abstained": abstained,
        "chunks": chunks,
        "context_summary": summary,
        "summary_sources": sources,
    }
