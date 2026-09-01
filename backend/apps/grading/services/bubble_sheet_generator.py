"""
BubbleSheetGeneratorService
============================
Exact mm-based bubble-sheet PDF generator. Long bond paper (8.5" x 13",
~215.9 x 330.2 mm) with 2" header / 1" footer margins.
Origin is ReportLab's bottom-left; _sy() converts spec top-origin to RL Y.
"""

import io
import math
from typing import Any

try:
    import qrcode
    from reportlab.pdfgen import canvas as rl_canvas
    _RL_AVAILABLE = True
except ImportError:
    _RL_AVAILABLE = False

# ── Page ──────────────────────────────────────────────────────────────────
# Long bond paper (8.5" x 13") with 2" header, 1" footer.
# Fiducials span 10" outer-edge-to-outer-edge.
PAGE_W_MM = 215.9
PAGE_H_MM = 330.2
HEADER_MM = 50.8    # 2"
FOOTER_MM = 25.4    # 1"
FID_SPAN_MM = 254.0  # 10" — vertical span between top/bottom fiducial outer edges
MM2PT = 72.0 / 25.4


def mm2pt(v: float) -> float:
    return v * MM2PT


def _sy(spec_y: float) -> float:
    return PAGE_H_MM - spec_y


# ── Fiducials ─────────────────────────────────────────────────────────────
# Top fiducials at paper top + HEADER_MM (2"). Bottom fiducials at header + 10".
# Horizontal: tight to edges with FID_INSET.
FID_INSET = 8.0
FID_W = 10.0
CONTENT_TOP = HEADER_MM
CONTENT_BOT = CONTENT_TOP + FID_SPAN_MM - FID_W  # bottom fiducial top edge
FID_SPEC = [
    (FID_INSET, CONTENT_TOP),
    (PAGE_W_MM - FID_INSET - FID_W, CONTENT_TOP),
    (FID_INSET, CONTENT_BOT),
    (PAGE_W_MM - FID_INSET - FID_W, CONTENT_BOT),
]

SAFE_X0, SAFE_X1 = FID_INSET + FID_W + 2.0, PAGE_W_MM - FID_INSET - FID_W - 2.0
SAFE_YT, SAFE_YB = CONTENT_TOP + FID_W + 2.0, CONTENT_BOT - 2.0

# ── Horizontal centering shift ────────────────────────────────────────────
# Content block (left zone + right zone columns) is centred on the page.
# Original block: 20mm .. 190mm. Page: 215.9mm. Shift = (215.9 - 170) / 2 - 20 ≈ 2.95
X_SHIFT = 3.0

# ── Left zone ─────────────────────────────────────────────────────────────
LEFT_X0, LEFT_X1 = 20.0 + X_SHIFT, 78.0 + X_SHIFT
LEFT_W = LEFT_X1 - LEFT_X0

QR_SIZE = 52.0
QR_X0 = LEFT_X0 + (LEFT_W - QR_SIZE) / 2

# Comb fields
COMB_N = 8
COMB_W = 5.5
COMB_H = 6.5
COMB_GAP = 1.0
COMB_TOTAL = COMB_N * COMB_W + (COMB_N - 1) * COMB_GAP
COMB_X0 = LEFT_X0 + (LEFT_W - COMB_TOTAL) / 2

# ID bubble grid
ID_CENTRES = [COMB_X0 + COMB_W / 2 + i * (COMB_W + COMB_GAP) for i in range(COMB_N)]
ID_BUBBLE_R = 1.75
ID_LABELS = [str(d) for d in range(10)] + ["-"]
ID_ROW_PITCH = 5.0
ID_LABEL_X = COMB_X0 - 3.0
ID_NUM_COLS = 8

