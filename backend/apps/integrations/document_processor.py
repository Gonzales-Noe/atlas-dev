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
    import pymupdf  # PyMuPDF – header-aware PDF extraction
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False
    pymupdf = None

try:
    from liteparse import LiteParse  # PDFium-based PDF → Markdown (tables + headings)
    LITEPARSE_AVAILABLE = True
except ImportError:
    LITEPARSE_AVAILABLE = False
    LiteParse = None

from docx import Document as DocxDocument
from docx.table import Table as DocxTable
from docx.text.paragraph import Paragraph as DocxParagraph
from pypdf import PdfReader

_MD_HEADING_RE = re.compile(r'^(#{1,6})\s+(.*\S)\s*$')

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


_UPLOAD_SIGNATURES = {
    'pdf': (b'%PDF',),
    'docx': (b'PK\x03\x04', b'PK\x05\x06', b'PK\x07\x08'),
    'xlsx': (b'PK\x03\x04', b'PK\x05\x06', b'PK\x07\x08'),
    'xls': (b'\xd0\xcf\x11\xe0',),
    'png': (b'\x89PNG\r\n\x1a\n',),
    'jpg': (b'\xff\xd8\xff',),
    'jpeg': (b'\xff\xd8\xff',),
    'zip': (b'PK\x03\x04', b'PK\x05\x06', b'PK\x07\x08'),
}


def _read_upload_head(file_obj, size=16):
    position = file_obj.tell() if hasattr(file_obj, 'tell') else None
    head = file_obj.read(size) or b''
    if hasattr(file_obj, 'seek'):
        file_obj.seek(0 if position is None else position)
    return head


