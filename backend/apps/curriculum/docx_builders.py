"""
DOCX builders for the Table of Specifications and the syllabus matrix sections.

Kept out of views.py so the (already very large) view layer stays focused on
request handling. Everything here is pure: it takes a plain syllabus dict (the
same shape stored in ``Syllabus.syllabus_content``) and returns a python-docx
``Document``. No database access, no new models, no migrations.

Sections covered here are the ones the default syllabus DOCX builder was
silently omitting: Table of Specifications, ILO-AT Matrix, Framework Mapping
and the ILO-Framework Matrix.
"""

import base64
import binascii
import re
from io import BytesIO

from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor

MAROON = RGBColor(0x8B, 0x00, 0x00)
GREY = RGBColor(0x44, 0x44, 0x44)

# Must stay in sync with BLOOM_KEYS in frontend/src/components/FacultyWorkspacePage.jsx
BLOOM_KEYS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']

# Smallest sensible printable size for the 18-column ToS grid.
_TINY_PT = 6.5
_SMALL_PT = 7.5
_BODY_PT = 9


# ── low level helpers ────────────────────────────────────────────────────────

def _text(value):
    if value is None:
        return ''
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _is_data_url(url):
    return isinstance(url, str) and url.strip().startswith('data:image')


def _decode_data_url(url):
    """Return bytes for a data: URL, or None when it is not one we can read."""
    if not _is_data_url(url):
        return None
    match = re.match(r'data:image/[a-zA-Z0-9.+-]+;base64,(.*)', url.strip(), re.DOTALL)
    if not match:
        return None
    try:
        return base64.b64decode(match.group(1), validate=False)
    except (binascii.Error, ValueError):
        return None


def _cell_text(cell, value, *, size=_BODY_PT, bold=False, align=None, color=None):
    cell.text = ''
    para = cell.paragraphs[0]
    if align is not None:
        para.alignment = align
    # Compact the paragraph so the ToS grid fits on one page width.
    para.paragraph_format.space_before = Pt(1)
    para.paragraph_format.space_after = Pt(1)
    run = para.add_run(_text(value))
    run.font.size = Pt(size)
    run.font.bold = bold
    if color is not None:
        run.font.color.rgb = color
    return cell


def _shade(cell, hex_fill):
    """Apply a solid background fill. Uses raw XML because python-docx has no API."""
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement

    tc_pr = cell._tc.get_or_add_tcPr()
    for existing in tc_pr.findall(qn('w:shd')):
        tc_pr.remove(existing)
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_fill)
    tc_pr.append(shd)


def _repeat_header_row(row):
    """Mark a table row as a repeating header row so it survives page breaks."""
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement

    tr_pr = row._tr.get_or_add_trPr()
    header = OxmlElement('w:tblHeader')
    header.set(qn('w:val'), 'true')
    tr_pr.append(header)


def _keep_with_next(paragraph):
    paragraph.paragraph_format.keep_with_next = True


# ── public helpers ───────────────────────────────────────────────────────────

def heading(doc, text, level=1):
    para = doc.add_heading(_text(text), level=level)
    if level == 1 and para.runs:
        para.runs[0].font.color.rgb = MAROON
    _keep_with_next(para)
    return para


def make_landscape(doc):
    """Start a new landscape section and return it.

    The ToS grid is 18 columns wide and is unreadable in portrait, so it gets
    its own landscape section. Width and height must be swapped explicitly --
    setting orientation alone does not resize the page in python-docx.
    """
    section = doc.add_section(WD_SECTION.NEW_PAGE)
    section.orientation = WD_ORIENT.LANDSCAPE
    width, height = section.page_width, section.page_height
    if width < height:
        section.page_width, section.page_height = height, width
    section.top_margin = Inches(0.5)
    section.bottom_margin = Inches(0.5)
    section.left_margin = Inches(0.4)
    section.right_margin = Inches(0.4)
    return section


def _add_image_paragraph(container, image_bytes, width_inches=3.2):
    """Add a centred picture paragraph, tolerating an unreadable image.

    Institution branding is optional metadata. A truncated or otherwise invalid
    upload must not take down the whole syllabus/ToS download, so a failure here
    is swallowed and the text branding still renders.
    """
    try:
        para = container.add_paragraph()
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        para.add_run().add_picture(BytesIO(image_bytes), width=Inches(width_inches))
        return True
    except Exception:  # noqa: BLE001 - any decode/format problem is non-fatal
        return False


