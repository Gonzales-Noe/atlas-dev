"""
BubbleSheetGeneratorService
============================
Exact mm-based bubble-sheet PDF generator. A4 portrait (210 x 297 mm).
Origin is ReportLab's bottom-left; _sy() converts spec top-origin to RL Y.
"""

import io
import math
from typing import Any

try:
    import qrcode
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as rl_canvas
    _RL_AVAILABLE = True
except ImportError:
    _RL_AVAILABLE = False

# ── Page ──────────────────────────────────────────────────────────────────
PAGE_W_MM = 210.0
PAGE_H_MM = 297.0
MM2PT = 72.0 / 25.4


def mm2pt(v: float) -> float:
    return v * MM2PT


def _sy(spec_y: float) -> float:
    return PAGE_H_MM - spec_y


# ── Fiducials ─────────────────────────────────────────────────────────────
FID_W = 10.0
FID_SPEC = [(10.0, 10.0), (190.0, 10.0), (10.0, 277.0), (190.0, 277.0)]

SAFE_X0, SAFE_X1 = 20.0, 190.0
SAFE_YT, SAFE_YB = 25.0, 272.0

# ── Left zone ─────────────────────────────────────────────────────────────
LEFT_X0, LEFT_X1 = 20.0, 78.0
LEFT_W = LEFT_X1 - LEFT_X0

QR_SIZE = 52.0
QR_X0 = LEFT_X0 + (LEFT_W - QR_SIZE) / 2
QR_YT = 50.0  # top-alignment baseline

# Comb fields
COMB_N = 8
COMB_W = 5.5
COMB_H = 6.5
COMB_GAP = 1.0
COMB_TOTAL = COMB_N * COMB_W + (COMB_N - 1) * COMB_GAP
COMB_X0 = LEFT_X0 + (LEFT_W - COMB_TOTAL) / 2
COMB_YT = QR_YT + QR_SIZE + 10

# ID bubble grid
ID_CENTRES = [COMB_X0 + COMB_W / 2 + i * (COMB_W + COMB_GAP) for i in range(COMB_N)]
ID_GRID_YT = COMB_YT + COMB_H + 6
ID_BUBBLE_R = 1.75
ID_LABELS = [str(d) for d in range(10)] + ["-"]
ID_ROW_PITCH = 5.0
ID_ROWS_Y = [ID_GRID_YT + 2.5 + r * ID_ROW_PITCH for r in range(11)]
ID_LABEL_X = COMB_X0 - 3.0
ID_NUM_COLS = 8

# ── Right zone: Answer Grid ──────────────────────────────────────────────
RIGHT_X0, RIGHT_X1 = 80.0, 190.0
RIGHT_W = RIGHT_X1 - RIGHT_X0

COL_GAP = 1.5
COL_W = (RIGHT_W - COL_GAP) / 2.0

COL1_X0 = RIGHT_X0
COL2_X0 = COL1_X0 + COL_W + COL_GAP

HEADER_BAR_H = 8.0
ROW_V_PITCH = 6.0
BUBBLE_R = 2.0

COL_ITEM_W = 8.0
BUBBLE_STEP = 10.0  # fixed 10mm between adjacent bubble centres
BUBBLE_GROUP_W = 3 * BUBBLE_STEP  # A→D span = 30mm


def _bx(col_x0):
    # centre the A-D bubble group in the remaining column space
    leftover = COL_W - COL_ITEM_W - BUBBLE_GROUP_W
    offset = COL_ITEM_W + leftover / 2
    return {
        "A": col_x0 + offset + 0 * BUBBLE_STEP,
        "B": col_x0 + offset + 1 * BUBBLE_STEP,
        "C": col_x0 + offset + 2 * BUBBLE_STEP,
        "D": col_x0 + offset + 3 * BUBBLE_STEP,
    }


C1_BX = _bx(COL1_X0)
C2_BX = _bx(COL2_X0)
C1_ITEM_X = COL1_X0 + COL_ITEM_W - 1.0
C2_ITEM_X = COL2_X0 + COL_ITEM_W - 1.0

SHADE_C = (0.933, 0.933, 0.933)

# ── Colours ───────────────────────────────────────────────────────────────
C_MAROON   = (0.545, 0.0, 0.0)
C_WHITE    = (1.0, 1.0, 1.0)
C_BLACK    = (0.0, 0.0, 0.0)
C_DARK_HDR = (0.133, 0.133, 0.133)
C_BORDER   = (0.35, 0.35, 0.35)

FONT_N = "Helvetica"
FONT_B = "Helvetica-Bold"

