import logging
import hashlib
import os
import re
from io import BytesIO
from pathlib import Path

try:
    import tiktoken
    TIKTOKEN_AVAILABLE = True
except ImportError:
    TIKTOKEN_AVAILABLE = False
    tiktoken = None

try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    LANGCHAIN_SPLITTER_AVAILABLE = True
except ImportError:
    LANGCHAIN_SPLITTER_AVAILABLE = False
    RecursiveCharacterTextSplitter = None

try:
    from langchain_experimental.text_splitter import SemanticChunker
    SEMANTIC_CHUNKER_AVAILABLE = True
except ImportError:
    SEMANTIC_CHUNKER_AVAILABLE = False
    SemanticChunker = None

try:
    import fitz  # PyMuPDF – header-aware PDF extraction
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False
    fitz = None

from docx import Document as DocxDocument
from pypdf import PdfReader

logger = logging.getLogger(__name__)


class _LCEmbeddingsAdapter:
    """
    Minimal LangChain Embeddings adapter so a raw SentenceTransformer
    model can be passed to SemanticChunker without importing
    langchain-community.
    """
    def __init__(self, st_model):
        self._model = st_model

    def embed_documents(self, texts):
        return self._model.encode(texts, batch_size=32, show_progress_bar=False).tolist()

    def embed_query(self, text):
        return self._model.encode([text], show_progress_bar=False)[0].tolist()