# ── Right zone: Answer Grid ──────────────────────────────────────────────
RIGHT_X0 = 80.0 + X_SHIFT
RIGHT_X1 = 190.0 + X_SHIFT
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
        c = rl_canvas.Canvas(buf, pagesize=(mm2pt(PAGE_W_MM), mm2pt(PAGE_H_MM)))

        total = template.total_items
        nchoice = template.num_choices
        nidcols = min(
            (template.layout_metadata or {}).get("num_id_columns", ID_NUM_COLS),
            ID_NUM_COLS,
        )
        ipc = (total + 1) // 2

        layout: dict[str, Any] = {
            "page_width_pt": round(mm2pt(PAGE_W_MM), 2),
            "page_height_pt": round(mm2pt(PAGE_H_MM), 2),
            "page": "Long Bond (8.5\"x13\")", "capacity": CAPACITY, "total_items": total,
            "rows_per_column": ROWS_PER_COL,
            "row_height_pt": round(mm2pt(ROW_V_PITCH), 2),
            "bubble_radius_pt": round(mm2pt(BUBBLE_R), 2),
            "dpi": 150, "items": {}, "id_columns": {},
        }

        # ── Vertical centering ────────────────────────────────────────────
        # Available inner height between fiducials
        avl_top = CONTENT_TOP + FID_W       # = header + fiducial height
        avl_bot = CONTENT_BOT               # = bottom fiducial top edge
        avl_h = avl_bot - avl_top           # vertical gap between fiducial inner edges

        # Answer grid height for this template
        grid_h = HEADER_BAR_H + ipc * ROW_V_PITCH
        # Centre the grid inside the available space
        y0 = avl_top + (avl_h - grid_h) / 2.0

        self._draw_fiducials(c, layout)
        self._draw_left_zone(c, template, nidcols, y0, layout)
        self._draw_answer_zone(c, template, total, nchoice, y0, layout)

        c.showPage()
        c.save()
        buf.seek(0)

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

    def _draw_left_zone(self, c, template, ncols, y0, layout):
        # --- QR code at the top of grid area ---
        qr_yt = y0

        # "ASSESSMENT QR" label
        c.setFont(FONT_B, 6)
        c.setFillColorRGB(0.4, 0.4, 0.4)
        c.drawCentredString(mm2pt(QR_X0 + QR_SIZE / 2),
                            mm2pt(_sy(qr_yt - 4)),
                            "ASSESSMENT QR")

        # QR code
        aid = str(template.assessment_id or template.template_id)
        qr_img = self._make_qr_pil(aid)
        if qr_img:
            c.drawInlineImage(qr_img, mm2pt(QR_X0), mm2pt(_sy(qr_yt + QR_SIZE)),
                              width=mm2pt(QR_SIZE), height=mm2pt(QR_SIZE))

        # Comb field Y positions (relative to QR bottom)
        comb_yt = qr_yt + QR_SIZE + 10

        # "STUDENT ID" label
        c.setFont(FONT_B, 8)
        c.setFillColorRGB(*C_MAROON)
        c.drawCentredString(mm2pt(COMB_X0 + COMB_TOTAL / 2),
                            mm2pt(_sy(comb_yt - 4)),
                            "STUDENT ID")

        # Comb fields
        c.setStrokeColorRGB(*C_BORDER)
        c.setLineWidth(0.5)
        for i in range(COMB_N):
            bx_mm = COMB_X0 + i * (COMB_W + COMB_GAP)
            c.rect(mm2pt(bx_mm), mm2pt(_sy(comb_yt + COMB_H)),
                   mm2pt(COMB_W), mm2pt(COMB_H), stroke=1, fill=0)

        # ID bubble grid
        id_grid_yt = comb_yt + COMB_H + 6
        id_rows_y = [id_grid_yt + 2.5 + r * ID_ROW_PITCH for r in range(11)]

        bxs = [mm2pt(cx) for cx in ID_CENTRES[:ncols]]
        layout["id_columns"] = {
            "x0_mm": ID_CENTRES[0], "y_top_spec_mm": id_grid_yt,
            "num_cols": ncols, "bubble_r_mm": ID_BUBBLE_R,
            "col_pitch_mm": COMB_W + COMB_GAP, "row_pitch_mm": ID_ROW_PITCH,
        }
        layout["left_zone"] = {
            "x0_mm": LEFT_X0,
            "x1_mm": LEFT_X1,
            "qr_x0_mm": QR_X0,
            "qr_size_mm": QR_SIZE,
            "y_start_spec_mm": y0,
        }
        for ri, (label, ry) in enumerate(zip(ID_LABELS, id_rows_y)):
            ry_pt = mm2pt(_sy(ry))
            c.setFont(FONT_B, 6.5)
            c.setFillColorRGB(*C_BLACK)
            c.drawRightString(mm2pt(ID_LABEL_X), ry_pt - 2, label)
            c.setStrokeColorRGB(0.12, 0.12, 0.12)
            c.setLineWidth(0.4)
            for cx_pt in bxs:
                c.circle(cx_pt, ry_pt, mm2pt(ID_BUBBLE_R), stroke=1, fill=0)

    # ── Answer Zone ────────────────────────────────────────────────────────

    def _draw_answer_zone(self, c, template, total, nchoice, y0, layout):
        labels = ["A", "B", "C", "D"][:nchoice]
        ipc = (total + 1) // 2

        layout["answer_grid"] = {
            "y_start_spec_mm": y0, "header_h_mm": HEADER_BAR_H,
            "row_pitch_mm": ROW_V_PITCH, "bubble_r_mm": BUBBLE_R,
            "answer_zone_x0_mm": RIGHT_X0,
            "answer_zone_x1_mm": RIGHT_X1,
            "col_width_mm": COL_W,
            "col_gap_mm": COL_GAP,
            "num_choices": nchoice,
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