CAPACITY = 100
ROWS_PER_COL = CAPACITY // 2


class BubbleSheetGeneratorService:

    def generate(self, template) -> tuple[bytes, dict]:
        if not _RL_AVAILABLE:
            raise RuntimeError("reportlab and qrcode required.")

        buf = io.BytesIO()
        c = rl_canvas.Canvas(buf, pagesize=A4)

        total = template.total_items
        nchoice = template.num_choices
        nidcols = min(
            (template.layout_metadata or {}).get("num_id_columns", ID_NUM_COLS),
            ID_NUM_COLS,
        )

        layout: dict[str, Any] = {
            "page_width_pt": round(mm2pt(PAGE_W_MM), 2),
            "page_height_pt": round(mm2pt(PAGE_H_MM), 2),
            "page": "A4", "capacity": CAPACITY, "total_items": total,
            "rows_per_column": ROWS_PER_COL,
            "row_height_pt": round(mm2pt(ROW_V_PITCH), 2),
            "bubble_radius_pt": round(mm2pt(BUBBLE_R), 2),
            "dpi": 150, "items": {}, "id_columns": {},
        }

        self._draw_fiducials(c, layout)
        self._draw_left_zone(c, template, nidcols, layout)
        self._draw_answer_zone(c, template, total, nchoice, layout)

        c.showPage()
        c.save()
        buf.seek(0)

        ipc = (total + 1) // 2
        layout["parts"] = [
            {"label": "Col A", "start_item": 1, "end_item": ipc},
            {"label": "Col B", "start_item": ipc + 1, "end_item": total},
        ]
        return buf.read(), layout

    # ── Fiducials ──────────────────────────────────────────────────────────

    def _draw_fiducials(self, c, layout):
        fids = []
        for sx, sy in FID_SPEC:
            c.setFillColorRGB(*C_BLACK)
            c.rect(mm2pt(sx), mm2pt(_sy(sy + FID_W)),
                   mm2pt(FID_W), mm2pt(FID_W), stroke=0, fill=1)
            fids.append({"x_mm": sx, "y_spec_mm": sy, "w_mm": FID_W, "h_mm": FID_W})
        layout["fiducials"] = fids
        a, b = FID_SPEC[2], FID_SPEC[3]
        layout["fiducial_baseline_ref"] = round(
            math.hypot(b[0] - a[0], b[1] - a[1]), 2)

    # ── Left Zone ──────────────────────────────────────────────────────────

    def _draw_left_zone(self, c, template, ncols, layout):
        # "ASSESSMENT QR" label — ABOVE QR code
        c.setFont(FONT_B, 6)
        c.setFillColorRGB(0.4, 0.4, 0.4)
        c.drawCentredString(mm2pt(QR_X0 + QR_SIZE / 2),
                            mm2pt(_sy(QR_YT - 4)),
                            "ASSESSMENT QR")

        # QR code
        aid = str(template.assessment_id or template.template_id)
        qr_img = self._make_qr_pil(aid)
        if qr_img:
            c.drawInlineImage(qr_img, mm2pt(QR_X0), mm2pt(_sy(QR_YT + QR_SIZE)),
                              width=mm2pt(QR_SIZE), height=mm2pt(QR_SIZE))

        # "STUDENT ID" — ABOVE comb fields
        c.setFont(FONT_B, 8)
        c.setFillColorRGB(*C_MAROON)
        c.drawCentredString(mm2pt(COMB_X0 + COMB_TOTAL / 2),
                            mm2pt(_sy(COMB_YT - 4)),
                            "STUDENT ID")

        # Comb fields
        c.setStrokeColorRGB(*C_BORDER)
        c.setLineWidth(0.5)
        for i in range(COMB_N):
            bx_mm = COMB_X0 + i * (COMB_W + COMB_GAP)
            c.rect(mm2pt(bx_mm), mm2pt(_sy(COMB_YT + COMB_H)),
                   mm2pt(COMB_W), mm2pt(COMB_H), stroke=1, fill=0)

        # ID bubble grid
        bxs = [mm2pt(cx) for cx in ID_CENTRES[:ncols]]
        layout["id_columns"] = {
            "x0_mm": ID_CENTRES[0], "y_top_spec_mm": ID_GRID_YT,
            "num_cols": ncols, "bubble_r_mm": ID_BUBBLE_R,
            "col_pitch_mm": COMB_W + COMB_GAP, "row_pitch_mm": ID_ROW_PITCH,
        }
        for ri, (label, ry) in enumerate(zip(ID_LABELS, ID_ROWS_Y)):
            ry_pt = mm2pt(_sy(ry))
            c.setFont(FONT_B, 6.5)
            c.setFillColorRGB(*C_BLACK)
            c.drawRightString(mm2pt(ID_LABEL_X), ry_pt - 2, label)
            c.setStrokeColorRGB(0.12, 0.12, 0.12)
            c.setLineWidth(0.4)
            for cx_pt in bxs:
                c.circle(cx_pt, ry_pt, mm2pt(ID_BUBBLE_R), stroke=1, fill=0)

    # ── Answer Zone ────────────────────────────────────────────────────────

    def _draw_answer_zone(self, c, template, total, nchoice, layout):
        labels = ["A", "B", "C", "D"][:nchoice]
        ipc = (total + 1) // 2
        y0 = QR_YT  # top-aligned

        layout["answer_grid"] = {
            "y_start_spec_mm": y0, "header_h_mm": HEADER_BAR_H,
            "row_pitch_mm": ROW_V_PITCH, "bubble_r_mm": BUBBLE_R,
        }
        self._col(c, total, labels, 1, COL1_X0, C1_ITEM_X, C1_BX, y0, layout, "col_a")
        self._col(c, total, labels, ipc + 1, COL2_X0, C2_ITEM_X, C2_BX, y0, layout, "col_b")

    def _col(self, c, total, labels, start, x0, ix, bx, y0, layout, key):
        ipc = (total + 1) // 2

        # Header
        hdr_b = y0 + HEADER_BAR_H
        c.setFillColorRGB(*C_DARK_HDR)
        c.rect(mm2pt(x0), mm2pt(_sy(hdr_b)), mm2pt(COL_W), mm2pt(HEADER_BAR_H),
               stroke=0, fill=1)

        c.setFont(FONT_B, 9)
        c.setFillColorRGB(*C_WHITE)
        hy = mm2pt(_sy(y0 + HEADER_BAR_H / 2))
        c.drawCentredString(mm2pt(x0 + COL_ITEM_W / 2), hy, "#")
        for lbl in labels:
            c.drawCentredString(mm2pt(bx[lbl]), hy, lbl)

        # Border
        gh = HEADER_BAR_H + ipc * ROW_V_PITCH
        bot = y0 + gh
        c.setStrokeColorRGB(*C_BORDER)
        c.setLineWidth(0.5)
        c.rect(mm2pt(x0), mm2pt(_sy(bot)), mm2pt(COL_W), mm2pt(gh),
               stroke=1, fill=0)

        layout["answer_grid"][key] = {
            "x0_mm": x0, "y_start_spec_mm": y0,
            "y_bottom_spec_mm": bot, "start_item": start,
        }

        for ri in range(ipc):
            ino = start + ri
            if ino > total:
                break
            rt = y0 + HEADER_BAR_H + ri * ROW_V_PITCH
            rc = rt + ROW_V_PITCH / 2
            cy = mm2pt(_sy(rc))

            if (ri // 5) % 2 == 1:
                c.setFillColorRGB(*SHADE_C)
                c.rect(mm2pt(x0), mm2pt(_sy(rt + ROW_V_PITCH)),
                       mm2pt(COL_W), mm2pt(ROW_V_PITCH), stroke=0, fill=1)

            c.setFont(FONT_B if ino % 5 == 0 else FONT_N, 7)
            c.setFillColorRGB(*C_BLACK)
            c.drawRightString(mm2pt(ix), cy - 2.5, f"{ino}.")

            c.setStrokeColorRGB(0.12, 0.12, 0.12)
            c.setLineWidth(0.4)
            il = {}
            for lbl in labels:
                cx_mm = bx[lbl]
                c.circle(mm2pt(cx_mm), cy, mm2pt(BUBBLE_R), stroke=1, fill=0)
                il[lbl] = {"cx_mm": round(cx_mm, 2), "cy_spec_mm": round(rc, 2)}
            layout["items"][str(ino)] = il

    # ── QR ─────────────────────────────────────────────────────────────────

    def _make_qr_pil(self, data):
        if not _RL_AVAILABLE:
            return None
        qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M,
                           box_size=6, border=2)
        qr.add_data(data)
        qr.make(fit=True)
        return qr.make_image(fill_color="black", back_color="white")

    @staticmethod
    def generate_student_qr(student_id: str) -> bytes:
        if not _RL_AVAILABLE:
            raise RuntimeError("qrcode[pil] required.")
        qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M,
                           box_size=6, border=2)
        qr.add_data(student_id)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return buf.read()
