"""Generate filled sample sheets from the latest ArUco bubble template."""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pypdfium2 as pdfium
from PIL import Image

GEN_PATH = Path(r"c:\ATLAS\atlas-dev\backend\apps\grading\services\bubble_sheet_generator.py")
OUT_DIR = Path(r"c:\ATLAS\atlas-dev\backend\media\bubble_sheets\samples")
DPI = 300
ASSESSMENT_ID = "e2873094-12fb-411a-939f-722b377a337e"
TEMPLATE_ID = "4176a855-f1bc-4e81-93c8-fa5330b2e077"
TOTAL_ITEMS = 60
NUM_CHOICES = 4
FILL_SCALE = 0.88  # solid inner fill that stays inside the printed ring
CHOICES = "ABCD"

# Official key. Items 17 and 28 are D.
ANSWER_KEY = {
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

# 10 unanswered items on the 50% sheet (scattered across both columns).
PARTIAL_UNANSWERED = {4, 8, 16, 20, 24, 32, 40, 48, 54, 56}


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


def build_partial_responses() -> dict[str, str]:
    """30 correct (odds), 10 blank, 20 wrong. Score = 50%."""
    responses: dict[str, str] = {}
    for i in range(1, TOTAL_ITEMS + 1):
        if i in PARTIAL_UNANSWERED:
            continue
        key = ANSWER_KEY[str(i)]
        responses[str(i)] = key if i % 2 == 1 else wrong_choice(key)
    return responses


# Multi-mark items: 2+ bubbles shaded. Most include the correct letter and
# must still be scored incorrect. Item 36 is two wrong letters (not the key).
MULTI_MARKS = {
    "5": "AC",     # key A
    "9": "ABD",    # key D
    "12": "BC",    # key C
    "17": "AD",    # key D
    "22": "ACD",   # key C
    "28": "CD",    # key D
    "33": "BD",    # key B
    "36": "AB",    # key D (correct not shaded)
    "41": "AC",    # key C
    "45": "ABC",   # key A
    "50": "BD",    # key D
    "58": "CD",    # key C
}


def build_multimark_responses() -> dict[str, str]:
    """All other items correct and single-marked. Multi-marks are incorrect."""
    responses = dict(ANSWER_KEY)
    responses.update(MULTI_MARKS)
    return responses


# Mixed ambiguity: blanks, doubles, triples, and all-four fills.
# Scattered across both columns. Multi-marks are incorrect even if the
# key letter is among the shaded bubbles.
AMBIGUOUS_BLANK = {4, 11, 18, 26, 34, 42, 51, 59}
AMBIGUOUS_MARKS = {
    # 2 marks
    "6": "AC",      # key C — includes correct
    "15": "AB",     # key D — correct not shaded
    "23": "BD",     # key D — includes correct
    "31": "AB",     # key A — includes correct
    "47": "CD",     # key A — correct not shaded
    "55": "BC",     # key C — includes correct
    # 3 marks
    "8": "ABD",     # key C — correct not shaded
    "17": "ACD",    # key D — includes correct
    "28": "ABC",    # key D — correct not shaded
    "39": "ABD",    # key B — includes correct
    "45": "ABC",    # key A — includes correct
    "60": "BCD",    # key A — correct not shaded
    # 4 marks
    "2": "ABCD",    # key D
    "20": "ABCD",   # key C
    "37": "ABCD",   # key A
    "50": "ABCD",   # key D
}


def build_ambiguous_responses() -> dict[str, str]:
    """Correct singles plus blank / 2 / 3 / 4-mark ambiguous rows."""
    responses = dict(ANSWER_KEY)
    for i in AMBIGUOUS_BLANK:
        responses.pop(str(i), None)
    responses.update(AMBIGUOUS_MARKS)
    return responses


# Full mix: correct singles, wrong singles, blanks, and 2/3/4-mark rows.
MIXED_BLANK = {5, 14, 24, 33, 44, 54}
MIXED_WRONG = {2, 8, 11, 18, 20, 26, 31, 34, 39, 42, 47, 55}
MIXED_MARKS = {
    # 2 marks
    "6": "AC",      # key C — includes correct
    "15": "AB",     # key D — correct not shaded
    "29": "BD",     # key A — correct not shaded
    "40": "BC",     # key A — correct not shaded
    "48": "AD",     # key A — includes correct
    "59": "CD",     # key C — includes correct
    # 3 marks
    "9": "ABD",     # key D — includes correct
    "22": "ABC",    # key C — includes correct
    "36": "ACD",    # key D — includes correct
    "51": "BCD",    # key A — correct not shaded
    # 4 marks
    "12": "ABCD",   # key C
    "28": "ABCD",   # key D
    "45": "ABCD",   # key A
    "60": "ABCD",   # key A
}


def build_mixed_responses() -> dict[str, str]:
    """Correct + wrong singles, blanks, and 2/3/4-mark ambiguous rows."""
    responses = dict(ANSWER_KEY)
    for i in MIXED_BLANK:
        responses.pop(str(i), None)
    for i in MIXED_WRONG:
        responses[str(i)] = wrong_choice(ANSWER_KEY[str(i)])
    responses.update(MIXED_MARKS)
    return responses


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

    def _col(self, c, total, labels, start, x0, ix, bx, y0, layout, key):
        super()._col(c, total, labels, start, x0, ix, bx, y0, layout, key)
        ipc = (total + 1) // 2
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


def grade(responses: dict[str, str]) -> dict:
    correct, wrong, wrong_single, blank, multi = [], [], [], [], []
    multi_includes_correct = []
    by_count = {2: [], 3: [], 4: []}
    for i in range(1, TOTAL_ITEMS + 1):
        key = str(i)
        marks = parse_marks(responses.get(key))
        expected = ANSWER_KEY[key]
        if not marks:
            blank.append(i)
            continue
        if len(marks) >= 2:
            multi.append(i)
            wrong.append(i)
            if len(marks) in by_count:
                by_count[len(marks)].append(i)
            if expected in marks:
                multi_includes_correct.append(i)
            continue
        if marks[0] == expected:
            correct.append(i)
        else:
            wrong.append(i)
            wrong_single.append(i)
    return {
        "correct_count": len(correct),
        "wrong_count": len(wrong),
        "wrong_single_count": len(wrong_single),
        "blank_count": len(blank),
        "multi_mark_count": len(multi),
        "double_mark_count": len(by_count[2]),
        "triple_mark_count": len(by_count[3]),
        "quad_mark_count": len(by_count[4]),
        "score_pct": round(100.0 * len(correct) / TOTAL_ITEMS, 1),
        "correct_items": correct,
        "wrong_items": wrong,
        "wrong_single_items": wrong_single,
        "blank_items": blank,
        "multi_mark_items": multi,
        "double_mark_items": by_count[2],
        "triple_mark_items": by_count[3],
        "quad_mark_items": by_count[4],
        "multi_mark_includes_correct": multi_includes_correct,
    }


def write_sheet(stem: str, student_id: str, responses: dict[str, str], kind: str) -> None:
    template = SimpleNamespace(
        total_items=TOTAL_ITEMS,
        num_choices=NUM_CHOICES,
        layout_metadata={"num_id_columns": 8},
        assessment_id=ASSESSMENT_ID,
        template_id=TEMPLATE_ID,
    )
    svc = FilledGenerator(responses, student_id)
    pdf_bytes, layout = svc.generate(template)
    stats = grade(responses)

    pdf_path = OUT_DIR / f"{stem}.pdf"
    png_path = OUT_DIR / f"{stem}.png"
    layout_path = OUT_DIR / f"{stem}_layout.json"
    truth_path = OUT_DIR / f"{stem}_truth.json"
    pdf_path.write_bytes(pdf_bytes)

    img = pdf_to_png(pdf_bytes, DPI)
    img.save(png_path, "PNG", dpi=(DPI, DPI))
    layout_path.write_text(json.dumps(layout, indent=2), encoding="utf-8")
    truth_path.write_text(
        json.dumps(
            {
                "kind": kind,
                "student_id": student_id,
                "assessment_id": ASSESSMENT_ID,
                "template_id": TEMPLATE_ID,
                "total_items": TOTAL_ITEMS,
                "num_choices": NUM_CHOICES,
                "dpi": DPI,
                "fiducial_type": layout.get("fiducial_type"),
                "answer_key": ANSWER_KEY,
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

    print(f"{kind}: {student_id}")
    print(f"  PDF: {pdf_path} ({pdf_path.stat().st_size} bytes)")
    print(f"  PNG: {png_path} {img.size} @ {DPI} DPI")
    print(f"  score={stats['correct_count']}/{TOTAL_ITEMS} ({stats['score_pct']}%)")
    print(f"  correct={stats['correct_count']} wrong_single={stats['wrong_single_count']} blank={stats['blank_count']} multi={stats['multi_mark_count']}")
    print(f"  blank_items={stats['blank_items']}")
    print(f"  wrong_single_items={stats['wrong_single_items']}")
    print(f"  doubles={stats['double_mark_items']} triples={stats['triple_mark_items']} quads={stats['quad_mark_items']}")
    print(f"  multi_mark_items={stats['multi_mark_items']}")
    print(f"  multi_includes_correct={stats['multi_mark_includes_correct']}")
    print(f"  student_id bubbles={svc.id_filled}")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    write_sheet(
        "filled_perfect_23-38505",
        "23-38505",
        dict(ANSWER_KEY),
        "perfect",
    )
    write_sheet(
        "filled_perfect_23-37546",
        "23-37546",
        dict(ANSWER_KEY),
        "perfect",
    )
    write_sheet(
        "filled_perfect_23-32786",
        "23-32786",
        dict(ANSWER_KEY),
        "perfect",
    )
    write_sheet(
        "filled_partial_23-34875",
        "23-34875",
        build_partial_responses(),
        "partial_50pct",
    )
    write_sheet(
        "filled_multimark_23-35182",
        "23-35182",
        build_multimark_responses(),
        "multimark",
    )
    write_sheet(
        "filled_ambiguous_23-36417",
        "23-36417",
        build_ambiguous_responses(),
        "ambiguous",
    )
    write_sheet(
        "filled_mixed_23-37258",
        "23-37258",
        build_mixed_responses(),
        "mixed",
    )


if __name__ == "__main__":
    main()