class DocumentProcessor:
    """Service for processing and chunking documents."""
    
    # Constants
    CHUNK_SIZE = 1536  # characters per chunk (≈ 384 tokens, matching PEA pipeline)
    CHUNK_OVERLAP = 256  # characters of overlap (≈ 64 tokens)
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
    SUPPORTED_TYPES = ['pdf', 'docx']

    # Curriculum section keywords for section-aware extraction
    _SECTION_KEYWORDS = frozenset({
        'ilo', 'clo', 'outcome', 'objective', 'competenc',
        'assessment', 'grading', 'evaluation', 'rubric',
        'schedule', 'timetable', 'weekly', 'syllabus',
        'rationale', 'description', 'prerequisite',
        'reference', 'bibliography', 'resource',
        'policy', 'policies', 'conduct', 'attendance',
        'bloom', 'taxonomy', 'obe', 'teaching', 'learning',
    })

    @staticmethod
    def preprocess_text(text: str) -> str:
        """
        Normalize raw extracted text before chunking.

        Cleans whitespace, control characters, and purely decorative lines
        while preserving all content words and academic terminology.
        Does NOT remove stop words from stored text — stop-word filtering
        is applied only at BM25 retrieval time (via _tokenize_for_bm25).
        """
        # Unify line endings
        text = re.sub(r'\r\n|\r', '\n', text)
        # Collapse 3+ blank lines to two (preserve paragraph breaks)
        text = re.sub(r'\n{3,}', '\n\n', text)
        # Collapse in-line runs of spaces/tabs to one space
        text = re.sub(r'[ \t]{2,}', ' ', text)
        # Strip non-printable control characters (keep \n and \t)
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
        # Strip leading/trailing whitespace per line
        lines = [line.strip() for line in text.split('\n')]
        # Drop lines that are purely decorative: only digits, dashes, pipes, dots
        lines = [ln for ln in lines if not re.fullmatch(r'[\s\d\.\-\–\—\|_=~*#]+', ln)]
        # Drop standalone page number lines (e.g., "Page 5", "PAGE 12", "5")
        lines = [ln for ln in lines if not re.fullmatch(r'\s*(page\s+\d+|\d+)\s*', ln, re.IGNORECASE)]
        return '\n'.join(lines).strip()
    
    # Token encoder for Claude
    ENCODER = tiktoken.get_encoding("cl100k_base") if TIKTOKEN_AVAILABLE else None
    
    @staticmethod
    def validate_file(file, file_type):
        """
        Validate uploaded file.
        
        Args:
            file: Django UploadedFile object
            file_type (str): 'pdf' or 'docx'
            
        Returns:
            tuple: (is_valid, error_message)
        """
        if file_type not in DocumentProcessor.SUPPORTED_TYPES:
            return False, f"Unsupported file type: {file_type}"
        
        if file.size > DocumentProcessor.MAX_FILE_SIZE:
            return False, f"File too large. Maximum size: 50MB"
        
        # Validate MIME type
        if file_type == 'pdf':
            if not file.content_type == 'application/pdf':
                return False, "Invalid PDF file"
        elif file_type == 'docx':
            if 'wordprocessingml' not in file.content_type:
                return False, "Invalid DOCX file"
        
        return True, ""
    
    @staticmethod
    def extract_text_from_pdf(file_obj):
        """
        Extract text from PDF file.
        
        Args:
            file_obj: File-like object or BytesIO
            
        Returns:
            list: List of tuples (text, page_number)
        """
        try:
            if isinstance(file_obj, bytes):
                file_obj = BytesIO(file_obj)
            
            reader = PdfReader(file_obj)
            pages = []
            
            for page_num, page in enumerate(reader.pages, 1):
                text = page.extract_text()
                if text.strip():
                    pages.append((text, page_num))
            
            logger.info(f"Extracted text from {len(pages)} PDF pages")
            return pages
            
        except Exception as e:
            logger.error(f"Error extracting PDF text: {str(e)}")
            raise
    
    @staticmethod
    def extract_text_from_docx(file_obj):
        """
        Extract text from DOCX file.
        
        Args:
            file_obj: File-like object or BytesIO
            
        Returns:
            list: List of tuples (text, page_number) - page 1 for DOCX
        """
        try:
            if isinstance(file_obj, bytes):
                file_obj = BytesIO(file_obj)
            
            doc = DocxDocument(file_obj)
            text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
            
            if text.strip():
                logger.info(f"Extracted text from DOCX ({len(text)} characters)")
                return [(text, 1)]
            else:
                logger.warning("DOCX file contains no text")
                return []
                
        except Exception as e:
            logger.error(f"Error extracting DOCX text: {str(e)}")
            raise

    @staticmethod
    def extract_text_from_pdf_structured(file_obj):
        """
        Extract text from PDF using PyMuPDF, grouping content into sections
        delimited by structural headers detected via font size / bold flag.

        Strategy:
          Pass 1 – collect all span font sizes; compute the median (body size).
          Pass 2 – walk every line; a line whose largest span is ≥15% above the
                   median body size, OR is bold and at least body-sized and short
                   (<120 chars), is treated as a section header.  Each header
                   starts a new parent section.

        Returns:
            list of dicts: [{"header": str, "content": str, "page_number": int}]
            Returns [] on error so the caller falls back to pypdf extraction.
        """
        try:
            if isinstance(file_obj, bytes):
                data = file_obj
            else:
                file_obj.seek(0)
                data = file_obj.read()
            doc = fitz.open(stream=data, filetype="pdf")

            # ── Pass 1: collect all font sizes to find the median body size ───
            all_sizes = []
            pages_data = []
            for page_num, page in enumerate(doc, 1):
                blocks = page.get_text("dict")["blocks"]
                pages_data.append((page_num, blocks))
                for block in blocks:
                    if block.get("type") != 0:
                        continue
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            if span.get("text", "").strip():
                                all_sizes.append(span["size"])

            if not all_sizes:
                doc.close()
                return []

            all_sizes.sort()
            body_size = all_sizes[len(all_sizes) // 2]   # median font size
            heading_threshold = body_size * 1.15          # ≥15% larger = heading

            # ── Pass 2: group lines into header-delimited sections ────────────
            sections = []
            current_header = ""
            current_lines = []
            current_page = 1

            def _flush():
                content = (
                    (current_header + "\n" if current_header else "")
                    + "\n".join(current_lines)
                ).strip()
                if content:
                    sections.append({
                        "header": current_header,
                        "content": content,
                        "page_number": current_page,
                    })

            for page_num, blocks in pages_data:
                for block in blocks:
                    if block.get("type") != 0:
                        continue
                    for line in block.get("lines", []):
                        spans = line.get("spans", [])
                        line_text = "".join(s["text"] for s in spans).strip()
                        if not line_text:
                            continue

                        max_size = max((s["size"] for s in spans), default=0)
                        is_bold = any(s.get("flags", 0) & (1 << 4) for s in spans)
                        # Heading: font notably larger than body, OR bold + body-sized
                        # and short enough to be a title line (< 120 chars).
                        is_heading = (
                            max_size >= heading_threshold
                            or (is_bold and max_size >= body_size and len(line_text) < 120)
                        )

                        if is_heading:
                            _flush()
                            current_header = line_text
                            current_lines = []
                            current_page = page_num
                        else:
                            current_lines.append(line_text)

            _flush()  # persist the last open section
            doc.close()

            logger.info(
                "[PyMuPDF] Extracted %d header-delimited sections from PDF",
                len(sections),
            )
            return sections

        except Exception as exc:
            logger.warning(
                "[PyMuPDF] Structured extraction failed (%s) – caller will use pypdf fallback",
                exc,
            )
            return []

    @staticmethod
    def extract_text(file_obj, file_type):
        """
        Extract text from file based on type.
        
        Args:
            file_obj: File-like object
            file_type (str): 'pdf' or 'docx'
            
        Returns:
            list: List of tuples (text, page_number)
        """
        if file_type == 'pdf':
            return DocumentProcessor.extract_text_from_pdf(file_obj)
        elif file_type == 'docx':
            return DocumentProcessor.extract_text_from_docx(file_obj)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")
    
    @staticmethod
    def chunk_text(text, chunk_size=None, overlap=None, embedder=None):
        """
        Split text into chunks.

        Strategy (in priority order):
        1. SemanticChunker – uses embedding distance to find natural topic
           boundaries.  Requires an embedder (SentenceTransformer instance)
           and langchain-experimental to be installed.
        2. RecursiveCharacterTextSplitter – splits on paragraph/sentence/word
           boundaries, falling back through separators.
        3. Simple sliding-window – character-level fallback.
        """
        chunk_size = chunk_size or DocumentProcessor.CHUNK_SIZE
        overlap = overlap or DocumentProcessor.CHUNK_OVERLAP

        if SEMANTIC_CHUNKER_AVAILABLE and embedder is not None:
            try:
                lc_embedder = _LCEmbeddingsAdapter(embedder)
                splitter = SemanticChunker(
                    embeddings=lc_embedder,
                    breakpoint_threshold_type="percentile",  # split where distance > 95th pct
                    breakpoint_threshold_amount=95,
                )
                chunks = splitter.split_text(text)
                logger.info(f"[SemanticChunker] Created {len(chunks)} semantically coherent chunks")
                return chunks
            except Exception as exc:
                logger.warning(f"[SemanticChunker] Fell back to RecursiveCharacterTextSplitter: {exc}")

        if LANGCHAIN_SPLITTER_AVAILABLE:
            splitter = RecursiveCharacterTextSplitter(
                chunk_size=chunk_size,
                chunk_overlap=overlap,
                separators=["\n\n", "\n", ". ", "! ", "? ", ", ", " ", ""],
                length_function=len,
                is_separator_regex=False,
            )
            chunks = splitter.split_text(text)
            logger.info(f"[RecursiveCharacterTextSplitter] Created {len(chunks)} chunks from text")
            return chunks

        # Fallback: simple sliding-window
        chunks = []
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunks.append(text[start:end])
            start = end - overlap
        logger.info(f"[fallback splitter] Created {len(chunks)} chunks from text")
        return chunks
    
    @staticmethod
    def count_tokens(text):
        """
        Count tokens in text using Claude's tokenizer.
        
        Args:
            text (str): Text to count tokens for
            
        Returns:
            int: Number of tokens
        """
        if not DocumentProcessor.ENCODER:
            return len(text) // 4

        try:
            tokens = DocumentProcessor.ENCODER.encode(text)
            return len(tokens)
        except Exception as e:
            logger.error(f"Error counting tokens: {str(e)}")
            # Fallback estimation: ~1 token per 4 characters
            return len(text) // 4
    
    @staticmethod
    def compute_content_hash(text):
        """
        Compute SHA256 hash of content.
        
        Args:
            text (str): Text to hash
            
        Returns:
            str: Hex digest of hash
        """
        return hashlib.sha256(text.encode()).hexdigest()
    
    @staticmethod
    def process_file(file_obj, file_type, file_name, embedder=None):
        """
        Process file and return chunks with metadata.

        Args:
            file_obj:  File-like object
            file_type: 'pdf' or 'docx'
            file_name: Original file name
            embedder:  Optional SentenceTransformer instance.  When supplied,
                       SemanticChunker is used instead of the character splitter.

        Returns:
            list: List of segment dicts with content, page, tokens, hash
        """
        pages = DocumentProcessor.extract_text(file_obj, file_type)
        
        segments = []
        segment_index = 0
        
        for page_text, page_num in pages:
            # Preprocess text before chunking (normalize whitespace, strip garbage lines)
            page_text = DocumentProcessor.preprocess_text(page_text)
            # Chunk the page, passing embedder so SemanticChunker can be used
            chunks = DocumentProcessor.chunk_text(page_text, embedder=embedder)
            
            for chunk in chunks:
                if chunk.strip():  # Skip empty chunks
                    token_count = DocumentProcessor.count_tokens(chunk)
                    content_hash = DocumentProcessor.compute_content_hash(chunk)
                    
                    segments.append({
                        'segment_index': segment_index,
                        'content': chunk,
                        'page_number': page_num if file_type == 'pdf' else None,
                        'character_count': len(chunk),
                        'token_count': token_count,
                        'content_hash': content_hash
                    })
                    
                    segment_index += 1
        
        logger.info(
            f"[ATLAS RAG] Successfully chunked and embedded {len(segments)} segments "
            f"from {file_name} → D11:RAG Documents | rag_status: processing"
        )
        
        return segments

    @staticmethod
    def process_file_hierarchical(file_obj, file_type, file_name):
        """
        Two-pass hierarchical (Parent-Child) chunking.

        Pass 1 – PARENT chunks: ~1 200 tokens / ~4 800 characters.
            Large, coherent sections that give the LLM full context.
            No embedding is stored for parents.

        Pass 2 – CHILD chunks (per parent): ~200 tokens / ~800 characters
            with 200-char overlap.  These are embedded and searched during
            vector retrieval; the matching parent is then fetched for the LLM.

        Returns:
            dict:
                {
                    "parents": [
                        {
                            "content":     str,
                            "page_number": int | None,
                            "token_count": int,
                            "children": [
                                {
                                    "content":     str,
                                    "page_number": int | None,
                                    "token_count": int,
                                },
                                ...
                            ]
                        },
                        ...
                    ]
                }
        """
        # ── Character budgets (~4 chars / token for English prose) ─────────
        PARENT_CHUNK_CHARS = 4_800   # ≈ 1 200 tokens — full context for LLM
        PARENT_OVERLAP_CHARS = 400
        CHILD_CHUNK_CHARS = 1_536    # ≈ 384 tokens — matches PEA retrieval chunk size
        CHILD_OVERLAP_CHARS = 256    # ≈ 64 tokens overlap

        if LANGCHAIN_SPLITTER_AVAILABLE:
            parent_splitter = RecursiveCharacterTextSplitter(
                chunk_size=PARENT_CHUNK_CHARS,
                chunk_overlap=PARENT_OVERLAP_CHARS,
                separators=["\n\n\n", "\n\n", "\n", ". ", " ", ""],
                length_function=len,
                is_separator_regex=False,
            )
            child_splitter = RecursiveCharacterTextSplitter(
                chunk_size=CHILD_CHUNK_CHARS,
                chunk_overlap=CHILD_OVERLAP_CHARS,
                separators=["\n\n", "\n", ". ", "! ", "? ", " ", ""],
                length_function=len,
                is_separator_regex=False,
            )
        else:
            parent_splitter = None
            child_splitter = None

        def _split(text, size, overlap, splitter):
            if splitter:
                return splitter.split_text(text)
            # Character sliding-window fallback
            chunks, start = [], 0
            while start < len(text):
                chunks.append(text[start: start + size])
                start += size - overlap
            return chunks

        # ── Source sections ──────────────────────────────────────────────────
        # PDFs: prefer PyMuPDF header-aware extraction so each parent chunk
        # corresponds to a real document section (e.g. a CHED handbook chapter).
        # Fallback 1: PyMuPDF returned nothing → pypdf page-by-page text.
        # Non-PDF (DOCX): pypdf path not applicable; use standard extraction.
        if file_type == "pdf" and PYMUPDF_AVAILABLE:
            raw_sections = DocumentProcessor.extract_text_from_pdf_structured(file_obj)
            if not raw_sections:
                # Structured extraction found no sections – seek back and use pypdf.
                if hasattr(file_obj, "seek"):
                    file_obj.seek(0)
                raw_sections = [
                    {"content": text, "page_number": page_num}
                    for text, page_num in DocumentProcessor.extract_text(file_obj, file_type)
                ]
        else:
            raw_sections = [
                {
                    "content": text,
                    "page_number": page_num if file_type == "pdf" else None,
                }
                for text, page_num in DocumentProcessor.extract_text(file_obj, file_type)
            ]

        parents = []
        for section in raw_sections:
            # Preprocess text: normalize whitespace, strip decorative lines
            section_text = DocumentProcessor.preprocess_text(section.get("content", ""))
            section_page = section.get("page_number")
            if not section_text.strip():
                continue

            # Keep header-delimited sections whole when they fit within the
            # parent budget; only sub-split oversized sections.
            if len(section_text) <= PARENT_CHUNK_CHARS:
                candidate_parents = [section_text]
            else:
                candidate_parents = _split(
                    section_text, PARENT_CHUNK_CHARS, PARENT_OVERLAP_CHARS, parent_splitter
                )

            for parent_text in candidate_parents:
                if not parent_text.strip():
                    continue

                children = []
                for child_text in _split(
                    parent_text, CHILD_CHUNK_CHARS, CHILD_OVERLAP_CHARS, child_splitter
                ):
                    if child_text.strip():
                        children.append(
                            {
                                "content": child_text,
                                "page_number": section_page,
                                "token_count": DocumentProcessor.count_tokens(child_text),
                            }
                        )

                if children:
                    parents.append(
                        {
                            "content": parent_text,
                            "page_number": section_page,
                            "token_count": DocumentProcessor.count_tokens(parent_text),
                            "children": children,
                        }
                    )

        total_children = sum(len(p["children"]) for p in parents)
        logger.info(
            "[ATLAS RAG] Hierarchical chunking: %d parents, %d children from %s",
            len(parents),
            total_children,
            file_name,
        )
        return {"parents": parents}