def apply_page_header_footer(doc, branding=None):
    """Stamp header/footer branding onto every section of the document.

    ``branding`` is an optional dict with ``header_text`` / ``footer_text`` and
    ``header_image`` / ``footer_image`` (data: URLs or plain text). New sections
    inherit from the previous one, but we set each explicitly so a mid-document
    landscape section also carries the branding.
    """
    branding = branding or {}
    header_text = _text(branding.get('header_text'))
    footer_text = _text(branding.get('footer_text'))
    header_image = _decode_data_url(branding.get('header_image'))
    footer_image = _decode_data_url(branding.get('footer_image'))

    for section in doc.sections:
        section.different_first_page_header_footer = False

        header = section.header
        header.is_linked_to_previous = False
        for para in list(header.paragraphs):
            para._element.getparent().remove(para._element)
        if header_image:
            _add_image_paragraph(header, header_image)
        if header_text:
            para = header.add_paragraph(header_text)
            para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for run in para.runs:
                run.font.size = Pt(8)
                run.font.color.rgb = GREY

        footer = section.footer
        footer.is_linked_to_previous = False
        for para in list(footer.paragraphs):
            para._element.getparent().remove(para._element)
        if footer_text:
            para = footer.add_paragraph(footer_text)
            para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for run in para.runs:
                run.font.size = Pt(8)
                run.font.color.rgb = GREY
        if footer_image:
            _add_image_paragraph(footer, footer_image)

        # Page numbers, so printed copies can be ordered.
        if footer.paragraphs:
            para = footer.add_paragraph()
            para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            _add_page_number_field(para)


def _add_page_number_field(paragraph):
    """Insert a PAGE / NUMPAGES field so the footer shows 'Page x of y'."""
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement

    def _field(instr):
        begin = OxmlElement('w:fldChar')
        begin.set(qn('w:fldCharType'), 'begin')
        instr_el = OxmlElement('w:instrText')
        instr_el.set(qn('xml:space'), 'preserve')
        instr_el.text = instr
        end = OxmlElement('w:fldChar')
        end.set(qn('w:fldCharType'), 'end')
        return begin, instr_el, end

    run = paragraph.add_run()
    run.font.size = Pt(8)
    run.font.color.rgb = GREY
    paragraph.add_run('Page ').font.size = Pt(8)
    for element in _field(' PAGE '):
        run._r.append(element)
    paragraph.add_run(' of ').font.size = Pt(8)
    for element in _field(' NUMPAGES '):
        run._r.append(element)


# ── Table of Specifications ──────────────────────────────────────────────────

def has_tos(data):
    for exam in (data.get('tos') or []):
        if not isinstance(exam, dict):
            continue
        if _text(exam.get('examLabel') or exam.get('examCode')):
            return True
        if any(_text(t.get('topic')) for t in (exam.get('topics') or []) if isinstance(t, dict)):
            return True
    return False


def add_table_of_specifications(doc, data, *, title='Table of Specifications'):
    """Render every exam in ``data['tos']``. Returns True if anything was written."""
    exams = [e for e in (data.get('tos') or []) if isinstance(e, dict)]
    exams = [
        e for e in exams
        if _text(e.get('examLabel') or e.get('examCode'))
        or any(_text(t.get('topic')) for t in (e.get('topics') or []) if isinstance(t, dict))
    ]
    if not exams:
        return False

    heading(doc, title, level=1)

    for index, exam in enumerate(exams, start=1):
        label = _text(exam.get('examLabel')) or _text(exam.get('examCode')) or f'Examination {index}'
        if len(exams) > 1:
            heading(doc, label, level=2)
        else:
            heading(doc, f'{title} — {label}', level=2)

        _add_tos_meta_block(doc, exam, len(exams) > 1)
        _add_tos_grid(doc, exam)

    return True


