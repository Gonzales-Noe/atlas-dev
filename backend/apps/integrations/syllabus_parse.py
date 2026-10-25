"""
Parse an uploaded syllabus template.

Strategy (KVM2-friendly):
  1. Always build a fast LiteParse/DOCX baseline (seconds).
  2. Optionally try Docling with OCR off + hard timeout; on success use the tree.
  3. Never leave the request hanging — timeout → keep LiteParse result.
"""

from __future__ import annotations

import logging
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeout

from .document_processor import DocumentProcessor
from .pii_masking import mask_and_verify

logger = logging.getLogger(__name__)

# Soft ceiling so admin UI does not spin forever on small PDFs.
_DOCLING_TIMEOUT_SEC = int(os.environ.get('SYLLABUS_DOCLING_TIMEOUT', '35'))


def _docling_available():
    try:
        from docling.document_converter import DocumentConverter  # noqa: F401
        return True
    except ImportError:
        return False


def _parser_mode():
    """
    auto (default) — try Docling with timeout, else LiteParse
    liteparse       — skip Docling entirely (fastest)
    docling         — require Docling (still timed)
    """
    return (os.environ.get('SYLLABUS_PARSER') or 'auto').strip().lower()


def _convert_with_docling(path, file_type):
    """Convert a file path with a fast Docling PDF pipeline (no OCR)."""
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption

    pdf_options = PdfPipelineOptions()
    pdf_options.do_ocr = False
    pdf_options.do_code_enrichment = False
    pdf_options.do_formula_enrichment = False
    # Keep tables — needed for syllabus structure; still much faster without OCR.
    pdf_options.do_table_structure = True
    if hasattr(pdf_options, 'document_timeout'):
        pdf_options.document_timeout = float(max(5, _DOCLING_TIMEOUT_SEC - 5))
    if hasattr(pdf_options, 'generate_page_images'):
        pdf_options.generate_page_images = False
    if hasattr(pdf_options, 'generate_picture_images'):
        pdf_options.generate_picture_images = False

    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pdf_options),
        }
    )
    result = converter.convert(path)
    document = result.document
    markdown = (document.export_to_markdown() or '').strip()
    try:
        has_items = any(True for _ in document.iterate_items())
    except Exception:
        has_items = False
    if not markdown and not has_items:
        raise ValueError('Docling returned an empty document.')
    return document, markdown


def _docling_with_timeout(data, file_type, timeout_sec):
    """Run Docling in a worker thread; raise TimeoutError on wall-clock limit."""
    fd, tmp_path = tempfile.mkstemp(suffix=f'.{file_type}')
    try:
        try:
            os.write(fd, data)
        finally:
            os.close(fd)

        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(_convert_with_docling, tmp_path, file_type)
            return future.result(timeout=timeout_sec)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def _markdown_via_legacy(file_obj, file_type):
    pages = []
    try:
        if file_type == 'pdf':
            pages = DocumentProcessor.extract_markdown_from_pdf(file_obj)
        elif file_type == 'docx':
            pages = DocumentProcessor.extract_markdown_from_docx(file_obj)
    except Exception:
        logger.exception('Legacy markdown conversion failed; falling back to plain text')
        pages = []
    if not pages:
        if hasattr(file_obj, 'seek'):
            file_obj.seek(0)
        pages = DocumentProcessor.extract_text(file_obj, file_type)
    return '\n\n'.join(text for text, _page in pages)


def parse_upload(file_obj, file_type):
    """
    Returns dict:
      parser: 'docling' | 'liteparse'
      markdown: str (PII-masked)
      document: DoclingDocument | None
      docling_error: optional str when Docling was skipped/failed
    """
    if file_type not in {'pdf', 'docx'}:
        raise ValueError(f'Unsupported syllabus template type: {file_type}')

    if hasattr(file_obj, 'seek'):
        file_obj.seek(0)
    data = file_obj.read() if not isinstance(file_obj, (bytes, bytearray)) else file_obj

    # ── Fast baseline (always) ────────────────────────────────────────────
    from io import BytesIO
    legacy_raw = _markdown_via_legacy(BytesIO(data), file_type)
    document = None
    parser = 'liteparse'
    raw = legacy_raw
    docling_error = None
    mode = _parser_mode()

    use_docling = mode in {'auto', 'docling'} and _docling_available()
    if mode == 'liteparse':
        docling_error = 'skipped (SYLLABUS_PARSER=liteparse)'
    elif mode in {'auto', 'docling'} and not _docling_available():
        docling_error = 'Docling not installed'

    if use_docling:
        try:
            logger.info(
                'Trying Docling for syllabus template (%s), timeout=%ss',
                file_type, _DOCLING_TIMEOUT_SEC,
            )
            document, docling_md = _docling_with_timeout(data, file_type, _DOCLING_TIMEOUT_SEC)
            parser = 'docling'
            raw = docling_md or legacy_raw
            logger.info('Syllabus template parsed with Docling tree (%s)', file_type)
        except FuturesTimeout:
            docling_error = f'Docling timed out after {_DOCLING_TIMEOUT_SEC}s; used LiteParse'
            logger.warning(docling_error)
            document = None
            parser = 'liteparse'
            raw = legacy_raw
        except Exception as exc:
            docling_error = f'Docling failed ({exc}); used LiteParse'
            logger.warning('Docling parse failed; using LiteParse/docx fallback: %s', exc)
            document = None
            parser = 'liteparse'
            raw = legacy_raw

    if not raw and not document:
        raise ValueError('Could not extract any text from the syllabus template.')

    masked = mask_and_verify(raw or '', context='syllabus_template') if raw else ''
    return {
        'parser': parser,
        'markdown': masked,
        'document': document,
        'docling_error': docling_error,
    }


def markdown_from_upload(file_obj, file_type):
    """Backward-compatible: returns (markdown, parser)."""
    parsed = parse_upload(file_obj, file_type)
    return parsed['markdown'], parsed['parser']
