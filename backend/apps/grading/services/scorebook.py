"""Section scorebook for major examinations.

Rows are the student IDs on one section. Columns are the scanned major
examinations for that course: answer sheets made on the web, and major
examinations made in the mobile app. Quizzes are left out.
"""

from __future__ import annotations

import hashlib
import io
from xml.sax.saxutils import escape

from apps.grading.models import (
    BubbleSheetScan,
    BubbleSheetTemplate,
    QuickExam,
    QuickExamScan,
)
from apps.integrations.models import AssessmentItem, Block

MAROON = "8E1C1B"


def _is_quiz(*parts) -> bool:
    text = " ".join(str(part or "") for part in parts).lower()
    return "quiz" in text


def _plain_number(value):
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number.is_integer():
        return int(number)
    return round(number, 2)


def _subject_matches_course(subject_name: str, course) -> bool:
    """Same match the mobile app uses to attach a major exam to a course."""
    name = (subject_name or "").strip().lower()
    code = (course.course_code or "").strip().lower()
    title = (course.course_title or "").strip().lower()
    if not code or not name:
        return False
    if (
        name == code
        or name.startswith(f"{code} ")
        or name.startswith(f"{code}–")
        or name.startswith(f"{code}-")
        or name.startswith(f"{code} –")
    ):
        return True
    if title and title in name:
        return True
    return code in name


def _stamp(scan):
    return (scan.updated_at or scan.created_at, scan.created_at, str(scan.pk))


def _keep_latest(found: dict, key, scan):
    current = found.get(key)
    if current is None or _stamp(scan) >= _stamp(current):
        found[key] = scan


def _assign_labels(exams: list[dict]) -> None:
    totals: dict[str, int] = {}
    for exam in exams:
        totals[exam["name"]] = totals.get(exam["name"], 0) + 1
    proposed = []
    for exam in exams:
        label = exam["name"]
        if totals[label] > 1:
            source = "Mobile" if exam["source"] == "mobile" else "Web"
            label = f"{exam['name']} ({source})"
        proposed.append(label)
    counts: dict[str, int] = {}
    for label in proposed:
        counts[label] = counts.get(label, 0) + 1
    seen: dict[str, int] = {}
    for exam, label in zip(exams, proposed):
        if counts[label] > 1:
            seen[label] = seen.get(label, 0) + 1
            exam["name"] = f"{label} {seen[label]}"
        else:
            exam["name"] = label


def _cell(scan, max_score):
    if scan is None:
        return {"score": None, "max_score": max_score, "flagged": False, "updated_at": None}
    return {
        "score": _plain_number(scan.score_raw),
        "max_score": _plain_number(scan.max_score) if scan.max_score is not None else max_score,
        "flagged": bool(scan.is_flagged),
        "updated_at": (scan.updated_at or scan.created_at).isoformat(),
    }


def _revision(exams, students) -> str:
    parts = []
    for exam in exams:
        parts.append(exam["exam_id"])
    for student in students:
        parts.append(student["student_id"])
        for exam in exams:
            cell = student["scores"][exam["exam_id"]]
            parts.append(f"{cell['score']}|{cell['flagged']}|{cell['updated_at']}")
    return hashlib.sha1("|".join(parts).encode()).hexdigest()[:16]


