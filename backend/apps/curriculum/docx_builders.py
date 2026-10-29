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


def _cell_text(cell, value, *, size=_BODY_PT, bold=False, italic=False, align=None, color=None):
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
    run.font.italic = italic
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

    ``branding`` is an optional dict with ``header_text`` and
    ``header_image`` / ``footer_image`` (data: URLs or plain text). New sections
    inherit from the previous one, but we set each explicitly so a mid-document
    landscape section also carries the branding. The footer itself only carries
    the page number: institution footer text is not printed.
    """
    branding = branding or {}
    header_text = _text(branding.get('header_text'))
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
        if footer_image:
            _add_image_paragraph(footer, footer_image)

        # Page numbers, so printed copies can be ordered.
        para = footer.add_paragraph()
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _add_page_number_field(para)


def _add_page_number_field(paragraph):
    """Insert PAGE / NUMPAGES so the footer reads "Page x of y".

    The three field characters must stay in order inside their own run;
    without the separator Word prints the field result at the run's position
    instead of between the literal words.
    """
    def _field_run(instruction):
        from docx.oxml.ns import qn
        from docx.oxml import OxmlElement

        run = paragraph.add_run()
        run.font.size = Pt(8)
        run.font.color.rgb = GREY
        for kind, text in (('begin', None), ('instr', instruction),
                           ('separate', None), ('end', None)):
            if kind == 'instr':
                element = OxmlElement('w:instrText')
                element.set(qn('xml:space'), 'preserve')
                element.text = text
            else:
                element = OxmlElement('w:fldChar')
                element.set(qn('w:fldCharType'), kind)
            run._r.append(element)

    paragraph.add_run('Page ').font.size = Pt(8)
    _field_run(' PAGE ')
    paragraph.add_run(' of ').font.size = Pt(8)
    _field_run(' NUMPAGES ')


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


def _topic_minutes(topic):
    """Minutes in the No. of hrs / Min column: class hours × 60."""
    try:
        hours = float((topic or {}).get('hours_class'))
    except (TypeError, ValueError):
        return ''
    if hours != hours or hours <= 0:
        return ''
    return int(round(hours * 60))


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
        _cell_text(cells[3], _topic_minutes(topic), size=_TINY_PT)
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


# ── standalone institutional TOS form ────────────────────────────────────────
#
# The faculty "Download ToS" export is the university's one-page TOS form, not
# the compact grid embedded in the syllabus. The layout follows the
# institutional TOS template: letterhead, "TABLE OF SPECIFICATIONS" with the
# examination and semester, course code/title, the 18-column grid, the
# signatory block, and the footnotes.

TOS_FONT = 'Times New Roman'

# Printed when the admin has not uploaded a header template for the institution.
_TOS_LETTERHEAD_LINES = (
    ('Republic of the Philippines', 12, True),
    ('BATANGAS STATE UNIVERSITY', 20, True),
    ('The National Engineering University', 12, True),
    ('Lipa Campus', 12, True),
    ('A. Tanco Drive, Marawoy, Lipa City, Batangas, Philippines 4217', 10, True),
    ('Tel Nos. : (+63 43) 980-0385; 980-0392 to local 3130', 10, False),
    ('E-mail Address: cics.lipa@g.batstate-u.edu.ph | Website Address: http://www.batstate-u.edu.ph', 10, False),
    ('College of Informatics and Computing Sciences', 12, True),
)

_TOS_PAGE_WIDTH_IN = 11.69
_TOS_PAGE_HEIGHT_IN = 8.27
_TOS_MARGIN_IN = 0.45
_TOS_CONTENT_WIDTH_IN = _TOS_PAGE_WIDTH_IN - 2 * _TOS_MARGIN_IN

_TOS_GRID_PT = 7.5
_TOS_HEAD_PT = 7.5
_TOS_BLOOM_PT = 6.5

# Topic | ILOs | class hrs | exam minutes | weight | 6 x (items, %) | points
_TOS_COLUMN_WIDTHS = (
    1.78, 0.9, 0.44, 0.49, 0.66,
    0.78, 0.34, 0.78, 0.34, 0.78, 0.34,
    0.78, 0.34, 0.78, 0.34, 0.78, 0.34,
    0.64,
)

# The examination period is what the user picked when the TOS was created, so
# the title always names it instead of a generic "Examination".
_TOS_EXAM_TITLES = (
    ('prelim', 'Preliminary Examination'),
    ('midterm', 'Midterm Examination'),
    ('final', 'Final Examination'),
)


def _set_tos_document_font(doc):
    from docx.oxml.ns import qn

    style = doc.styles['Normal']
    style.font.name = TOS_FONT
    style.font.size = Pt(9)
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.get_or_add_rFonts()
    for attribute in ('w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'):
        rfonts.set(qn(attribute), TOS_FONT)
    style.paragraph_format.space_before = Pt(0)
    style.paragraph_format.space_after = Pt(0)
    style.paragraph_format.line_spacing = 1.0


def _tos_paragraph(doc, text='', *, size=9, bold=False, italic=False,
                   align=WD_ALIGN_PARAGRAPH.CENTER, before=0, after=0):
    para = doc.add_paragraph()
    para.alignment = align
    para.paragraph_format.space_before = Pt(before)
    para.paragraph_format.space_after = Pt(after)
    run = para.add_run(_text(text))
    run.font.name = TOS_FONT
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    return para


def _configure_tos_page(doc):
    section = doc.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width = Inches(_TOS_PAGE_WIDTH_IN)
    section.page_height = Inches(_TOS_PAGE_HEIGHT_IN)
    section.top_margin = Inches(0.5)
    section.bottom_margin = Inches(0.45)
    section.left_margin = Inches(_TOS_MARGIN_IN)
    section.right_margin = Inches(_TOS_MARGIN_IN)


def _render_tos_letterhead(doc, branding, *, page_break=False):
    first = None
    image = _decode_data_url((branding or {}).get('header_image'))
    if image:
        first = _add_tos_letterhead_image(doc, image)
    if first is None:
        for index, (text, size, bold) in enumerate(_TOS_LETTERHEAD_LINES):
            para = _tos_paragraph(doc, text, size=size, bold=bold)
            if index == 0:
                first = para
    if page_break and first is not None:
        # Break on the first paragraph rather than an empty one: the form can
        # end exactly at the page edge, and a trailing break would add a blank
        # page before the next examination.
        first.paragraph_format.page_break_before = True
    return first


def _add_tos_letterhead_image(doc, image_bytes):
    from docx.image.image import Image as DocxImage

    try:
        info = DocxImage.from_blob(image_bytes)
        width = _TOS_CONTENT_WIDTH_IN
        height = width * info.px_height / info.px_width if info.px_width else 1.4
        if height > 1.55:
            height = 1.55
            width = height * info.px_width / info.px_height
        para = doc.add_paragraph()
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        para.paragraph_format.space_before = Pt(0)
        para.paragraph_format.space_after = Pt(0)
        para.add_run().add_picture(BytesIO(image_bytes), width=Inches(width), height=Inches(height))
        return para
    except Exception:  # noqa: BLE001 - an unreadable upload falls back to text
        return None


def _tos_exam_title(exam):
    label = _text(exam.get('examLabel'))
    code = _text(exam.get('examCode'))
    for candidate in (label, code):
        lowered = candidate.lower()
        for needle, title in _TOS_EXAM_TITLES:
            if needle in lowered:
                return title
    return label or code or 'Examination'


def _tos_number(value):
    """Grid value: blanks for empty/zero so the form only shows real inputs."""
    text = _text(value)
    if not text:
        return ''
    try:
        number = float(text)
    except (TypeError, ValueError):
        return text
    if number <= 0:
        return ''
    return str(int(number)) if number.is_integer() else f'{number:.1f}'


def _tos_mapping(value):
    return value if isinstance(value, dict) else {}


def _tos_topic_rows(exam):
    rows = [topic for topic in (exam.get('topics') or []) if isinstance(topic, dict)]
    return [row for row in rows if _text(row.get('topic')) or _text(row.get('total_points'))]


def _tos_sum(rows, key):
    total = 0.0
    for row in rows:
        try:
            total += float(row.get(key) or 0)
        except (TypeError, ValueError):
            continue
    return total


def _add_tos_form_grid(doc, exam):
    from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT

    topics = _tos_topic_rows(exam)
    columns = len(_TOS_COLUMN_WIDTHS)
    last = columns - 1

    table = doc.add_table(rows=3, cols=columns)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False

    # ── Note row (above the column headers, as in the institutional form) ──
    note_cells = list(table.rows[0].cells)
    blank = note_cells[0].merge(note_cells[4])
    _cell_text(blank, '', size=_TOS_GRID_PT)
    note = note_cells[5].merge(note_cells[last])
    _cell_text(
        note,
        'Indicate the test items that correspond to the following levels of Intended Learning Outcomes',
        size=_TOS_GRID_PT, bold=True, italic=True,
    )

    # ── Two-row column headers ─────────────────────────────────────────────
    top = list(table.rows[1].cells)
    sub = list(table.rows[2].cells)

    _cell_text(top[0], '', size=_TOS_HEAD_PT, bold=True)
    _cell_text(top[1], '*ILOs', size=_TOS_HEAD_PT, bold=True)
    _cell_text(top[2], 'NO. OF HRS', size=_TOS_HEAD_PT, bold=True)
    _cell_text(top[3], '', size=_TOS_HEAD_PT, bold=True)
    _cell_text(top[4], 'WEIGHT (%) **', size=_TOS_HEAD_PT, bold=True)
    _cell_text(top[last], 'TOTAL NO. OF POINTS', size=_TOS_HEAD_PT, bold=True)
    _cell_text(sub[2], 'A*', size=_TOS_HEAD_PT, bold=True)
    _cell_text(sub[3], 'B*', size=_TOS_HEAD_PT, bold=True)

    bloom_col = 5
    for key in BLOOM_KEYS:
        _cell_text(top[bloom_col], key.upper(), size=_TOS_BLOOM_PT, bold=True)
        _cell_text(top[bloom_col + 1], '%', size=_TOS_BLOOM_PT, bold=True)
        bloom_col += 2

    top[0].merge(sub[0])
    top[1].merge(sub[1])
    top[2].merge(top[3])
    top[4].merge(sub[4])
    top[last].merge(sub[last])
    bloom_col = 5
    for _ in BLOOM_KEYS:
        top[bloom_col].merge(sub[bloom_col])
        top[bloom_col + 1].merge(sub[bloom_col + 1])
        bloom_col += 2

    for row in table.rows[:3]:
        _repeat_header_row(row)

    # ── Topic rows ────────────────────────────────────────────────────────
    for topic in topics:
        cells = table.add_row().cells
        _cell_text(cells[0], topic.get('topic'), size=_TOS_GRID_PT)
        _cell_text(
            cells[1],
            ', '.join(_text(ilo) for ilo in (topic.get('ilos') or []) if _text(ilo)),
            size=_TOS_GRID_PT,
        )
        _cell_text(cells[2], _tos_number(topic.get('hours_class')), size=_TOS_GRID_PT)
        _cell_text(cells[3], _tos_number(topic.get('hours_min')), size=_TOS_GRID_PT)
        _cell_text(cells[4], _tos_number(topic.get('weight')), size=_TOS_GRID_PT)

        items = _tos_mapping(topic.get('bloom_items'))
        percentages = _tos_mapping(topic.get('bloom_pct'))
        bloom_col = 5
        for key in BLOOM_KEYS:
            _cell_text(cells[bloom_col], _tos_number(items.get(key)), size=_TOS_GRID_PT)
            _cell_text(cells[bloom_col + 1], _tos_number(percentages.get(key)), size=_TOS_GRID_PT)
            bloom_col += 2

        _cell_text(cells[last], _tos_number(topic.get('total_points')), size=_TOS_GRID_PT, bold=True)

    # ── Total row ─────────────────────────────────────────────────────────
    total_points = 0.0
    for topic in topics:
        try:
            total_points += float(topic.get('total_points') or 0)
        except (TypeError, ValueError):
            pass

    cells = table.add_row().cells
    _cell_text(cells[0], 'Total', size=_TOS_GRID_PT, bold=True, align=WD_ALIGN_PARAGRAPH.LEFT)
    _cell_text(cells[1], '', size=_TOS_GRID_PT, bold=True)
    _cell_text(cells[2], _tos_number(_tos_sum(topics, 'hours_class')), size=_TOS_GRID_PT, bold=True)
    _cell_text(cells[3], _tos_number(_tos_sum(topics, 'hours_min')), size=_TOS_GRID_PT, bold=True)
    _cell_text(cells[4], _tos_number(_tos_sum(topics, 'weight')), size=_TOS_GRID_PT, bold=True)

    bloom_col = 5
    for key in BLOOM_KEYS:
        item_sum = 0.0
        for topic in topics:
            try:
                item_sum += float(_tos_mapping(topic.get('bloom_items')).get(key) or 0)
            except (TypeError, ValueError):
                pass
        share = (item_sum / total_points) * 100 if total_points > 0 else 0
        _cell_text(cells[bloom_col], _tos_number(item_sum), size=_TOS_GRID_PT, bold=True)
        _cell_text(cells[bloom_col + 1], _tos_number(round(share, 1)), size=_TOS_GRID_PT, bold=True)
        bloom_col += 2

    _cell_text(cells[last], _tos_number(total_points), size=_TOS_GRID_PT, bold=True)

    _force_tos_table_geometry(table)
    for row in table.rows:
        for cell in row.cells:
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            for para in cell.paragraphs:
                if para.alignment is None:
                    para.alignment = WD_ALIGN_PARAGRAPH.CENTER


def _force_tos_table_geometry(table):
    """Pin fixed layout, tight margins, and full-width columns.

    Word otherwise redistributes the grid to fit its default cell padding,
    which pushes the right-hand Bloom columns past the page edge.
    """
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn

    total = sum(_TOS_COLUMN_WIDTHS)
    scale = _TOS_CONTENT_WIDTH_IN / total if total else 1
    widths = [value * scale for value in _TOS_COLUMN_WIDTHS]

    table.autofit = False
    table.allow_autofit = False
    properties = table._tbl.tblPr
    for tag in ('w:tblLayout', 'w:tblCellMar'):
        for existing in properties.findall(qn(tag)):
            properties.remove(existing)

    layout = OxmlElement('w:tblLayout')
    layout.set(qn('w:type'), 'fixed')
    properties.insert_element_before(layout, 'w:tblCellMar', 'w:tblLook')

    margins = OxmlElement('w:tblCellMar')
    for tag, inches in (('top', 0.02), ('left', 0.035), ('bottom', 0.02), ('right', 0.035)):
        element = OxmlElement(f'w:{tag}')
        element.set(qn('w:w'), str(int(inches * 1440)))
        element.set(qn('w:type'), 'dxa')
        margins.append(element)
    properties.insert_element_before(margins, 'w:tblLook')

    for index, width in enumerate(widths):
        table.columns[index].width = Inches(width)

    for row in table.rows:
        column = 0
        for tc in row._tr.tc_lst:
            span = tc.grid_span
            cell_width = sum(widths[column:column + span])
            tc_pr = tc.get_or_add_tcPr()
            tc_w = tc_pr.find(qn('w:tcW'))
            if tc_w is None:
                tc_w = OxmlElement('w:tcW')
                tc_pr.append(tc_w)
            tc_w.set(qn('w:w'), str(int(cell_width * 1440)))
            tc_w.set(qn('w:type'), 'dxa')
            column += span


def _add_tos_signatories(doc, exam):
    table = doc.add_table(rows=4, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False

    labels = ('Prepared by:', 'Checked and Verified by:', 'Approved by:')
    names = (
        _text(exam.get('preparedBy')),
        _text(exam.get('checkedBy')),
        _text(exam.get('approvedBy')),
    )
    roles = ('Instructor', 'Program Chair, BSIT', 'Dean, CICS')

    for index in range(3):
        _cell_text(table.rows[0].cells[index], labels[index], size=10, align=WD_ALIGN_PARAGRAPH.LEFT)
        _cell_text(table.rows[1].cells[index], names[index], size=10, bold=True, align=WD_ALIGN_PARAGRAPH.LEFT)
        _cell_text(table.rows[2].cells[index], roles[index], size=10, align=WD_ALIGN_PARAGRAPH.LEFT)
        _cell_text(table.rows[3].cells[index], 'Date:', size=10, align=WD_ALIGN_PARAGRAPH.LEFT)

    table.rows[1].height = Inches(0.4)
    _force_tos_table_geometry_widths(table, [_TOS_CONTENT_WIDTH_IN / 3] * 3)


def _force_tos_table_geometry_widths(table, widths):
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn

    table.autofit = False
    table.allow_autofit = False
    for index, width in enumerate(widths):
        table.columns[index].width = Inches(width)
    for row in table.rows:
        for index, cell in enumerate(row.cells):
            tc_pr = cell._tc.get_or_add_tcPr()
            tc_w = tc_pr.find(qn('w:tcW'))
            if tc_w is None:
                tc_w = OxmlElement('w:tcW')
                tc_pr.append(tc_w)
            tc_w.set(qn('w:w'), str(int(widths[index] * 1440)))
            tc_w.set(qn('w:type'), 'dxa')


def _add_tos_notes(doc):
    notes = (
        '*ILO - Intended Learning Outcomes',
        '*A - No. of hours the topic was covered in class',
        '*B - No. of minutes alloted to answer the test item/s',
        '**Weight (%) = (no. of  points for a given topic /total no. of points)* 100',
    )
    for note in notes:
        _tos_paragraph(doc, note, size=8, align=WD_ALIGN_PARAGRAPH.LEFT)


def _add_tos_form(doc, data, exam, branding, *, page_break=False):
    _render_tos_letterhead(doc, branding, page_break=page_break)

    _tos_paragraph(doc, 'TABLE OF SPECIFICATIONS', size=12, bold=True, before=2)
    _tos_paragraph(doc, _tos_exam_title(exam), size=12, bold=True)
    semester = _text(exam.get('semester')) or _text(data.get('semester_year'))
    if semester:
        _tos_paragraph(doc, semester, size=12, bold=True)

    _tos_paragraph(
        doc,
        f"COURSE CODE : {_text(data.get('course_code'))}",
        size=11, bold=True, align=WD_ALIGN_PARAGRAPH.LEFT, before=6,
    )
    _tos_paragraph(
        doc,
        f"COURSE TITLE: {_text(data.get('course_title'))}",
        size=11, bold=True, align=WD_ALIGN_PARAGRAPH.LEFT, before=2, after=4,
    )

    _add_tos_form_grid(doc, exam)
    _tos_paragraph(doc, '', size=2, before=2)
    _add_tos_signatories(doc, exam)
    _tos_paragraph(doc, '', size=2, before=2)
    _add_tos_notes(doc)


def build_tos_docx(data, branding=None):
    """Standalone Table of Specifications form, one page per examination."""
    from docx import Document

    exams = [
        exam for exam in (data.get('tos') or [])
        if isinstance(exam, dict)
        and (
            _text(exam.get('examLabel') or exam.get('examCode'))
            or any(_text(topic.get('topic')) for topic in (exam.get('topics') or []) if isinstance(topic, dict))
        )
    ]

    doc = Document()
    _set_tos_document_font(doc)
    _configure_tos_page(doc)
    for index, exam in enumerate(exams):
        _add_tos_form(doc, data, exam, branding or {}, page_break=index > 0)
    apply_page_header_footer(doc, {})
    return doc
