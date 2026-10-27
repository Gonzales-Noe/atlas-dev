"""
Extract a reusable visual style profile from a syllabus template.

DOCX: real styles, page setup, header/footer text (most accurate).
PDF: PyMuPDF heuristics for fonts, colors, repeating header/footer bands.
No LLM required.
"""

from __future__ import annotations

import base64
import logging
import re
from collections import Counter
from io import BytesIO

logger = logging.getLogger(__name__)

DEFAULT_STYLE = {
    'page': {
        'size': 'A4',
        'orientation': 'portrait',
        'margins': {'top': 72, 'right': 54, 'bottom': 72, 'left': 54},
    },
    'typography': {
        'body': {'family': 'Times New Roman', 'size_pt': 11, 'weight': 'normal'},
        'heading_1': {'family': 'Arial', 'size_pt': 14, 'weight': 'bold'},
    },
    'colors': {
        'text': '#111111',
        'accent': '#003366',
        'table_header_bg': '#f0f0f0',
    },
    'header': {'image_url': '', 'text': '', 'height_pt': 60},
    'footer': {'image_url': '', 'text': '', 'height_pt': 40, 'show_page_numbers': True},
    'table': {'border': True, 'header_bold': True},
    'source': {'parser': 'none', 'confidence': 0.0},
}


def _rgb_to_hex(color):
    if color is None:
        return None
    if isinstance(color, int):
        # PyMuPDF: 0xRRGGBB as int sometimes inverted; handle both.
        r = (color >> 16) & 255
        g = (color >> 8) & 255
        b = color & 255
        return f'#{r:02x}{g:02x}{b:02x}'
    if hasattr(color, 'rgb'):
        # python-docx RGBColor
        return f'#{int(color):06x}'
    return None


def _merge_style(base, overrides):
    result = {**base}
    for key, value in (overrides or {}).items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = {**result[key], **value}
        else:
            result[key] = value
    return result


def _docx_style(file_obj):
    from docx import Document
    from docx.oxml.ns import qn

    if hasattr(file_obj, 'seek'):
        file_obj.seek(0)
    doc = Document(file_obj if not isinstance(file_obj, (bytes, bytearray)) else BytesIO(file_obj))

    section = doc.sections[0] if doc.sections else None
    margins = {'top': 72, 'right': 54, 'bottom': 72, 'left': 54}
    page_size = 'A4'
    orientation = 'portrait'
    if section is not None:
        try:
            margins = {
                'top': round(section.top_margin.pt, 1),
                'right': round(section.right_margin.pt, 1),
                'bottom': round(section.bottom_margin.pt, 1),
                'left': round(section.left_margin.pt, 1),
            }
        except Exception:
            pass
        try:
            width_in = section.page_width.inches
            height_in = section.page_height.inches
            orientation = 'landscape' if width_in > height_in else 'portrait'
            # Rough ISO match
            if abs(min(width_in, height_in) - 8.27) < 0.2:
                page_size = 'A4'
            elif abs(min(width_in, height_in) - 8.5) < 0.2:
                page_size = 'Letter'
        except Exception:
            pass

    def style_font(style_name, fallback_family, fallback_size, weight='normal'):
        family, size_pt = fallback_family, fallback_size
        try:
            style = doc.styles[style_name]
            if style.font.name:
                family = style.font.name
            if style.font.size:
                size_pt = round(style.font.size.pt, 1)
            if style.font.bold:
                weight = 'bold'
        except Exception:
            pass
        return {'family': family, 'size_pt': size_pt, 'weight': weight}

    body = style_font('Normal', 'Times New Roman', 11)
    heading = style_font('Heading 1', body['family'], max(body['size_pt'] + 3, 14), 'bold')

    header_text = ''
    footer_text = ''
    try:
        if section is not None:
            header_parts = [p.text.strip() for p in section.header.paragraphs if p.text.strip()]
            footer_parts = [p.text.strip() for p in section.footer.paragraphs if p.text.strip()]
            header_text = ' | '.join(header_parts)[:500]
            footer_text = ' | '.join(footer_parts)[:500]
    except Exception:
        pass

    accent = '#003366'
    try:
        # First non-black run color in the body as accent hint
        for paragraph in doc.paragraphs[:40]:
            for run in paragraph.runs:
                if run.font.color and run.font.color.rgb:
                    hex_color = f'#{int(run.font.color.rgb):06x}'
                    if hex_color.lower() not in {'#000000', '#111111', '#ffffff'}:
                        accent = hex_color
                        raise StopIteration
    except StopIteration:
        pass
    except Exception:
        pass

    # Embedded header images are hard to pull as data-URLs without unpacking;
    # text is still useful and the admin can upload images.
    _ = qn  # keep import used for future oxml work

    profile = _merge_style(DEFAULT_STYLE, {
        'page': {'size': page_size, 'orientation': orientation, 'margins': margins},
        'typography': {'body': body, 'heading_1': heading},
        'colors': {'text': '#111111', 'accent': accent, 'table_header_bg': '#f0f0f0'},
        'header': {'image_url': '', 'text': header_text, 'height_pt': 60},
        'footer': {
            'image_url': '',
            'text': footer_text,
            'height_pt': 40,
            'show_page_numbers': bool(re.search(r'page|PAGE', footer_text)),
        },
        'source': {'parser': 'docx', 'confidence': 0.85},
    })
    return profile