def build_scorebook(faculty, course, section) -> dict:
    student_ids = list(
        Block.objects.filter(section_id=section.section_id)
        .order_by("student_id")
        .values_list("student_id", flat=True)
    )

    templates = list(
        BubbleSheetTemplate.objects.filter(course_id=course.pk)
        .select_related("assessment")
        .order_by("created_at", "name")
    )
    assessment_ids = [template.assessment_id for template in templates if template.assessment_id]
    mobile_made = set()
    if assessment_ids:
        mobile_made = set(
            AssessmentItem.objects.filter(
                assessment_id__in=assessment_ids,
                rubric__created_via="mobile",
            ).values_list("assessment_id", flat=True).distinct()
        )
    bubble_exams = []
    for template in templates:
        assessment = template.assessment if template.assessment_id else None
        if _is_quiz(
            template.name,
            getattr(assessment, "title", None),
            getattr(assessment, "assessment_type", None),
        ):
            continue
        title = ""
        if assessment is not None:
            title = (assessment.title or "").strip()
        name = title or (template.name or "").strip() or "Examination"
        bubble_exams.append({
            "exam_id": f"bubble:{template.template_id}",
            "template_id": template.template_id,
            "name": name,
            "source": "mobile" if template.assessment_id in mobile_made else "web",
            "sheet": "bubble",
            "max_score": template.total_items or None,
            "created_at": template.created_at,
        })

    mobile_rows = list(
        QuickExam.objects.filter(faculty=faculty).select_related("subject").order_by("created_at", "name")
    )
    mobile_exams = []
    for exam in mobile_rows:
        subject_name = exam.subject.name if exam.subject_id else ""
        if not _subject_matches_course(subject_name, course):
            continue
        if _is_quiz(exam.name):
            continue
        mobile_exams.append({
            "exam_id": f"mobile:{exam.exam_id}",
            "quick_id": exam.exam_id,
            "name": (exam.name or "").strip() or "Examination",
            "source": "mobile",
            "sheet": "quick",
            "max_score": exam.total_items or None,
            "created_at": exam.created_at,
        })

    exams = bubble_exams + mobile_exams
    _assign_labels(exams)

    latest_web = {}
    latest_mobile = {}
    if student_ids and bubble_exams:
        scans = BubbleSheetScan.objects.filter(
            template_id__in=[exam["template_id"] for exam in bubble_exams],
            student_identifier__in=student_ids,
        )
        for scan in scans:
            if not scan.student_identifier:
                continue
            _keep_latest(latest_web, (scan.template_id, scan.student_identifier), scan)
    if student_ids and mobile_exams:
        scans = QuickExamScan.objects.filter(
            exam_id__in=[exam["quick_id"] for exam in mobile_exams],
            student_identifier__in=student_ids,
        )
        for scan in scans:
            if not scan.student_identifier:
                continue
            _keep_latest(latest_mobile, (scan.exam_id, scan.student_identifier), scan)

    students = []
    for student_id in student_ids:
        scores = {}
        for exam in exams:
            if exam["sheet"] == "bubble":
                scan = latest_web.get((exam["template_id"], student_id))
            else:
                scan = latest_mobile.get((exam["quick_id"], student_id))
            scores[exam["exam_id"]] = _cell(scan, exam["max_score"])
        students.append({"student_id": student_id, "scores": scores})

    public_exams = [
        {
            "exam_id": exam["exam_id"],
            "name": exam["name"],
            "source": exam["source"],
            "max_score": exam["max_score"],
        }
        for exam in exams
    ]
    return {
        "course": {
            "course_id": str(course.pk),
            "course_code": course.course_code or "",
            "course_title": course.course_title or "",
        },
        "section": {
            "section_id": str(section.section_id),
            "section_name": section.section_name,
        },
        "exams": public_exams,
        "students": students,
        "revision": _revision(public_exams, students),
    }


def exam_heading(exam) -> str:
    max_score = exam.get("max_score")
    if max_score:
        return f"{exam['name']} ({_plain_number(max_score)})"
    return exam["name"]


def _safe_filename(course, section, ext: str) -> str:
    def safe(value):
        text = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in (value or "").strip())
        return text.strip("_")[:40]

    code = safe(course.get("course_code")) or "course"
    sec = safe(section.get("section_name")) or "section"
    return f"{code}_{sec}_scores.{ext}"


def _title(book) -> str:
    course = book.get("course") or {}
    section = book.get("section") or {}
    code = (course.get("course_code") or "").strip()
    title = (course.get("course_title") or "").strip()
    subject = f"{code} {title}".strip() or "Course"
    name = (section.get("section_name") or "").strip() or "Section"
    return f"{subject} — {name}"


def _table_rows(book):
    exams = book.get("exams") or []
    header = ["Student ID"] + [exam_heading(exam) for exam in exams]
    rows = [header]
    for student in book.get("students") or []:
        scores = student.get("scores") or {}
        values = [student.get("student_id") or ""]
        for exam in exams:
            cell = scores.get(exam["exam_id"]) or {}
            score = cell.get("score")
            values.append("" if score is None else score)
        rows.append(values)
    return rows


def export_scorebook(book, fmt: str) -> tuple[bytes, str, str]:
    fmt = (fmt or "").lower()
    if fmt == "docx":
        data = _docx(book)
        content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif fmt == "pdf":
        data = _pdf(book)
        content_type = "application/pdf"
    elif fmt == "xlsx":
        data = _xlsx(book)
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        raise ValueError(fmt)
    filename = _safe_filename(book.get("course") or {}, book.get("section") or {}, fmt)
    return data, content_type, filename


def _shade_cell(cell, hex_color: str):
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn

    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), hex_color)
    shd.set(qn("w:val"), "clear")
    tc_pr.append(shd)


def _write_cell(cell, text, *, bold=False, color=None, size=10, center=False):
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt, RGBColor

    cell.text = ""
    paragraph = cell.paragraphs[0]
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER if center else WD_ALIGN_PARAGRAPH.LEFT
    run = paragraph.add_run("" if text is None else str(text))
    run.bold = bold
    run.font.size = Pt(size)
    run.font.name = "Calibri"
    if color:
        run.font.color.rgb = RGBColor(*color)


