"""
End-to-end syllabus template analysis: Docling tree → structure → style.

Parser-first. LLM refine optional and off by default.
"""

from __future__ import annotations

import logging
import os

from . import syllabus_docling, syllabus_parse, syllabus_structure, syllabus_style

logger = logging.getLogger(__name__)


def _parse_refine_flag(raw):
    value = str(raw if raw is not None else 'false').strip().lower()
    if value in {'0', 'false', 'no', 'none', 'off', ''}:
        return False, None
    if value in {'ollama', 'groq', 'openrouter', 'nvidia', 'mistral'}:
        return True, value
    if value in {'1', 'true', 'yes', 'on', 'auto'}:
        provider = (os.environ.get('SYLLABUS_REFINE_PROVIDER') or 'ollama').strip().lower()
        return True, provider or 'ollama'
    return False, None


def _annotate_section_confidence(sections, parser):
    annotated = []
    for section in sections or []:
        item = dict(section)
        # Prefer outline-shaped fields; fall back to final section dict.
        probe = {
            'label': item.get('label'),
            'subsections': item.get('subsections') or [],
            'table_columns': item.get('table_columns') or [],
            'table_enabled': item.get('table_enabled'),
            'is_static': item.get('is_static'),
            'static_content': item.get('static_content'),
            'body': item.get('static_content') or '',
            'key': item.get('key'),
        }
        item['confidence'] = syllabus_docling.section_confidence(probe, parser=parser)
        annotated.append(item)
    return annotated


def analyze_syllabus_template(file_obj, file_type, refine='false', llm=None):
    """
    Returns analyze API payload including per-section confidence.
    """
    if hasattr(file_obj, 'seek'):
        file_obj.seek(0)
    parsed = syllabus_parse.parse_upload(file_obj, file_type)
    parser = parsed['parser']
    markdown = parsed['markdown']
    document = parsed.get('document')

    outline = None
    structure_source = 'outline'
    if parser == 'docling' and document is not None:
        try:
            outline = syllabus_docling.build_outline_from_docling(document)
            structure_source = 'docling_tree'
            logger.info('Built syllabus outline from Docling tree (%d sections)', len(outline))
        except Exception:
            logger.exception('Docling tree outline failed; falling back to Markdown outline')
            outline = None
            structure_source = 'outline'

    if hasattr(file_obj, 'seek'):
        file_obj.seek(0)
    style_profile = syllabus_style.extract_style_profile(file_obj, file_type)
    style_profile = {
        **style_profile,
        'source': {
            **(style_profile.get('source') or {}),
            'structure_parser': parser,
            'structure_source': structure_source,
        },
    }

    do_refine, preferred = _parse_refine_flag(refine)
    llm_provider = 'none'
    if do_refine:
        from .llm_service import LLMService
        service = llm or LLMService()
        try:
            sections, source = syllabus_structure.extract_syllabus_structure(
                markdown,
                refine=True,
                llm=service,
                preferred_provider=preferred or 'ollama',
                outline=outline,
            )
            llm_provider = (preferred or 'ollama') if source == 'ai' else 'none'
        except Exception:
            logger.exception('Syllabus refine crashed; using outline')
            sections, source = syllabus_structure.extract_syllabus_structure(
                markdown, refine=False, outline=outline,
            )
            llm_provider = 'none'
    else:
        sections, source = syllabus_structure.extract_syllabus_structure(
            markdown, refine=False, outline=outline,
        )

    if structure_source == 'docling_tree' and source == 'outline':
        source = 'docling_tree'

    sections = _annotate_section_confidence(sections, parser)

    branding = syllabus_style.apply_style_to_branding(style_profile)
    stored_style = syllabus_style.compact_style_profile(style_profile)

    confidences = [float(s.get('confidence') or 0) for s in sections]
    structure_confidence = (
        round(sum(confidences) / len(confidences), 2) if confidences else 0.1
    )
    style_confidence = float((style_profile.get('source') or {}).get('confidence') or 0.4)
    table_sections = sum(1 for s in sections if s.get('table_enabled') or any(
        (sub or {}).get('table_enabled') for sub in (s.get('subsections') or [])
    ))

    result = {
        'sections': sections,
        'style_profile': stored_style,
        'source': source,
        'parser': parser,
        'structure_source': structure_source,
        'llm_provider': llm_provider,
        'branding_suggestions': {
            'header_text': branding.get('header_text', ''),
            'footer_text': branding.get('footer_text', ''),
            'header_image_url': branding.get('header_image_url', ''),
            'footer_image_url': branding.get('footer_image_url', ''),
        },
        'confidence': {
            'sections': structure_confidence,
            'style': round(style_confidence, 2),
            'tables': round(0.85 if parser == 'docling' and table_sections else (
                0.75 if parser == 'docling' else 0.55
            ), 2),
        },
    }
    if not sections:
        result['detail'] = 'No section headings were detected. Add the syllabus sections manually.'
    return result
