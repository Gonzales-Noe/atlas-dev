"""
Render a filled syllabus as HTML/CSS using the institution style profile,
then export PDF via WeasyPrint (preferred) or ReportLab fallback.
"""

from __future__ import annotations

import html
import logging
import re
from io import BytesIO
from xml.sax.saxutils import escape

logger = logging.getLogger(__name__)


def _esc(value):
    return html.escape('' if value is None else str(value))


def _pt(value, default):
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _css_from_style(style_profile, branding=None):
    style = style_profile if isinstance(style_profile, dict) else {}
    branding = branding if isinstance(branding, dict) else {}
    page = style.get('page') or {}
    margins = page.get('margins') or {}
    typography = style.get('typography') or {}
    body = typography.get('body') or {}
    heading = typography.get('heading_1') or {}
    colors = style.get('colors') or {}
    table = style.get('table') or {}

    page_size = page.get('size') or 'A4'
    orientation = page.get('orientation') or 'portrait'
    size_token = f'{page_size} {"landscape" if orientation == "landscape" else ""}'.strip()

    return f"""
@page {{
  size: {size_token};
  margin: {_pt(margins.get('top'), 72)}pt {_pt(margins.get('right'), 54)}pt
          {_pt(margins.get('bottom'), 72)}pt {_pt(margins.get('left'), 54)}pt;
}}
body {{
  font-family: "{_esc(body.get('family') or 'Times New Roman')}", serif;
  font-size: {_pt(body.get('size_pt'), 11)}pt;
  color: {colors.get('text') or '#111111'};
  line-height: 1.35;
}}
h1 {{
  font-family: "{_esc(heading.get('family') or body.get('family') or 'Arial')}", sans-serif;
  font-size: {_pt(heading.get('size_pt'), 14)}pt;
  font-weight: {heading.get('weight') or 'bold'};
  color: {colors.get('accent') or '#003366'};
  margin: 1.1em 0 0.4em;
  border-bottom: 1px solid {colors.get('accent') or '#003366'};
  padding-bottom: 0.15em;
}}
h2 {{
  font-size: {_pt(body.get('size_pt'), 11) + 1}pt;
  color: {colors.get('accent') or '#003366'};
  margin: 0.9em 0 0.3em;
}}
.header, .footer {{
  text-align: center;
  margin-bottom: 1em;
}}
.header img, .footer img {{
  max-height: 70pt;
  max-width: 100%;
}}
.header-text, .footer-text {{
  font-size: 9pt;
  color: #444;
  white-space: pre-wrap;
}}
.doc-title {{
  text-align: center;
  font-size: {_pt(heading.get('size_pt'), 14)}pt;
  font-weight: bold;
  color: {colors.get('accent') or '#003366'};
  margin: 0.6em 0 1em;
}}
table {{
  width: 100%;
  border-collapse: collapse;
  margin: 0.4em 0 0.8em;
  font-size: {_pt(body.get('size_pt'), 11) - 0.5}pt;
}}
th, td {{
  border: {'1px solid #333' if table.get('border', True) else 'none'};
  padding: 4pt 6pt;
  vertical-align: top;
}}
th {{
  background: {colors.get('table_header_bg') or '#f0f0f0'};
  font-weight: {'bold' if table.get('header_bold', True) else 'normal'};
  text-align: left;
}}
.kv td:first-child {{
  font-weight: bold;
  width: 32%;
}}
.meta {{
  text-align: center;
  font-size: 10pt;
  margin: 0.15em 0;
}}
p {{ margin: 0.25em 0 0.5em; }}
""".strip()


def _img_tag(url, alt):
    if not url:
        return ''
    return f'<img src="{_esc(url)}" alt="{_esc(alt)}" />'


def _plain(value):
    if value is None:
        return ''
    if isinstance(value, bool):
        return 'Yes' if value else 'No'
    if isinstance(value, (list, tuple)):
        if all(not isinstance(x, (dict, list)) for x in value):
            return '\n'.join(str(x) for x in value if x is not None)
        return '\n'.join(_plain(x) for x in value)
    if isinstance(value, dict):
        return '\n'.join(f'{k}: {_plain(v)}' for k, v in value.items() if v not in (None, '', [], {}))
    return str(value)


def _table_html(columns, rows):
    headers = [str(c or '').strip() for c in (columns or [])]
    if not any(headers):
        return ''
    parts = ['<table><thead><tr>']
    parts.extend(f'<th>{_esc(h)}</th>' for h in headers)
    parts.append('</tr></thead><tbody>')
    for row in rows or []:
        if not isinstance(row, list):
            continue
        values = [('' if (row[i] if i < len(row) else '') is None else str(row[i])) for i in range(len(headers))]
        if not any(v.strip() for v in values):
            continue
        parts.append('<tr>' + ''.join(f'<td>{_esc(v)}</td>' for v in values) + '</tr>')
    parts.append('</tbody></table>')
    return ''.join(parts)