def _add_tos_meta_block(doc, exam, multi_exam):
    """Prepared/checked/approved by + total items, as a compact 2-col table."""
    meta = [
        ('Semester / Year', _text(exam.get('semester'))),
        ('Prepared by', _text(exam.get('preparedBy'))),
        ('Checked and verified by', _text(exam.get('checkedBy'))),
        ('Approved by', _text(exam.get('approvedBy'))),
        ('Total test items', _text(exam.get('totalTestItems'))),
    ]
    meta = [(label, value) for label, value in meta if value]
    if not meta:
        return

    table = doc.add_table(rows=0, cols=4)
    table.style = 'Table Grid'
    for i in range(0, len(meta), 2):
        cells = table.add_row().cells
        for offset, (label, value) in enumerate(meta[i:i + 2]):
            _cell_text(cells[offset * 2], label, size=_SMALL_PT, bold=True)
            _cell_text(cells[offset * 2 + 1], value, size=_SMALL_PT)
    doc.add_paragraph()


def _add_tos_grid(doc, exam):
    """The 18-column ToS table: Topic, ILOs, hours, weight, 6x2 Bloom, total."""
    topics = [t for t in (exam.get('topics') or []) if isinstance(t, dict)]
    topics = [t for t in topics if _text(t.get('topic')) or _text(t.get('total_points'))]
    if not topics:
        doc.add_paragraph('No topics defined for this examination.')
        doc.add_paragraph()
        return

    columns = 1 + 1 + 2 + 1 + (len(BLOOM_KEYS) * 2) + 1
    table = doc.add_table(rows=2, cols=columns)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False

    # Capture the cell objects up front. A vertical merge removes the swallowed
    # <w:tc> from its row, so row.cells re-indexes after the first merge --
    # doing any merge before all the writes would target the wrong cells.
    top = list(table.rows[0].cells)
    sub = list(table.rows[1].cells)

    # ── Write every header cell first, while indices are still stable ──────
    # col 0 Topic | col 1 ILOs | col 2-3 hours | col 4 weight | 5.. bloom | last total
    _cell_text(top[0], 'Topic', size=_TINY_PT, bold=True, align=WD_ALIGN_PARAGRAPH.LEFT, color=MAROON)
    _cell_text(top[1], 'ILOs', size=_TINY_PT, bold=True, color=MAROON)
    _cell_text(top[2], 'No. of hrs', size=_TINY_PT, bold=True, color=MAROON)
    _cell_text(top[3], '', size=_TINY_PT)  # placeholder, absorbed by the merge
    _cell_text(top[4], 'Weight (%)', size=_TINY_PT, bold=True, color=MAROON)
    _cell_text(top[columns - 1], 'Total pts', size=_TINY_PT, bold=True, color=MAROON)

    _cell_text(sub[2], 'Class', size=_TINY_PT, bold=True)
    _cell_text(sub[3], 'Min', size=_TINY_PT, bold=True)

    bloom_col = 5
    bloom_spans = []
    for key in BLOOM_KEYS:
        _cell_text(top[bloom_col], key.capitalize(), size=_TINY_PT, bold=True, color=MAROON)
        _cell_text(top[bloom_col + 1], '', size=_TINY_PT)  # placeholder for the merge
        _cell_text(sub[bloom_col], 'Items', size=_TINY_PT, bold=True)
        _cell_text(sub[bloom_col + 1], '%', size=_TINY_PT, bold=True)
        bloom_spans.append((bloom_col, bloom_col + 1))
        bloom_col += 2

    # ── Now merge, using the captured objects ──────────────────────────────
    top[0].merge(sub[0])
    top[1].merge(sub[1])
    top[2].merge(top[3])
    top[4].merge(sub[4])
    top[columns - 1].merge(sub[columns - 1])
    for left, right in bloom_spans:
        top[left].merge(top[right])

    for cell in (top[0], top[1], top[4], top[columns - 1]):
        _shade(cell, 'F2F2F2')

    _repeat_header_row(table.rows[0])
    _repeat_header_row(table.rows[1])

    for topic in topics:
        cells = table.add_row().cells
        _cell_text(cells[0], topic.get('topic'), size=_TINY_PT)
        _cell_text(cells[1], ', '.join(_text(i) for i in (topic.get('ilos') or []) if _text(i)), size=_TINY_PT)
        _cell_text(cells[2], topic.get('hours_class'), size=_TINY_PT)
        _cell_text(cells[3], topic.get('hours_min'), size=_TINY_PT)
        _cell_text(cells[4], _with_percent(topic.get('weight')), size=_TINY_PT)

        col = 5
        items = topic.get('bloom_items') or {}
        pcts = topic.get('bloom_pct') or {}
        for key in BLOOM_KEYS:
            _cell_text(cells[col], items.get(key) if isinstance(items, dict) else '', size=_TINY_PT)
            _cell_text(cells[col + 1], _with_percent(pcts.get(key) if isinstance(pcts, dict) else ''), size=_TINY_PT)
            col += 2

        _cell_text(cells[columns - 1], topic.get('total_points'), size=_TINY_PT, bold=True)

    doc.add_paragraph()


