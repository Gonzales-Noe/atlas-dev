"""Shade the real BAT 403 Sample midterm/final blanks for OMR testing.

Uses the blank PDFs in c:\\ATLAS\\Sample\\ (Quick Exam QR preserved) and fills
student-ID + answer bubbles for the same 21 student IDs used elsewhere.

Run:
  python fill_bat403_from_sample.py
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np
import pypdfium2 as pdfium
from PIL import Image, ImageDraw

GEN_PATH = Path(r"c:\ATLAS\atlas-dev\backend\apps\grading\services\bubble_sheet_generator.py")
SAMPLE_DIR = Path(r"c:\ATLAS\Sample")
ROOT_OUT = Path(r"c:\ATLAS\sample_sheets")
DPI = 300
MM = 25.4
TOTAL_ITEMS = 50
NUM_CHOICES = 4
FILL_SCALE = 0.88
CHOICES = "ABCD"

MIDTERM_BLANK = SAMPLE_DIR / "Midterms answer sheet.pdf"
FINAL_BLANK = SAMPLE_DIR / "Final Exam answer sheet.pdf"

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

# Same structure as other sample keys, truncated to 50 items for these sheets.
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
}

FINAL_KEY = {
    str(i): CHOICES[(CHOICES.index(MIDTERM_KEY[str(i)]) + 1) % len(CHOICES)]
    for i in range(1, TOTAL_ITEMS + 1)
}

PARTIAL_UNANSWERED = {4, 8, 16, 20, 24, 32, 40, 48}
MULTI_MARKS = {
    "5": "AC", "9": "ABD", "12": "BC", "17": "AD", "22": "ACD",
    "28": "CD", "33": "BD", "36": "AB", "41": "AC", "45": "ABC",
    "50": "BD",
}
AMBIGUOUS_BLANK = {4, 11, 18, 26, 34, 42}
AMBIGUOUS_MARKS = {
    "6": "AC", "15": "AB", "23": "BD", "31": "AB", "47": "CD",
    "8": "ABD", "17": "ACD", "28": "ABC", "39": "ABD", "45": "ABC",
    "2": "ABCD", "20": "ABCD", "37": "ABCD", "50": "ABCD",
}
MIXED_BLANK = {5, 14, 24, 33, 44}
MIXED_WRONG = {2, 8, 11, 18, 20, 26, 31, 34, 39, 42, 47}
MIXED_MARKS = {
    "6": "AC", "15": "AB", "29": "BD", "40": "BC", "48": "AD",
    "9": "ABD", "22": "ABC", "36": "ACD",
    "12": "ABCD", "28": "ABCD", "45": "ABCD",
}

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


def mm_to_px(cx_mm: float, cy_spec_mm: float) -> tuple[float, float]:
    return cx_mm / MM * DPI, cy_spec_mm / MM * DPI


def render_blank(pdf_path: Path) -> Image.Image:
    doc = pdfium.PdfDocument(str(pdf_path))
    page = doc[0]
    bitmap = page.render(scale=DPI / 72.0, rev_byteorder=True)
    return bitmap.to_pil().convert("RGB")


def decode_qr(img: Image.Image) -> str | None:
    arr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    data, _, _ = cv2.QRCodeDetector().detectAndDecode(arr)
    return data or None


def build_layout() -> dict:
    template = SimpleNamespace(
        total_items=TOTAL_ITEMS,
        num_choices=NUM_CHOICES,
        layout_metadata={"num_id_columns": 8},
        assessment_id="layout-only",
        template_id="layout-only",
    )
    _, layout = gen.BubbleSheetGeneratorService().generate(template)
    return layout


def id_bubble_positions(layout: dict) -> dict[tuple[int, str], tuple[float, float]]:
    """Map (col_index, label) -> (cx_mm, cy_spec_mm)."""
    y0 = layout["left_zone"]["y_start_spec_mm"]
    comb_yt = y0 + gen.QR_SIZE + 10
    id_grid_yt = comb_yt + gen.COMB_H + 6
    out: dict[tuple[int, str], tuple[float, float]] = {}
    for col, cx in enumerate(gen.ID_CENTRES[:8]):
        for r, lab in enumerate(gen.ID_LABELS):
            cy = id_grid_yt + 2.5 + r * gen.ID_ROW_PITCH
            out[(col, lab)] = (cx, cy)
    return out


def comb_centers(layout: dict) -> list[tuple[float, float]]:
    """Centers for handwritten-style comb digits (mm)."""
    y0 = layout["left_zone"]["y_start_spec_mm"]
    comb_yt = y0 + gen.QR_SIZE + 10
    centers = []
    for i in range(8):
        bx_mm = gen.COMB_X0 + i * (gen.COMB_W + gen.COMB_GAP)
        cx = bx_mm + gen.COMB_W / 2
        cy = comb_yt + gen.COMB_H - 1.6
        centers.append((cx, cy))
    return centers


def fill_circle(draw: ImageDraw.ImageDraw, cx_mm: float, cy_spec_mm: float, r_mm: float) -> None:
    x, y = mm_to_px(cx_mm, cy_spec_mm)
    r = r_mm / MM * DPI * FILL_SCALE
    draw.ellipse([x - r, y - r, x + r, y + r], fill=(0, 0, 0))


def shade_sheet(
    blank: Image.Image,
    layout: dict,
    student_id: str,
    responses: dict[str, str],
) -> tuple[Image.Image, list[str], list[str], list[str]]:
    img = blank.copy()
    draw = ImageDraw.Draw(img)
    filled: list[str] = []
    skipped: list[str] = []
    id_filled: list[str] = []

    id_pos = id_bubble_positions(layout)
    sid = student_id[:8]
    for i, ch in enumerate(sid):
        if ch not in gen.ID_LABELS:
            skipped.append(f"id_col{i}={ch}")
            continue
        cx, cy = id_pos[(i, ch)]
        fill_circle(draw, cx, cy, gen.ID_BUBBLE_R)
        id_filled.append(f"col{i}={ch}")

    # Comb field characters (visual match to printed sheets).
    try:
        from PIL import ImageFont

        font = ImageFont.truetype("arial.ttf", 28)
    except Exception:
        font = ImageFont.load_default()
    for i, ch in enumerate(sid):
        cx, cy = comb_centers(layout)[i]
        x, y = mm_to_px(cx, cy)
        draw.text((x, y), ch, fill=(0, 0, 0), font=font, anchor="mm")

    for ino in range(1, TOTAL_ITEMS + 1):
        marks = parse_marks(responses.get(str(ino)))
        if not marks:
            skipped.append(f"{ino}=blank")
            continue
        item = layout["items"][str(ino)]
        filled_here = []
        for ans in marks:
            pos = item.get(ans)
            if not pos:
                skipped.append(f"{ino}={ans}")
                continue
            fill_circle(draw, pos["cx_mm"], pos["cy_spec_mm"], gen.BUBBLE_R)
            filled_here.append(ans)
        if filled_here:
            filled.append(f"{ino}={''.join(filled_here)}")

    return img, filled, skipped, id_filled


def write_sheet(
    out_dir: Path,
    exam: str,
    blank_path: Path,
    blank_img: Image.Image,
    layout: dict,
    qr_payload: str | None,
    student_id: str,
    kind: str,
    answer_key: dict[str, str],
) -> None:
    responses = build_responses(kind, answer_key)
    img, filled, skipped, id_filled = shade_sheet(blank_img, layout, student_id, responses)
    stats = grade(responses, answer_key)

    stem = f"{student_id}_{kind}"
    pdf_path = out_dir / f"{stem}.pdf"
    png_path = out_dir / f"{stem}.png"
    truth_path = out_dir / f"{stem}_truth.json"

    img.save(png_path, "PNG", dpi=(DPI, DPI))
    # Single-page PDF from the shaded raster (keeps QR pixels from Sample).
    rgb = img.convert("RGB")
    rgb.save(pdf_path, "PDF", resolution=DPI)

    truth_path.write_text(
        json.dumps(
            {
                "exam": exam,
                "kind": kind,
                "student_id": student_id,
                "source_blank": str(blank_path),
                "qr_payload": qr_payload,
                "total_items": TOTAL_ITEMS,
                "num_choices": NUM_CHOICES,
                "dpi": DPI,
                "fiducial_type": layout.get("fiducial_type"),
                "answer_key": answer_key,
                "responses": {
                    str(i): "".join(parse_marks(responses.get(str(i))))
                    for i in range(1, TOTAL_ITEMS + 1)
                },
                "filled": filled,
                "skipped": skipped,
                "id_filled": id_filled,
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
    if not MIDTERM_BLANK.exists() or not FINAL_BLANK.exists():
        raise SystemExit(f"Missing Sample blanks under {SAMPLE_DIR}")

    layout = build_layout()
    midterm_img = render_blank(MIDTERM_BLANK)
    final_img = render_blank(FINAL_BLANK)
    midterm_qr = decode_qr(midterm_img)
    final_qr = decode_qr(final_img)
    print(f"Midterm QR: {midterm_qr!r}")
    print(f"Final QR:   {final_qr!r}")

    exams = [
        ("midterm", ROOT_OUT / "BAT403_Midterm", MIDTERM_BLANK, midterm_img, midterm_qr, MIDTERM_KEY),
        ("final", ROOT_OUT / "BAT403_Final", FINAL_BLANK, final_img, final_qr, FINAL_KEY),
    ]
    for exam, out_dir, blank_path, blank_img, qr, key in exams:
        # Clear prior synthetic 60-item sheets so the folder only has Sample-based fills.
        out_dir.mkdir(parents=True, exist_ok=True)
        for old in out_dir.glob("*"):
            if old.is_file():
                old.unlink()
        print(f"\n=== BAT 403 {exam.upper()} from {blank_path.name} -> {out_dir}")
        for i, sid in enumerate(STUDENT_IDS):
            kind = KINDS[i % len(KINDS)]
            write_sheet(out_dir, exam, blank_path, blank_img, layout, qr, sid, kind, key)
    print(f"\nDone. {len(STUDENT_IDS)} students x 2 exams (50 items, Sample blanks).")


if __name__ == "__main__":
    main()