def build_syllabus_html(syllabus, branding=None, style_profile=None):
    """Build a full HTML document for the filled syllabus."""
    data = syllabus if isinstance(syllabus, dict) else {}
    branding = branding if isinstance(branding, dict) else {}
    style_profile = style_profile if isinstance(style_profile, dict) else (
        branding.get('syllabus_style_profile') or {}
    )
    css = _css_from_style(style_profile, branding)

    header_img = branding.get('header_image') or branding.get('header_image_url') or ''
    footer_img = branding.get('footer_image') or branding.get('footer_image_url') or ''
    header_text = branding.get('header_text') or ''
    footer_text = branding.get('footer_text') or ''

    body = []
    body.append('<div class="header">')
    body.append(_img_tag(header_img, 'Header'))
    if header_text:
        body.append(f'<div class="header-text">{_esc(header_text)}</div>')
    body.append('</div>')

    uni = _plain(data.get('university_name'))
    if uni:
        body.append(f'<div class="meta"><strong>{_esc(uni)}</strong></div>')
    for key in ('college', 'program'):
        val = _plain(data.get(key))
        if val:
            body.append(f'<div class="meta">{_esc(val)}</div>')

    title = _plain(data.get('document_title') or 'Course Information Syllabus')
    body.append(f'<div class="doc-title">{_esc(title)}</div>')

    # Core identification
    body.append('<h1>Course Specifications</h1>')
    body.append('<table class="kv"><tbody>')
    for label, key in [
        ('Course Title', 'course_title'),
        ('Course Code', 'course_code'),
        ('Course Category', 'course_category'),
        ('Credit Hours', 'credit_hours'),
        ('Year Level', 'year_level'),
        ('Semester / Year', 'semester_year'),
        ('Instructor', 'instructor_name'),
        ('Email', 'email'),
    ]:
        val = _plain(data.get(key))
        if val:
            body.append(f'<tr><td>{_esc(label)}</td><td>{_esc(val)}</td></tr>')
    body.append('</tbody></table>')

    # Common narrative sections
    for heading, key in [
        ('University Vision', 'vision'),
        ('University Mission', 'mission'),
        ('Course Description', 'course_description'),
        ('Course Rationale', 'rationale'),
        ('Teaching and Learning Strategies', 'teaching_strategies'),
        ('Grading System', 'grading_system'),
        ('Course Policies', 'policies'),
    ]:
        val = _plain(data.get(key))
        if val:
            body.append(f'<h1>{_esc(heading)}</h1>')
            body.append(f'<p>{_esc(val).replace(chr(10), "<br/>")}</p>')

    # List-like fields
    for heading, key in [
        ('Intended Learning Outcomes', 'ilos'),
        ('Assessment Tasks', 'assessment_tasks'),
        ('Weekly Schedule', 'weekly_schedule'),
    ]:
        val = data.get(key)
        text = _plain(val)
        if text:
            body.append(f'<h1>{_esc(heading)}</h1>')
            if isinstance(val, list) and val and isinstance(val[0], dict):
                # Try tabular dump of dict rows
                keys = list(val[0].keys())
                rows = [[item.get(k, '') for k in keys] for item in val if isinstance(item, dict)]
                body.append(_table_html(keys, rows))
            else:
                body.append(f'<p>{_esc(text).replace(chr(10), "<br/>")}</p>')

    # Institution-configured custom sections
    configured = branding.get('syllabus_sections') or []
    custom_subsections = data.get('custom_subsections') if isinstance(data.get('custom_subsections'), dict) else {}
    custom_tables = data.get('custom_tables') if isinstance(data.get('custom_tables'), dict) else {}
    for section in configured:
        if not isinstance(section, dict) or section.get('enabled') is False:
            continue
        section_key = str(section.get('key') or '')
        section_label = str(section.get('label') or section_key).strip()
        if not section_key or not section_label:
            continue
        if section.get('is_static') and section.get('static_content'):
            body.append(f'<h1>{_esc(section_label)}</h1>')
            body.append(f'<p>{_esc(section["static_content"]).replace(chr(10), "<br/>")}</p>')
            continue

        section_tables = custom_tables.get(section_key) if isinstance(custom_tables.get(section_key), dict) else {}
        answers = custom_subsections.get(section_key) if isinstance(custom_subsections.get(section_key), dict) else {}
        parts = []
        if section.get('table_enabled') and section.get('table_columns'):
            parts.append(_table_html(section.get('table_columns'), section_tables.get('__section__', [])))
        for sub in section.get('subsections') or []:
            if not isinstance(sub, dict):
                continue
            sub_key = str(sub.get('key') or '')
            sub_label = str(sub.get('label') or sub_key).strip()
            if not sub_key or not sub_label:
                continue
            answer = str(answers.get(sub_key) or '').strip()
            if sub.get('table_enabled') and sub.get('table_columns'):
                parts.append(f'<h2>{_esc(sub_label)}</h2>')
                parts.append(_table_html(sub.get('table_columns'), section_tables.get(sub_key, [])))
            elif answer:
                parts.append(f'<h2>{_esc(sub_label)}</h2>')
                parts.append(f'<p>{_esc(answer).replace(chr(10), "<br/>")}</p>')
        if parts:
            body.append(f'<h1>{_esc(section_label)}</h1>')
            body.extend(parts)

    body.append('<div class="footer">')
    body.append(_img_tag(footer_img, 'Footer'))
    if footer_text:
        body.append(f'<div class="footer-text">{_esc(footer_text)}</div>')
    body.append('</div>')

    return (
        '<!DOCTYPE html><html><head><meta charset="utf-8"/>'
        f'<style>{css}</style></head><body>{"".join(body)}</body></html>'
    )