def _pdf_style(file_obj):
    import pymupdf

    if hasattr(file_obj, 'seek'):
        file_obj.seek(0)
    data = file_obj.read() if not isinstance(file_obj, (bytes, bytearray)) else file_obj
    doc = pymupdf.open(stream=data, filetype='pdf')
    try:
        if doc.page_count < 1:
            return _merge_style(DEFAULT_STYLE, {'source': {'parser': 'pdf', 'confidence': 0.2}})

        page0 = doc[0]
        width, height = page0.rect.width, page0.rect.height
        orientation = 'landscape' if width > height else 'portrait'
        page_size = 'A4' if abs(min(width, height) - 595) < 40 else 'Letter'

        font_counter = Counter()
        size_counter = Counter()
        color_counter = Counter()
        for page in doc:
            try:
                blocks = page.get_text('dict').get('blocks', [])
            except Exception:
                continue
            for block in blocks:
                for line in block.get('lines', []):
                    for span in line.get('spans', []):
                        size = round(float(span.get('size') or 0), 1)
                        if size < 6:
                            continue
                        font_counter[span.get('font') or 'Unknown'] += max(1, len(span.get('text') or ''))
                        size_counter[size] += max(1, len(span.get('text') or ''))
                        color = _rgb_to_hex(span.get('color'))
                        if color:
                            color_counter[color] += 1

        body_font = font_counter.most_common(1)[0][0] if font_counter else 'Times New Roman'
        body_size = size_counter.most_common(1)[0][0] if size_counter else 11
        heading_size = max(size_counter) if size_counter else body_size + 3
        heading_font = body_font
        # Prefer a different font for the largest size if present
        for font, _count in font_counter.most_common():
            if font != body_font:
                heading_font = font
                break

        text_color = '#111111'
        accent = '#003366'
        for color, _count in color_counter.most_common():
            if color.lower() in {'#000000', '#111111', '#ffffff', '#010101'}:
                if color.lower() not in {'#ffffff'}:
                    text_color = color
                continue
            accent = color
            break

        # Repeating header/footer text: top/bottom 12% of first pages
        def band_text(page, y0, y1):
            clip = pymupdf.Rect(0, y0, page.rect.width, y1)
            return ' '.join((page.get_text('text', clip=clip) or '').split())

        header_candidates = []
        footer_candidates = []
        sample_pages = min(doc.page_count, 3)
        for i in range(sample_pages):
            page = doc[i]
            h = page.rect.height
            header_candidates.append(band_text(page, 0, h * 0.12))
            footer_candidates.append(band_text(page, h * 0.88, h))

        def consensus(parts):
            parts = [p for p in parts if p and len(p) >= 3]
            if not parts:
                return ''
            counts = Counter(parts)
            text, n = counts.most_common(1)[0]
            return text[:500] if n >= max(1, len(parts) // 2) else parts[0][:500]

        header_text = consensus(header_candidates)
        footer_text = consensus(footer_candidates)

        # Crop top/bottom bands of page 1 as optional header/footer images.
        # Keep DPI low so small syllabus PDFs stay fast.
        header_image = ''
        footer_image = ''
        try:
            h = page0.rect.height
            header_clip = pymupdf.Rect(0, 0, page0.rect.width, min(h * 0.14, 120))
            footer_clip = pymupdf.Rect(0, max(h * 0.86, h - 100), page0.rect.width, h)
            header_pix = page0.get_pixmap(clip=header_clip, dpi=72)
            footer_pix = page0.get_pixmap(clip=footer_clip, dpi=72)
            header_image = 'data:image/png;base64,' + base64.b64encode(header_pix.tobytes('png')).decode('ascii')
            footer_image = 'data:image/png;base64,' + base64.b64encode(footer_pix.tobytes('png')).decode('ascii')
            # Drop nearly-blank or oversized crops (avoid multi-MB payloads)
            if len(header_image) < 800 or len(header_image) > 400_000:
                header_image = ''
            if len(footer_image) < 800 or len(footer_image) > 400_000:
                footer_image = ''
        except Exception:
            logger.debug('Could not crop PDF header/footer bands', exc_info=True)

        # Approximate margins from content bbox on first page
        margins = {'top': 72, 'right': 54, 'bottom': 72, 'left': 54}
        try:
            blocks = page0.get_text('blocks')
            content = [b for b in blocks if len(b) >= 5 and str(b[4]).strip()]
            if content:
                left = min(b[0] for b in content)
                top = min(b[1] for b in content)
                right = max(b[2] for b in content)
                bottom = max(b[3] for b in content)
                margins = {
                    'top': round(max(36, top), 1),
                    'right': round(max(36, width - right), 1),
                    'bottom': round(max(36, height - bottom), 1),
                    'left': round(max(36, left), 1),
                }
        except Exception:
            pass

        confidence = 0.55 + (0.15 if header_text or header_image else 0) + (0.1 if font_counter else 0)
        return _merge_style(DEFAULT_STYLE, {
            'page': {'size': page_size, 'orientation': orientation, 'margins': margins},
            'typography': {
                'body': {'family': body_font, 'size_pt': body_size, 'weight': 'normal'},
                'heading_1': {'family': heading_font, 'size_pt': heading_size, 'weight': 'bold'},
            },
            'colors': {'text': text_color, 'accent': accent, 'table_header_bg': '#f0f0f0'},
            'header': {'image_url': header_image, 'text': header_text, 'height_pt': 60},
            'footer': {
                'image_url': footer_image,
                'text': footer_text,
                'height_pt': 40,
                'show_page_numbers': bool(re.search(r'\d+\s*/\s*\d+|page\s+\d+', footer_text, re.I)),
            },
            'source': {'parser': 'pdf', 'confidence': min(0.9, confidence)},
        })
    finally:
        doc.close()


def extract_style_profile(file_obj, file_type):
    """
    Returns a syllabus_style_profile dict. Always succeeds with defaults on failure.
    """
    try:
        if file_type == 'docx':
            return _docx_style(file_obj)
        if file_type == 'pdf':
            return _pdf_style(file_obj)
    except Exception:
        logger.exception('Style extraction failed for %s', file_type)
    return _merge_style(DEFAULT_STYLE, {'source': {'parser': file_type or 'none', 'confidence': 0.1}})


def apply_style_to_branding(style_profile, customization_fields=None):
    """
    Derive header/footer text and image suggestions from the style profile.
    Does not overwrite existing non-empty customization unless empty.
    """
    fields = dict(customization_fields or {})
    header = (style_profile or {}).get('header') or {}
    footer = (style_profile or {}).get('footer') or {}
    if not fields.get('header_text') and header.get('text'):
        fields['header_text'] = str(header['text'])[:500]
    if not fields.get('footer_text') and footer.get('text'):
        fields['footer_text'] = str(footer['text'])[:500]
    if not fields.get('header_image_url') and header.get('image_url'):
        fields['header_image_url'] = header['image_url']
    if not fields.get('footer_image_url') and footer.get('image_url'):
        fields['footer_image_url'] = footer['image_url']
    return fields


def compact_style_profile(style_profile):
    """Drop large data-URL crops from the stored JSON (kept in header/footer fields)."""
    if not isinstance(style_profile, dict):
        return {}
    profile = {**style_profile}
    for band in ('header', 'footer'):
        block = dict(profile.get(band) or {})
        url = str(block.get('image_url') or '')
        if url.startswith('data:'):
            block['image_url'] = ''
            block['image_extracted'] = True
        profile[band] = block
    return profile