def _with_percent(value):
    text = _text(value)
    if not text:
        return ''
    return text if text.endswith('%') else f'{text}%'


# ── ILO-AT Matrix ────────────────────────────────────────────────────────────

def add_ilo_at_matrix(doc, data, *, title='ILO – Assessment Task Matrix'):
    """Grid of ILOs (rows) against assessment tasks (columns) with codes."""
    ilos = [_text(i) for i in (data.get('ilos') or []) if _text(i)]
    ats = [a for a in (data.get('ats') or []) if isinstance(a, dict)]
    ats = [a for a in ats if _text(a.get('label')) or _text(a.get('code'))]
    if not ilos or not ats:
        return False

    heading(doc, title, level=1)

    table = doc.add_table(rows=1, cols=2 + len(ats))
    table.style = 'Table Grid'
    head = table.rows[0]
    _cell_text(head.cells[0], 'ILO', size=_SMALL_PT, bold=True, align=WD_ALIGN_PARAGRAPH.LEFT, color=MAROON)
    _cell_text(head.cells[1], 'Learning Outcome', size=_SMALL_PT, bold=True, color=MAROON)
    for offset, task in enumerate(ats):
        code = _text(task.get('code'))
        label = _text(task.get('label'))
        _cell_text(
            head.cells[2 + offset],
            f'{code}\n{label}' if code and label else (label or code),
            size=_SMALL_PT, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, color=MAROON,
        )
    _repeat_header_row(head)

    # assessment_tasks is index-aligned with ilos; each holds ilo_values per task.
    tasks = [t for t in (data.get('assessment_tasks') or []) if isinstance(t, dict)]

    for index, ilo_text in enumerate(ilos, start=1):
        cells = table.add_row().cells
        _cell_text(cells[0], f'ILO{index}', size=_SMALL_PT, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
        _cell_text(cells[1], ilo_text, size=_BODY_PT)
        values = tasks[index - 1].get('ilo_values') if index - 1 < len(tasks) else None
        for offset in range(len(ats)):
            mark = ''
            if isinstance(values, list) and offset < len(values):
                mark = _text(values[offset])
            _cell_text(cells[2 + offset], mark, size=_BODY_PT, align=WD_ALIGN_PARAGRAPH.CENTER)

    doc.add_paragraph()
    return True


# ── Framework Mapping ────────────────────────────────────────────────────────

_FRAMEWORK_TABS = [
    {
        'title': 'Institutional Graduate Attributes (IGA)',
        'items_field': 'igas',
        'headers_field': 'iga_headers',
        'rows_field': 'iga_rows',
        'values_key': 'vals',
    },
    {
        'title': 'Student Outcomes (SO)',
        'items_field': 'student_outcomes',
        'headers_field': 'so_headers',
        'rows_field': 'so_cpa_rows',
        'values_key': 'so_vals',
        'extra_columns': [('C', 'c'), ('P', 'p'), ('A', 'a')],
    },
    {
        'title': 'CDIO Skills',
        'items_field': 'cdio_skills',
        'headers_field': 'cdio_headers',
        'rows_field': None,
    },
    {
        'title': 'SDG Skills',
        'items_field': 'sdg_skills',
        'headers_field': 'sdg_headers',
        'rows_field': 'cdio_sdg_rows',
        'values_key': 'cdio_vals',
        'secondary_values_key': 'sdg_vals',
        'secondary_headers_field': 'sdg_headers',
    },
]


def add_framework_mapping(doc, data, *, title='Framework Mapping'):
    """Render every framework grid that has items. Returns True if anything was written."""
    tabs = [tab for tab in _FRAMEWORK_TABS if _framework_tab_has_items(data, tab)]
    if not tabs:
        return False

    # Always emit the parent heading, even for a single framework, so the
    # document has a consistent structure a reviewer can navigate.
    heading(doc, title, level=1)
    for tab in tabs:
        _add_framework_tab(doc, data, tab)
    return True


def _framework_tab_has_items(data, tab):
    items = data.get(tab['items_field']) or []
    return any(
        isinstance(item, dict)
        and (_text(item.get('code')) or _text(item.get('description')) or _text(item.get('label')))
        for item in items
    )


def _add_framework_tab(doc, data, tab):
    items = [i for i in (data.get(tab['items_field']) or []) if isinstance(i, dict)]
    items = [i for i in items if _text(i.get('code')) or _text(i.get('description')) or _text(i.get('label'))]
    headers = [_text(h) for h in (data.get(tab['headers_field']) or []) if _text(h)]
    rows = [r for r in (data.get(tab['rows_field']) or []) if isinstance(r, dict)] if tab.get('rows_field') else []
    extra_columns = tab.get('extra_columns') or []

    if not items:
        return False

    heading(doc, tab['title'], level=2)

    # Item legend
    for item in items:
        code = _text(item.get('code'))
        label = _text(item.get('label') or item.get('name'))
        description = _text(item.get('description'))
        bits = [b for b in (code, label, description) if b]
        if bits:
            para = doc.add_paragraph(' • '.join(bits), style='List Bullet')
            for run in para.runs:
                run.font.size = Pt(_BODY_PT)

    if not headers or not rows:
        doc.add_paragraph()
        return True

    columns = 2 + len(headers) + len(extra_columns)
    table = doc.add_table(rows=1, cols=columns)
    table.style = 'Table Grid'
    head = table.rows[0]
    _cell_text(head.cells[0], 'Item', size=_SMALL_PT, bold=True, color=MAROON)
    _cell_text(head.cells[1], 'Description', size=_SMALL_PT, bold=True, color=MAROON)
    for offset, header in enumerate(headers):
        _cell_text(head.cells[2 + offset], header, size=_SMALL_PT, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, color=MAROON)
    for offset, (short, _key) in enumerate(extra_columns):
        _cell_text(head.cells[2 + len(headers) + offset], short, size=_SMALL_PT, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, color=MAROON)
    _repeat_header_row(head)

    for item in items:
        cells = table.add_row().cells
        _cell_text(cells[0], _text(item.get('code')) or _text(item.get('label')), size=_BODY_PT)
        _cell_text(cells[1], _text(item.get('description')), size=_BODY_PT)
        values = _framework_values_for_item(data, tab, item)
        for offset in range(len(headers)):
            value = values[offset] if offset < len(values) else ''
            _cell_text(cells[2 + offset], value, size=_BODY_PT, align=WD_ALIGN_PARAGRAPH.CENTER)
        for offset, (_short, key) in enumerate(extra_columns):
            _cell_text(cells[2 + len(headers) + offset], item.get(key), size=_BODY_PT, align=WD_ALIGN_PARAGRAPH.CENTER)

    doc.add_paragraph()
    return True


def _framework_values_for_item(data, tab, item):
    """Best-effort extraction of a framework item's per-header values.

    The stored shape varies slightly between frameworks (and between documents
    parsed by the AI), so this checks the common keys before giving up and
    returning blanks rather than raising.
    """
    for key in ('values', 'vals', 'so_vals', 'matrix', 'cells'):
        candidate = item.get(key)
        if isinstance(candidate, list) and candidate:
            return [_text(v) for v in candidate]

    # Fall back to the positional row tables when the item itself carries no values.
    rows = tab.get('rows_field')
    values_key = tab.get('values_key')
    if rows and values_key:
        code = _text(item.get('code'))
        for row in (data.get(rows) or []):
            if not isinstance(row, dict):
                continue
            row_code = _text(row.get('code') or row.get('so_code') or row.get('item'))
            if row_code and code and row_code == code:
                candidate = row.get(values_key)
                if isinstance(candidate, list):
                    return [_text(v) for v in candidate]
    return []


# ── ILO – Framework Matrix ───────────────────────────────────────────────────

def add_ilo_framework_matrix(doc, data, *, title='ILO – Framework Matrix'):
    """Compact matrix of ILOs against framework columns (SO / IGA / CDIO / SDG)."""
    ilos = [_text(i) for i in (data.get('ilos') or []) if _text(i)]
    if not ilos:
        return False

    blocks = []
    so_headers = [_text(h) for h in (data.get('so_headers') or []) if _text(h)]
    iga_headers = [_text(h) for h in (data.get('iga_headers') or []) if _text(h)]
    cdio_headers = [_text(h) for h in (data.get('cdio_headers') or []) if _text(h)]
    sdg_headers = [_text(h) for h in (data.get('sdg_headers') or []) if _text(h)]

    if so_headers:
        blocks.append(('Student Outcomes', so_headers, 'so_cpa_rows', 'so_vals'))
    if iga_headers:
        blocks.append(('Graduate Attributes', iga_headers, 'iga_rows', 'vals'))
    if cdio_headers:
        blocks.append(('CDIO', cdio_headers, 'cdio_sdg_rows', 'cdio_vals'))
    if sdg_headers:
        blocks.append(('SDG', sdg_headers, 'cdio_sdg_rows', 'sdg_vals'))

    if not blocks:
        return False

    heading(doc, title, level=1)

    for label, headers, rows_field, values_key in blocks:
        rows = [r for r in (data.get(rows_field) or []) if isinstance(r, dict)]
        if not rows:
            continue

        para = doc.add_paragraph()
        run = para.add_run(label)
        run.bold = True
        run.font.size = Pt(_SMALL_PT)
        run.font.color.rgb = GREY
        _keep_with_next(para)

        table = doc.add_table(rows=1, cols=2 + len(headers))
        table.style = 'Table Grid'
        head = table.rows[0]
        _cell_text(head.cells[0], 'ILO', size=_TINY_PT, bold=True, color=MAROON)
        _cell_text(head.cells[1], 'Learning Outcome', size=_TINY_PT, bold=True, color=MAROON)
        for offset, header in enumerate(headers):
            _cell_text(head.cells[2 + offset], header, size=_TINY_PT, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, color=MAROON)
        _repeat_header_row(head)

        for index, ilo_text in enumerate(ilos):
            cells = table.add_row().cells
            _cell_text(cells[0], f'ILO{index + 1}', size=_TINY_PT, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
            _cell_text(cells[1], ilo_text, size=_TINY_PT)
            values = rows[index].get(values_key) if index < len(rows) else None
            values = values if isinstance(values, list) else []
            for offset in range(len(headers)):
                value = _text(values[offset]) if offset < len(values) else ''
                _cell_text(cells[2 + offset], value, size=_TINY_PT, align=WD_ALIGN_PARAGRAPH.CENTER)

        doc.add_paragraph()

    return True


# ── document assembly ────────────────────────────────────────────────────────

def _institutional_heading_block(doc, data):
    para = doc.add_paragraph()
    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = para.add_run(_text(data.get('university_name')).replace('\n', ' | '))
    run.bold = True
    run.font.size = Pt(11)

    for key, size, bold in (('college', 10, False), ('program', 10, True)):
        value = _text(data.get(key))
        if value:
            sub = doc.add_paragraph(value)
            sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
            if sub.runs:
                sub.runs[0].font.size = Pt(size)
                sub.runs[0].bold = bold

    doc.add_paragraph()

    title_para = doc.add_paragraph()
    title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_run = title_para.add_run(_text(data.get('document_title')) or 'Course Information Syllabus (CIS)')
    title_run.bold = True
    title_run.font.size = Pt(14)
    title_run.font.color.rgb = MAROON
    doc.add_paragraph()


def build_tos_docx(data, branding=None):
    """Standalone Table of Specifications document in landscape."""
    from docx import Document

    doc = Document()
    make_landscape(doc)
    _institutional_heading_block(doc, data)
    add_table_of_specifications(doc, data, title='Table of Specifications')
    apply_page_header_footer(doc, branding)
    return doc
