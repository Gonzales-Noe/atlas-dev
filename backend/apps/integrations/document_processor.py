import logging
import hashlib
import os
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
    CHUNK_SIZE = 1000  # characters per chunk
    CHUNK_OVERLAP = 200  # characters of overlap between chunks
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
    SUPPORTED_TYPES = ['pdf', 'docx']
    
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
