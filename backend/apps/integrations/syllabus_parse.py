"""
Parse an uploaded syllabus template.

Primary: Docling document tree (layout + tables).
Fallback: LiteParse / python-docx → Markdown.
"""

from __future__ import annotations

import logging
import os
import tempfile

from .document_processor import DocumentProcessor
from .pii_masking import mask_and_verify

logger = logging.getLogger(__name__)


def _docling_available():
    try:
        from docling.document_converter import DocumentConverter  # noqa: F401
        return True
    except ImportError:
        return False


def _convert_with_docling(file_obj, file_type):
    """Return (DoclingDocument, markdown). Raises on failure."""
    from docling.document_converter import DocumentConverter

    if hasattr(file_obj, 'seek'):
        file_obj.seek(0)
    data = file_obj.read() if not isinstance(file_obj, (bytes, bytearray)) else file_obj

    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=f'.{file_type}')
        try:
            os.write(fd, data)
        finally:
            os.close(fd)

        converter = DocumentConverter()
        result = converter.convert(tmp_path)
        document = result.document
        markdown = (document.export_to_markdown() or '').strip()
        if not markdown and not list(document.iterate_items()):
            raise ValueError('Docling returned an empty document.')
        return document, markdown
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
    """
    if file_type not in {'pdf', 'docx'}:
        raise ValueError(f'Unsupported syllabus template type: {file_type}')

    document = None
    parser = 'liteparse'
    raw = ''

    if not _docling_available():
        logger.error(
            'Docling is not installed. Install with: pip install docling==2.142.1',
        )
    else:
        try:
            if hasattr(file_obj, 'seek'):
                file_obj.seek(0)
            document, raw = _convert_with_docling(file_obj, file_type)
            parser = 'docling'
            logger.info('Syllabus template parsed with Docling tree (%s)', file_type)
        except Exception:
            logger.exception('Docling parse failed; using LiteParse/docx fallback')
            document = None
            raw = ''

    if not raw and document is None:
        if hasattr(file_obj, 'seek'):
            file_obj.seek(0)
        raw = _markdown_via_legacy(file_obj, file_type)
        parser = 'liteparse'

    if not raw and document is not None:
        # Tree-only success with empty markdown export — still usable.
        raw = ''

    masked = mask_and_verify(raw or '', context='syllabus_template') if raw else ''
    return {
        'parser': parser,
        'markdown': masked,
        'document': document,
    }


def markdown_from_upload(file_obj, file_type):
    """Backward-compatible: returns (markdown, parser)."""
    parsed = parse_upload(file_obj, file_type)
    return parsed['markdown'], parsed['parser']