def _pdf_via_weasyprint(html_doc):
    from weasyprint import HTML
    return HTML(string=html_doc).write_pdf()


def _pdf_via_reportlab(html_doc, style_profile=None):
    """Lightweight text PDF when WeasyPrint is unavailable (e.g. Windows without GTK)."""
    from reportlab.lib.pagesizes import A4, letter, landscape
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from reportlab.lib import colors

    style = style_profile if isinstance(style_profile, dict) else {}
    page = style.get('page') or {}
    margins = page.get('margins') or {}
    typography = style.get('typography') or {}
    body = typography.get('body') or {}
    heading = typography.get('heading_1') or {}
    color_map = style.get('colors') or {}

    page_size = A4 if (page.get('size') or 'A4').upper() == 'A4' else letter
    if page.get('orientation') == 'landscape':
        page_size = landscape(page_size)

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=page_size,
        topMargin=_pt(margins.get('top'), 72),
        rightMargin=_pt(margins.get('right'), 54),
        bottomMargin=_pt(margins.get('bottom'), 72),
        leftMargin=_pt(margins.get('left'), 54),
    )

    styles = getSampleStyleSheet()
    accent = colors.HexColor(color_map.get('accent') or '#003366')
    text_color = colors.HexColor(color_map.get('text') or '#111111')
    body_style = ParagraphStyle(
        'SyllabusBody',
        parent=styles['Normal'],
        fontName='Times-Roman',
        fontSize=_pt(body.get('size_pt'), 11),
        textColor=text_color,
        leading=_pt(body.get('size_pt'), 11) * 1.35,
    )
    h1_style = ParagraphStyle(
        'SyllabusH1',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=_pt(heading.get('size_pt'), 14),
        textColor=accent,
        spaceBefore=12,
        spaceAfter=6,
    )
    h2_style = ParagraphStyle(
        'SyllabusH2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=_pt(body.get('size_pt'), 11) + 1,
        textColor=accent,
        spaceBefore=8,
        spaceAfter=4,
    )

    # Strip tags lightly for ReportLab paragraphs
    text = re.sub(r'(?is)<style.*?>.*?</style>', '', html_doc)
    text = text.replace('<br/>', '\n').replace('<br>', '\n')
    chunks = re.split(r'(?i)(</?h1>|</?h2>|</?p>|</?div[^>]*>|<table[\s\S]*?</table>)', text)

    story = []
    mode = 'p'
    buf = []

    def flush():
        nonlocal buf
        raw = re.sub(r'<[^>]+>', '', ''.join(buf))
        raw = escape(html.unescape(raw)).replace('\n', '<br/>').strip()
        buf = []
        if not raw:
            return
        style_use = h1_style if mode == 'h1' else h2_style if mode == 'h2' else body_style
        story.append(Paragraph(raw, style_use))
        story.append(Spacer(1, 4))

    for chunk in chunks:
        if not chunk:
            continue
        lower = chunk.lower()
        if lower == '<h1>':
            flush()
            mode = 'h1'
        elif lower == '</h1>':
            flush()
            mode = 'p'
        elif lower == '<h2>':
            flush()
            mode = 'h2'
        elif lower == '</h2>':
            flush()
            mode = 'p'
        elif lower.startswith('<table'):
            flush()
            rows = re.findall(r'(?is)<tr>(.*?)</tr>', chunk)
            data_rows = []
            for row in rows:
                cells = re.findall(r'(?is)<t[hd][^>]*>(.*?)</t[hd]>', row)
                data_rows.append([re.sub(r'<[^>]+>', '', html.unescape(c)).strip() for c in cells])
            if data_rows:
                tbl = Table(data_rows, hAlign='LEFT')
                tbl.setStyle(TableStyle([
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(color_map.get('table_header_bg') or '#f0f0f0')),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), max(8, _pt(body.get('size_pt'), 11) - 1)),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ]))
                story.append(tbl)
                story.append(Spacer(1, 6))
        else:
            buf.append(chunk)
    flush()

    doc.build(story)
    return buffer.getvalue()


def export_syllabus_pdf(syllabus, branding=None, style_profile=None):
    """
    Returns (pdf_bytes, engine) where engine is 'weasyprint' or 'reportlab'.
    """
    branding = branding or {}
    style_profile = style_profile or branding.get('syllabus_style_profile') or {}
    html_doc = build_syllabus_html(syllabus, branding=branding, style_profile=style_profile)
    try:
        return _pdf_via_weasyprint(html_doc), 'weasyprint'
    except Exception as exc:
        logger.warning('WeasyPrint PDF failed (%s); using ReportLab fallback', exc)
        return _pdf_via_reportlab(html_doc, style_profile=style_profile), 'reportlab'