def _docx(book) -> bytes:
    from docx import Document
    from docx.enum.section import WD_ORIENT
    from docx.shared import Inches, Pt, RGBColor

    doc = Document()
    section = doc.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width, section.page_height = section.page_height, section.page_width
    section.left_margin = Inches(0.6)
    section.right_margin = Inches(0.6)
    section.top_margin = Inches(0.6)
    section.bottom_margin = Inches(0.6)

    heading = doc.add_paragraph()
    run = heading.add_run(_title(book))
    run.bold = True
    run.font.size = Pt(16)
    run.font.color.rgb = RGBColor(0x8E, 0x1C, 0x1B)
    run.font.name = "Calibri"

    rows = _table_rows(book)
    table = doc.add_table(rows=len(rows), cols=len(rows[0]))
    table.style = "Table Grid"
    table.autofit = True
    for r_index, row in enumerate(rows):
        for c_index, value in enumerate(row):
            cell = table.cell(r_index, c_index)
            header = r_index == 0
            _write_cell(
                cell,
                value,
                bold=header or c_index == 0,
                color=(255, 255, 255) if header else None,
                size=10 if header else 11,
                center=c_index > 0,
            )
            if header:
                _shade_cell(cell, MAROON)

    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def _xlsx(book) -> bytes:
    import openpyxl
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Scores"
    rows = _table_rows(book)
    width = len(rows[0])

    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=width)
    title_cell = ws.cell(1, 1, _title(book))
    title_cell.font = Font(name="Calibri", bold=True, size=14, color=MAROON)
    title_cell.alignment = Alignment(vertical="center")
    ws.row_dimensions[1].height = 22

    header_fill = PatternFill("solid", fgColor=MAROON)
    header_font = Font(name="Calibri", bold=True, size=11, color="FFFFFF")
    body_font = Font(name="Calibri", size=11)
    id_font = Font(name="Calibri", size=11, bold=True)
    thin = Border(
        left=Side(style="thin", color="D0D0D0"),
        right=Side(style="thin", color="D0D0D0"),
        top=Side(style="thin", color="D0D0D0"),
        bottom=Side(style="thin", color="D0D0D0"),
    )
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    left = Alignment(horizontal="left", vertical="center")

    for c_index, value in enumerate(rows[0], start=1):
        cell = ws.cell(2, c_index, value)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center
        cell.border = thin
    for r_index, row in enumerate(rows[1:], start=3):
        for c_index, value in enumerate(row, start=1):
            cell = ws.cell(r_index, c_index, None if value == "" else value)
            cell.font = id_font if c_index == 1 else body_font
            cell.alignment = left if c_index == 1 else center
            cell.border = thin

    for c_index, value in enumerate(rows[0], start=1):
        letter = get_column_letter(c_index)
        ws.column_dimensions[letter].width = max(14, min(28, len(str(value)) + 4))
    ws.column_dimensions["A"].width = 16
    ws.freeze_panes = "B3"
    ws.auto_filter.ref = f"A2:{get_column_letter(width)}{max(2, 2 + len(rows) - 1)}"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.oddHeader.left.text = _title(book)
    ws.print_title_rows = "1:2"

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def _pdf(book) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=28,
        rightMargin=28,
        topMargin=28,
        bottomMargin=28,
        title=_title(book),
    )
    rows = _table_rows(book)
    title_style = ParagraphStyle(
        "scoreTitle",
        fontName="Helvetica-Bold",
        fontSize=13,
        textColor=colors.HexColor("#8E1C1B"),
        leading=16,
        spaceAfter=8,
    )
    header_style = ParagraphStyle(
        "scoreHead",
        fontName="Helvetica-Bold",
        fontSize=8,
        textColor=colors.white,
        alignment=TA_CENTER,
        leading=10,
    )
    id_style = ParagraphStyle(
        "scoreId",
        fontName="Helvetica-Bold",
        fontSize=8,
        alignment=TA_LEFT,
        leading=10,
    )
    score_style = ParagraphStyle(
        "scoreCell",
        fontName="Helvetica",
        fontSize=8,
        alignment=TA_CENTER,
        leading=10,
    )

    data = []
    for r_index, row in enumerate(rows):
        styled = []
        for c_index, value in enumerate(row):
            text = escape("" if value is None else str(value))
            if r_index == 0:
                styled.append(Paragraph(text, header_style))
            elif c_index == 0:
                styled.append(Paragraph(text, id_style))
            else:
                styled.append(Paragraph(text, score_style))
        data.append(styled)

    page_width = landscape(A4)[0] - 56
    exam_count = max(1, len(rows[0]) - 1)
    id_width = 78
    exam_width = max(48, (page_width - id_width) / exam_count)
    col_widths = [id_width] + [exam_width] * (len(rows[0]) - 1)

    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#8E1C1B")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (1, 1), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D0D0D0")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F4F4")]),
    ]))
    doc.build([Paragraph(escape(_title(book)), title_style), Spacer(1, 6), table])
    return buffer.getvalue()