def upload_type_error(file_obj, file_type):
    """Return an error string when the bytes do not match the declared type."""
    kind = (file_type or '').lower().strip().lstrip('.')
    if not kind:
        return 'Unsupported file type.'
    size = getattr(file_obj, 'size', 0) or 0
    if size > 50 * 1024 * 1024:
        return 'File too large. Maximum size: 50MB'
    if kind == 'txt':
        if b'\x00' in _read_upload_head(file_obj, 512):
            return 'The file contents are not plain text.'
        return ''
    signatures = _UPLOAD_SIGNATURES.get(kind)
    if not signatures:
        return f'Unsupported file type: {kind}'
    head = _read_upload_head(file_obj, 16)
    if not any(head.startswith(signature) for signature in signatures):
        return f'The file contents do not match a {kind.upper()} document.'
    return ''


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
        while preserving academic terminology. Then masks PII (emails, PH
        mobiles, signature blocks, labeled personal names) so redacted text
        is what gets chunked, embedded, and later sent to LLMs.
        Does NOT remove stop words from stored text — stop-word filtering
        is applied only at BM25 retrieval time (via _tokenize_for_bm25).
        """
        from .pii_masking import mask_and_verify

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
        # Drop lines that are purely decorative: only digits, dashes, pipes, dots.
        # Markdown table rows (including |---| separators) start with a pipe and are kept.
        lines = [
            ln for ln in lines
            if ln.startswith('|') or not re.fullmatch(r'[\s\d\.\-\–\—\|_=~*#]+', ln)
        ]
        # Drop standalone page number lines (e.g., "Page 5", "PAGE 12", "5")
        lines = [ln for ln in lines if not re.fullmatch(r'\s*(page\s+\d+|\d+)\s*', ln, re.IGNORECASE)]
        cleaned = '\n'.join(lines).strip()
        # Mask PII before any chunking / embedding / LLM context.
        return mask_and_verify(cleaned, context="preprocess")
    
    # Approximate token counter used for chunk sizing
    ENCODER = tiktoken.get_encoding("cl100k_base") if TIKTOKEN_AVAILABLE else None
    
    @staticmethod
    def validate_file(file, file_type):
        """
        Validate an upload by size and file signature, not the browser MIME type.
        """
        message = upload_type_error(file, file_type)
        if message:
            return False, message
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
            doc = pymupdf.open(stream=data, filetype="pdf")

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
    def extract_markdown_from_pdf(file_obj):
        """
        Convert a PDF to Markdown with LiteParse (PDFium spatial parsing).

        Keeps tables as Markdown tables and section titles as # headings,
        without OCR or neural layout models, so a typical syllabus parses in
        well under a second.

        Returns:
            list: List of tuples (markdown_text, page_number)
        """
        if isinstance(file_obj, bytes):
            data = file_obj
        else:
            file_obj.seek(0)
            data = file_obj.read()

        # On Windows, loading the torch/pyarrow DLLs after PDFium has parsed a
        # document crashes the process, so the embedding stack must load first.
        try:
            import sentence_transformers  # noqa: F401
        except ImportError:
            pass

        parser = LiteParse(ocr_enabled=False, output_format="markdown", quiet=True)
        try:
            result = parser.parse(data)
        finally:
            parser.close()

        pages = [
            (page.markdown, page.page_num)
            for page in result.pages
            if page.markdown and page.markdown.strip()
        ]
        logger.info("[LiteParse] Converted %d PDF pages to Markdown", len(pages))
        return pages

    @staticmethod
    def _docx_table_to_markdown(table):
        rows = []
        for row in table.rows:
            try:
                cells = row.cells
            except Exception:
                continue
            rows.append([
                " ".join(cell.text.split()).replace("|", "\\|") for cell in cells
            ])
        rows = [r for r in rows if any(r)]
        if not rows:
            return ""

        width = max(len(r) for r in rows)
        rows = [r + [""] * (width - len(r)) for r in rows]
        lines = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * width]
        lines += ["| " + " | ".join(r) + " |" for r in rows[1:]]
        return "\n".join(lines)

    @staticmethod
    def extract_markdown_from_docx(file_obj):
        """
        Convert a DOCX to Markdown in document order: Heading/Title styles
        become # headings and tables become Markdown tables.

        Returns:
            list: [(markdown_text, None)] or [] when the document is empty
        """
        if isinstance(file_obj, bytes):
            file_obj = BytesIO(file_obj)
        else:
            file_obj.seek(0)
        doc = DocxDocument(file_obj)

        blocks = []
        for child in doc.element.body.iterchildren():
            tag = child.tag.rsplit("}", 1)[-1]
            if tag == "p":
                paragraph = DocxParagraph(child, doc)
                text = paragraph.text.strip()
                if not text:
                    continue
                try:
                    style = paragraph.style.name or ""
                except Exception:
                    style = ""
                level = re.match(r"Heading (\d)", style)
                if level:
                    blocks.append("#" * min(int(level.group(1)), 6) + " " + text)
                elif style == "Title":
                    blocks.append("# " + text)
                else:
                    blocks.append(text)
            elif tag == "tbl":
                table_md = DocumentProcessor._docx_table_to_markdown(DocxTable(child, doc))
                if table_md:
                    blocks.append(table_md)

        markdown = "\n\n".join(blocks)
        return [(markdown, None)] if markdown.strip() else []

    @staticmethod
    def _markdown_sections(pages):
        """
        Split Markdown pages into heading-delimited sections.

        Args:
            pages: list of (markdown_text, page_number)

        Returns:
            list of dicts: [{"content": str, "page_number": int | None}]
        """
        sections = []
        current_lines = []
        current_page = None

        def _flush():
            content = DocumentProcessor.preprocess_text("\n".join(current_lines))
            if content:
                sections.append({"content": content, "page_number": current_page})

        for text, page_num in pages:
            for line in text.split("\n"):
                heading = _MD_HEADING_RE.match(line.strip())
                if heading and re.search(r"\w", heading.group(2)):
                    _flush()
                    current_lines = [line.strip()]
                    current_page = page_num
                else:
                    if not current_lines:
                        current_page = page_num
                    current_lines.append(line)
        _flush()
        return sections

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
        Count tokens in text (approximate, cl100k_base).
        
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
    def _extract_sections(file_obj, file_type):
        """
        Return heading-delimited Markdown sections for chunking.

        PDF fallback order: LiteParse Markdown → PyMuPDF font-based headers
        → pypdf page text.
        """
        if file_type == "docx":
            return DocumentProcessor._markdown_sections(
                DocumentProcessor.extract_markdown_from_docx(file_obj)
            )

        if LITEPARSE_AVAILABLE:
            try:
                pages = DocumentProcessor.extract_markdown_from_pdf(file_obj)
                if pages:
                    return DocumentProcessor._markdown_sections(pages)
                logger.warning("[LiteParse] No text found – falling back to PyMuPDF")
            except Exception as exc:
                logger.warning("[LiteParse] Failed (%s) – falling back to PyMuPDF", exc)

        raw_sections = []
        if PYMUPDF_AVAILABLE:
            raw_sections = [
                {
                    "content": ("## " + s["content"]) if s.get("header") else s["content"],
                    "page_number": s.get("page_number"),
                }
                for s in DocumentProcessor.extract_text_from_pdf_structured(file_obj)
            ]
        if not raw_sections:
            if hasattr(file_obj, "seek"):
                file_obj.seek(0)
            raw_sections = [
                {"content": text, "page_number": page_num}
                for text, page_num in DocumentProcessor.extract_text(file_obj, file_type)
            ]

        sections = []
        for section in raw_sections:
            content = DocumentProcessor.preprocess_text(section["content"])
            if content:
                sections.append({"content": content, "page_number": section["page_number"]})
        return sections

    @staticmethod
    def process_file_hierarchical(file_obj, file_type, file_name):
        """
        Two-pass hierarchical (Parent-Child) chunking over Markdown.

        Source – the file is converted to Markdown (LiteParse for PDFs,
            python-docx for DOCX) and split on # headings, so tables and
            section titles survive intact.

        Pass 1 – PARENT chunks: up to ~1 200 tokens / ~4 800 characters.
            Consecutive heading sections are packed together until the budget
            is reached; only a single oversized section is sub-split.
            No embedding is stored for parents.

        Pass 2 – CHILD chunks (per parent): ~384 tokens / ~1 536 characters
            with 256-char overlap, each prefixed with the nearest preceding
            heading.  These are embedded and searched during vector
            retrieval; the matching parent is then fetched for the LLM.

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

        sections = DocumentProcessor._extract_sections(file_obj, file_type)

        # ── Pass 1: pack heading sections into parents ───────────────────────
        # Syllabus templates have many tiny sections (one per table label), so
        # sections are merged until the parent budget is reached.
        parent_sources = []  # (text, page_number)
        buffer, buffer_len, buffer_page = [], 0, None

        def _flush_buffer():
            nonlocal buffer, buffer_len, buffer_page
            if buffer:
                parent_sources.append(("\n\n".join(buffer), buffer_page))
            buffer, buffer_len, buffer_page = [], 0, None

        for section in sections:
            text = section["content"]
            page = section.get("page_number")
            if len(text) > PARENT_CHUNK_CHARS:
                _flush_buffer()
                for piece in _split(text, PARENT_CHUNK_CHARS, PARENT_OVERLAP_CHARS, parent_splitter):
                    if piece.strip():
                        parent_sources.append((piece, page))
                continue
            if buffer and buffer_len + len(text) + 2 > PARENT_CHUNK_CHARS:
                _flush_buffer()
            if not buffer:
                buffer_page = page
            buffer.append(text)
            buffer_len += len(text) + 2
        _flush_buffer()

        # ── Pass 2: split parents into heading-prefixed children ────────────
        parents = []
        for parent_text, parent_page in parent_sources:
            headings = [
                (m.start(), m.group(0).strip())
                for m in re.finditer(r"^#{1,6}\s+.*\w.*$", parent_text, re.MULTILINE)
            ]

            children = []
            search_from = 0
            for child_text in _split(
                parent_text, CHILD_CHUNK_CHARS, CHILD_OVERLAP_CHARS, child_splitter
            ):
                if not child_text.strip():
                    continue
                start = parent_text.find(child_text, search_from)
                if start == -1:
                    start = search_from
                search_from = start + 1

                preceding = [h for pos, h in headings if pos <= start]
                if preceding and not child_text.lstrip().startswith("#"):
                    child_text = f"{preceding[-1]}\n{child_text}"

                children.append(
                    {
                        "content": child_text,
                        "page_number": parent_page,
                        "token_count": len(child_text) // 4 or 1,
                    }
                )

            if children:
                parents.append(
                    {
                        "content": parent_text,
                        "page_number": parent_page,
                        "token_count": len(parent_text) // 4 or 1,
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
