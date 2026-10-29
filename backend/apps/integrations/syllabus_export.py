"""Syllabus export entry points.

Both the faculty DOCX and PDF downloads render the same fixed Course
Information Syllabus (CIS) layout. That layout lives in
``syllabus_standard``; this module keeps the historical function names so
existing callers and tests keep working, and so there is exactly one code
path producing the exported form.
"""

from __future__ import annotations

import logging

from .syllabus_standard import (
    build_standard_syllabus_docx,
    build_standard_syllabus_html,
    build_standard_syllabus_pdf,
)

logger = logging.getLogger(__name__)


def build_syllabus_html(syllabus, branding=None, style_profile=None):
    """Build the standard CIS HTML document for the filled syllabus."""
    return build_standard_syllabus_html(
        syllabus, branding=branding, style_profile=style_profile,
    )


def build_syllabus_docx(syllabus, branding=None):
    """Build the standard CIS DOCX document for the filled syllabus."""
    return build_standard_syllabus_docx(syllabus, branding=branding)


def export_syllabus_pdf(syllabus, branding=None, style_profile=None):
    """
    Returns (pdf_bytes, engine) where engine is 'weasyprint' or 'reportlab'.
    """
    return build_standard_syllabus_pdf(
        syllabus, branding=branding, style_profile=style_profile,
    )
