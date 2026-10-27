"""Generate shaded BAT 403 Midterm + Final sample sheets for OMR testing.

Uses the same student IDs as BAT 404. QR codes encode the assessment_id so
scans resolve to the seeded BAT 403 midterm/final templates.

Run:
  python generate_bat403_shaded_sheets.py
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pypdfium2 as pdfium
from PIL import Image

GEN_PATH = Path(r"c:\ATLAS\atlas-dev\backend\apps\grading\services\bubble_sheet_generator.py")
ROOT_OUT = Path(r"c:\ATLAS\sample_sheets")
DPI = 300
TOTAL_ITEMS = 60
NUM_CHOICES = 4
FILL_SCALE = 0.88
CHOICES = "ABCD"

# Stable IDs — must match seed_bat403_bubble_exams management command.
COURSE_ID = "77aad1cf-b19f-4912-acbe-c4ab64e31d89"
MIDTERM_ASSESSMENT_ID = "a4031111-1111-4111-a111-111111111111"
FINAL_ASSESSMENT_ID = "a4032222-2222-4222-a222-222222222222"
MIDTERM_TEMPLATE_ID = "b4031111-1111-4111-b111-111111111111"
FINAL_TEMPLATE_ID = "b4032222-2222-4222-b222-222222222222"

STUDENT_IDS = [
    "23-40203",
    "23-32786",
    "23-40204",
    "23-40103",
    "23-39515",
    "23-34875",
    "23-36417",
    "23-40202",
    "23-37546",
    "23-40105",
    "23-35182",
    "23-40101",
    "23-37258",
    "23-40205",
    "23-40201",
    "23-38505",
    "23-37187",
    "23-36005",
    "23-40102",
    "23-37502",
    "23-40104",
]

# Midterm key (same structure as BAT 404 prelim sample key).
MIDTERM_KEY = {
    "1": "B", "2": "D", "3": "A", "4": "D", "5": "A",
    "6": "C", "7": "A", "8": "C", "9": "D", "10": "A",
    "11": "A", "12": "C", "13": "C", "14": "A", "15": "D",
    "16": "B", "17": "D", "18": "D", "19": "C", "20": "C",
    "21": "A", "22": "C", "23": "D", "24": "C", "25": "A",
    "26": "B", "27": "C", "28": "D", "29": "A", "30": "A",
    "31": "A", "32": "C", "33": "B", "34": "A", "35": "A",
    "36": "D", "37": "A", "38": "A", "39": "B", "40": "A",
    "41": "C", "42": "A", "43": "B", "44": "A", "45": "A",
    "46": "A", "47": "A", "48": "A", "49": "A", "50": "D",
    "51": "A", "52": "A", "53": "B", "54": "D", "55": "C",
    "56": "A", "57": "A", "58": "C", "59": "C", "60": "A",
}

# Final key — rotated so midterm vs final score differently.
FINAL_KEY = {
    str(i): CHOICES[(CHOICES.index(MIDTERM_KEY[str(i)]) + 1) % len(CHOICES)]
    for i in range(1, TOTAL_ITEMS + 1)
}

PARTIAL_UNANSWERED = {4, 8, 16, 20, 24, 32, 40, 48, 54, 56}
MULTI_MARKS = {
    "5": "AC", "9": "ABD", "12": "BC", "17": "AD", "22": "ACD",
    "28": "CD", "33": "BD", "36": "AB", "41": "AC", "45": "ABC",
    "50": "BD", "58": "CD",
}
AMBIGUOUS_BLANK = {4, 11, 18, 26, 34, 42, 51, 59}
AMBIGUOUS_MARKS = {
    "6": "AC", "15": "AB", "23": "BD", "31": "AB", "47": "CD", "55": "BC",
    "8": "ABD", "17": "ACD", "28": "ABC", "39": "ABD", "45": "ABC", "60": "BCD",
    "2": "ABCD", "20": "ABCD", "37": "ABCD", "50": "ABCD",
}
MIXED_BLANK = {5, 14, 24, 33, 44, 54}
MIXED_WRONG = {2, 8, 11, 18, 20, 26, 31, 34, 39, 42, 47, 55}
MIXED_MARKS = {
    "6": "AC", "15": "AB", "29": "BD", "40": "BC", "48": "AD", "59": "CD",
    "9": "ABD", "22": "ABC", "36": "ACD", "51": "BCD",
    "12": "ABCD", "28": "ABCD", "45": "ABCD", "60": "ABCD",
}

# Cycle of shading scenarios across the 21 students.
KINDS = [
    "perfect",
    "partial_50pct",
    "multimark",
    "ambiguous",
    "mixed",
    "zero",
    "all_wrong",
]


spec = importlib.util.spec_from_file_location("bubble_sheet_generator", GEN_PATH)
gen = importlib.util.module_from_spec(spec)
sys.modules["bubble_sheet_generator"] = gen
spec.loader.exec_module(gen)


def wrong_choice(correct: str) -> str:
    return CHOICES[(CHOICES.index(correct) + 1) % len(CHOICES)]


def parse_marks(raw) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, (list, tuple)):
        chars = "".join(str(x) for x in raw)
    else:
        chars = str(raw)
    chars = chars.upper().replace(",", "").replace("+", "").replace("|", "").replace(" ", "")
    return [ch for ch in chars if ch in CHOICES]


def build_responses(kind: str, answer_key: dict[str, str]) -> dict[str, str]:
    if kind == "perfect":
        return dict(answer_key)
    if kind == "zero":
        return {}
    if kind == "all_wrong":
        return {k: wrong_choice(v) for k, v in answer_key.items()}
    if kind == "partial_50pct":
        responses: dict[str, str] = {}
        for i in range(1, TOTAL_ITEMS + 1):
            if i in PARTIAL_UNANSWERED:
                continue
            key = answer_key[str(i)]
            responses[str(i)] = key if i % 2 == 1 else wrong_choice(key)
        return responses
    if kind == "multimark":
        responses = dict(answer_key)
        responses.update(MULTI_MARKS)
        return responses
    if kind == "ambiguous":
        responses = dict(answer_key)
        for i in AMBIGUOUS_BLANK:
            responses.pop(str(i), None)
        responses.update(AMBIGUOUS_MARKS)
        return responses
    if kind == "mixed":
        responses = dict(answer_key)
        for i in MIXED_BLANK:
            responses.pop(str(i), None)
        for i in MIXED_WRONG:
            responses[str(i)] = wrong_choice(answer_key[str(i)])
        responses.update(MIXED_MARKS)
        return responses
    raise ValueError(f"unknown kind: {kind}")


class FilledGenerator(gen.BubbleSheetGeneratorService):
    def __init__(self, answers: dict[str, str], student_id: str):
        self.answers = answers
        self.student_id = student_id
        self.skipped: list[str] = []
        self.filled: list[str] = []
        self.id_filled: list[str] = []

    def _fill_circle(self, c, cx_mm: float, cy_spec_mm: float, r_mm: float) -> None:
        c.setFillColorRGB(0, 0, 0)
        c.circle(
            gen.mm2pt(cx_mm),
            gen.mm2pt(gen._sy(cy_spec_mm)),
            gen.mm2pt(r_mm) * FILL_SCALE,
            stroke=0,
            fill=1,
        )

    def _col(self, c, total, labels, start, x0, ix, bx, y0, layout, key, ipc, col_w, item_w):
        super()._col(c, total, labels, start, x0, ix, bx, y0, layout, key, ipc, col_w, item_w)
        for ri in range(ipc):
            ino = start + ri
            if ino > total:
                break
            marks = parse_marks(self.answers.get(str(ino)))
            if not marks:
                self.skipped.append(f"{ino}=blank")
                continue
            item = layout["items"].get(str(ino), {})
            filled_here = []
            for ans in marks:
                pos = item.get(ans)
                if not pos:
                    self.skipped.append(f"{ino}={ans}")
                    continue
                self._fill_circle(c, pos["cx_mm"], pos["cy_spec_mm"], gen.BUBBLE_R)
                filled_here.append(ans)
            if filled_here:
                self.filled.append(f"{ino}={''.join(filled_here)}")

    def _draw_left_zone(self, c, template, ncols, y0, layout):
        super()._draw_left_zone(c, template, ncols, y0, layout)
        comb_yt = y0 + gen.QR_SIZE + 10
        id_grid_yt = comb_yt + gen.COMB_H + 6
        sid = self.student_id[:ncols]
        for i, ch in enumerate(sid):
            if ch not in gen.ID_LABELS:
                continue
            r = gen.ID_LABELS.index(ch)
            cx = gen.ID_CENTRES[i]
            cy = id_grid_yt + 2.5 + r * gen.ID_ROW_PITCH
            self._fill_circle(c, cx, cy, gen.ID_BUBBLE_R)
            bx_mm = gen.COMB_X0 + i * (gen.COMB_W + gen.COMB_GAP)
            c.setFillColorRGB(0, 0, 0)
            c.setFont(gen.FONT_B, 11)
            c.drawCentredString(
                gen.mm2pt(bx_mm + gen.COMB_W / 2),
                gen.mm2pt(gen._sy(comb_yt + gen.COMB_H - 1.6)),
                ch,
            )
            self.id_filled.append(f"col{i}={ch}")


def pdf_to_png(pdf_bytes: bytes, dpi: int) -> Image.Image:
    doc = pdfium.PdfDocument(pdf_bytes)
    page = doc[0]
    scale = dpi / 72.0
    bitmap = page.render(scale=scale, rev_byteorder=True)
    return bitmap.to_pil().convert("RGB")


def grade(responses: dict[str, str], answer_key: dict[str, str]) -> dict:
    correct, wrong, blank, multi = [], [], [], []
    for i in range(1, TOTAL_ITEMS + 1):
        key = str(i)
        marks = parse_marks(responses.get(key))
        expected = answer_key[key]
        if not marks:
            blank.append(i)
            continue
        if len(marks) >= 2:
            multi.append(i)
            wrong.append(i)
            continue
        if marks[0] == expected:
            correct.append(i)
        else:
            wrong.append(i)
    return {
        "correct_count": len(correct),
        "wrong_count": len(wrong),
        "blank_count": len(blank),
        "multi_mark_count": len(multi),
        "score_pct": round(100.0 * len(correct) / TOTAL_ITEMS, 1),
        "correct_items": correct,
        "wrong_items": wrong,
        "blank_items": blank,
        "multi_mark_items": multi,
    }


def write_sheet(
    out_dir: Path,
    exam: str,
    student_id: str,
    kind: str,
    assessment_id: str,
    template_id: str,
    answer_key: dict[str, str],
) -> None:
    responses = build_responses(kind, answer_key)
    template = SimpleNamespace(
        total_items=TOTAL_ITEMS,
        num_choices=NUM_CHOICES,
        layout_metadata={"num_id_columns": 8},
        assessment_id=assessment_id,
        template_id=template_id,
    )
    svc = FilledGenerator(responses, student_id)
    pdf_bytes, layout = svc.generate(template)
    stats = grade(responses, answer_key)

    stem = f"{student_id}_{kind}"
    pdf_path = out_dir / f"{stem}.pdf"
    png_path = out_dir / f"{stem}.png"
    truth_path = out_dir / f"{stem}_truth.json"

    pdf_path.write_bytes(pdf_bytes)
    img = pdf_to_png(pdf_bytes, DPI)
    img.save(png_path, "PNG", dpi=(DPI, DPI))
    truth_path.write_text(
        json.dumps(
            {
                "exam": exam,
                "kind": kind,
                "student_id": student_id,
                "course_id": COURSE_ID,
                "assessment_id": assessment_id,
                "template_id": template_id,
                "total_items": TOTAL_ITEMS,
                "num_choices": NUM_CHOICES,
                "dpi": DPI,
                "fiducial_type": layout.get("fiducial_type"),
                "answer_key": answer_key,
                "responses": {
                    str(i): "".join(parse_marks(responses.get(str(i))))
                    for i in range(1, TOTAL_ITEMS + 1)
                },
                "filled": svc.filled,
                "skipped": svc.skipped,
                "id_filled": svc.id_filled,
                **stats,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        f"  {exam:7} {student_id} {kind:14} "
        f"{stats['correct_count']:2}/{TOTAL_ITEMS} ({stats['score_pct']:5.1f}%) -> {png_path.name}"
    )


def main() -> None:
    exams = [
        (
            "midterm",
            ROOT_OUT / "BAT403_Midterm",
            MIDTERM_ASSESSMENT_ID,
            MIDTERM_TEMPLATE_ID,
            MIDTERM_KEY,
        ),
        (
            "final",
            ROOT_OUT / "BAT403_Final",
            FINAL_ASSESSMENT_ID,
            FINAL_TEMPLATE_ID,
            FINAL_KEY,
        ),
    ]
    for exam, out_dir, aid, tid, key in exams:
        out_dir.mkdir(parents=True, exist_ok=True)
        print(f"\n=== BAT 403 {exam.upper()} -> {out_dir}")
        for i, sid in enumerate(STUDENT_IDS):
            kind = KINDS[i % len(KINDS)]
            write_sheet(out_dir, exam, sid, kind, aid, tid, key)
    print(f"\nDone. {len(STUDENT_IDS)} students x 2 exams.")


if __name__ == "__main__":
    main()
