"""
BubbleSheetGeneratorService
============================
Generates a ZipGrade-style printable bubble-sheet PDF using ReportLab.

Layout (top → bottom):
  1. Maroon header banner  – exam / sheet title
  2. Student info block    – QR placeholder, Name, ID, Date, Section, Score box
  3. Answer grid           – 4 equal columns, dark header, alternating 5-row bands
  4. Essay lines           – optional lined space

``layout_metadata`` maps every item number → choice label → bubble centre in
ReportLab points (bottom-left origin) so the scanner can locate bubbles.
"""

import io
import math
from typing import Any

try:
    import qrcode
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as rl_canvas

    _RL_AVAILABLE = True
except ImportError:
    _RL_AVAILABLE = False

# ── Page ─────────────────────────────────────────────────────────────────────
PAGE_W, PAGE_H = LETTER if _RL_AVAILABLE else (612, 792)
ML = 22.0                        # left + right margin
CONTENT_W = PAGE_W - 2 * ML     # usable width ≈ 568 pts

# ── Column-grid geometry ──────────────────────────────────────────────────────
NCOLS      = 4       # always 4 side-by-side answer groups (ZipGrade style)
COL_SEP    = 8.0     # gap between group boxes
NUM_W      = 20.0    # item-number column inside each group
GRP_PAD_X  = 5.0     # inner horizontal padding (each side of group)
GRP_PAD_Y  = 4.0     # inner vertical padding (top & bottom of group)
HDR_H      = 12.0    # dark header band at top of each group
ROW_H      = 14.0    # row height per item
BUBBLE_R   = 5.0     # bubble radius in pts

# ── Colours ───────────────────────────────────────────────────────────────────
MAROON    = (0.545, 0.0, 0.0)
WHITE     = (1.0,   1.0, 1.0)
DARK_HDR  = (0.15,  0.15, 0.15)   # group column header background
SHADE5    = (0.91,  0.91, 0.91)   # alternating 5-row tint

FONT_N = "Helvetica"
FONT_B = "Helvetica-Bold"


# ── Geometry helpers ──────────────────────────────────────────────────────────

def _choice_labels(n: int) -> list[str]:
    return [chr(ord("A") + i) for i in range(n)]


def _choice_col_w(nchoice: int) -> float:
    """
    Choice-column width so that 4 groups exactly fill CONTENT_W when
    nchoice = 4 or 5.  Capped at 30 pt so fewer-choice sheets stay compact.
    """
    gw_target = (CONTENT_W - (NCOLS - 1) * COL_SEP) / NCOLS   # 136 pts
    cw = (gw_target - NUM_W - 2 * GRP_PAD_X) / nchoice         # 26.5 pts @ 4
    return min(cw, 30.0)


def _group_width(nchoice: int) -> float:
    return NUM_W + nchoice * _choice_col_w(nchoice) + 2 * GRP_PAD_X


def _grid_start_x(nchoice: int) -> float:
    total_w = NCOLS * _group_width(nchoice) + (NCOLS - 1) * COL_SEP
    return ML + (CONTENT_W - total_w) / 2


# ── Service ───────────────────────────────────────────────────────────────────

class BubbleSheetGeneratorService:
    """
    Generate a printable bubble-sheet PDF for a ``BubbleSheetTemplate``.

    Usage::

        svc = BubbleSheetGeneratorService()
        pdf_bytes, layout_metadata = svc.generate(template_obj)
    """

    def generate(self, template) -> tuple[bytes, dict]:
        if not _RL_AVAILABLE:
            raise RuntimeError(
                "reportlab and qrcode are required for bubble sheet generation. "
                "Run: pip install reportlab 'qrcode[pil]'"
            )

        buf = io.BytesIO()
        c = rl_canvas.Canvas(buf, pagesize=(PAGE_W, PAGE_H))

        layout: dict[str, Any] = {
            "page_width_pt":    PAGE_W,
            "page_height_pt":   PAGE_H,
            "bubble_radius_pt": BUBBLE_R,
            "dpi": 150,
            "items": {},    # str(item_no) → {choice_label → {"cx", "cy"}}
        }

        # Build part-start lookup: item_no (int) → label (str)
        parts = template.parts or [
            {"label": "Part I", "start_item": 1, "end_item": template.total_items}
        ]
        part_starts: dict[int, str] = {
            int(p.get("start_item", 1)): p.get("label", "")
            for p in parts
        }

        y = PAGE_H - 16.0

        y = self._draw_header(c, template, y)
        y = self._draw_id_block(c, template, y)
        y = self._draw_grid(c, template, y, layout, part_starts)
        if template.has_essay:
            self._draw_essay(c, template, y)

        c.showPage()
        c.save()
        buf.seek(0)
        return buf.read(), layout

    # ─── Section 1 : header banner ────────────────────────────────────────────

    def _draw_header(self, c, template, y: float) -> float:
        H = 38.0
        # Solid maroon banner
        c.setFillColorRGB(*MAROON)
        c.rect(ML, y - H, CONTENT_W, H, stroke=0, fill=1)
        # Title
        c.setFillColorRGB(*WHITE)
        c.setFont(FONT_B, 14)
        title = (template.name or "Examination Answer Sheet")[:80]
        c.drawCentredString(PAGE_W / 2, y - H + 16, title)
        # Subtitle
        c.setFont(FONT_N, 7)
        sub = (
            f"Items: {template.total_items}   |   "
            f"Choices: {template.num_choices}   |   "
            "Fill bubbles completely with a dark pen or pencil"
        )
        c.drawCentredString(PAGE_W / 2, y - H + 5, sub)
        return y - H - 5

    # ─── Section 2 : student info / QR block ──────────────────────────────────

    def _draw_id_block(self, c, template, y: float) -> float:
        H = 60.0
        # Outer border
        c.setStrokeColorRGB(0.50, 0.50, 0.50)
        c.setLineWidth(0.55)
        c.rect(ML, y - H, CONTENT_W, H, stroke=1, fill=0)

        # ── QR placeholder (left) ─────────────────────────────────────────
        QR = 54.0
        qx = ML + 5
        qy = y - H + 3
        c.setFillColorRGB(0.96, 0.96, 0.96)
        c.rect(qx, qy, QR, QR, stroke=0, fill=1)
        c.setStrokeColorRGB(0.40, 0.40, 0.40)
        c.setLineWidth(0.5)
        c.rect(qx, qy, QR, QR, stroke=1, fill=0)
        # Finder-pattern corner squares
        c.setStrokeColorRGB(0.0, 0.0, 0.0)
        c.setLineWidth(1.1)
        FINDER = 7.5
        for fx, fy in [(0, 0), (QR - FINDER - 2, 0), (0, QR - FINDER - 2)]:
            c.rect(qx + fx + 2, qy + fy + 2, FINDER, FINDER, stroke=1, fill=0)
        # Centre dot
        c.setFillColorRGB(0.0, 0.0, 0.0)
        c.circle(qx + QR / 2, qy + QR / 2, 2.5, stroke=0, fill=1)
        # Labels
        c.setFont(FONT_B, 6.5)
        c.setFillColorRGB(0.25, 0.25, 0.25)
        c.drawCentredString(qx + QR / 2, qy + QR / 2 - 6,  "QR CODE")
        c.setFont(FONT_N, 5.5)
        c.drawCentredString(qx + QR / 2, qy + QR / 2 - 14, "Affix student")
        c.drawCentredString(qx + QR / 2, qy + QR / 2 - 21, "QR sticker here")

        # ── Right-side write-in fields ────────────────────────────────────
        rx = ML + QR + 14
        rw = CONTENT_W - QR - 19
        mid = rx + rw * 0.52

        c.setFont(FONT_B, 7.5)
        c.setFillColorRGB(0.12, 0.12, 0.12)
        c.setStrokeColorRGB(0.30, 0.30, 0.30)
        c.setLineWidth(0.4)

        def _field(lx, fy, label, x_end):
            lw = c.stringWidth(label, FONT_B, 7.5)
            c.setFont(FONT_B, 7.5)
            c.setFillColorRGB(0.12, 0.12, 0.12)
            c.drawString(lx, fy, label)
            c.line(lx + lw + 3, fy - 1, x_end, fy - 1)

        row1_y = y - 12
        row2_y = y - 28
        row3_y = y - 44

        _field(rx,  row1_y, "Name:",              rx + rw)
        _field(rx,  row2_y, "Student ID No.:",    mid - 6)
        _field(mid, row2_y, "Date:",              rx + rw)
        _field(rx,  row3_y, "Section / Course:",  mid - 6)

        # Score box (right of row 3)
        sbw = rw - (mid - rx) - 2
        sbh = 15
        sbx = mid
        sby = row3_y - sbh + 2
        c.setFillColorRGB(0.90, 0.90, 0.90)
        c.rect(sbx, sby, sbw, sbh, stroke=0, fill=1)
        c.setStrokeColorRGB(0.45, 0.45, 0.45)
        c.setLineWidth(0.5)
        c.rect(sbx, sby, sbw, sbh, stroke=1, fill=0)
        c.setFont(FONT_B, 7)
        c.setFillColorRGB(0.20, 0.20, 0.20)
        c.drawCentredString(
            sbx + sbw / 2, sby + 4,
            f"SCORE: ________ / {template.total_items}",
        )

        return y - H - 8

    # ─── Section 3 : answer grid ──────────────────────────────────────────────

    def _draw_grid(
        self,
        c,
        template,
        y: float,
        layout: dict,
        part_starts: dict,
    ) -> float:
        total   = template.total_items
        nchoice = template.num_choices
        labels  = _choice_labels(nchoice)

        cw  = _choice_col_w(nchoice)
        gw  = _group_width(nchoice)
        gx0 = _grid_start_x(nchoice)

        # Distribute items sequentially across NCOLS columns
        items_per_col = math.ceil(total / NCOLS)
        all_items = list(range(1, total + 1))
        columns: list[list[int]] = [
            all_items[i * items_per_col: (i + 1) * items_per_col]
            for i in range(NCOLS)
        ]
        columns = [col for col in columns if col]   # drop empty trailing cols

        grid_h = HDR_H + items_per_col * ROW_H + 2 * GRP_PAD_Y

        for col_idx, col_items in enumerate(columns):
            gx        = gx0 + col_idx * (gw + COL_SEP)
            gy_bottom = y - grid_h

            # ── Outer group box (white fill so shading clips cleanly) ─────
            c.setFillColorRGB(1, 1, 1)
            c.setStrokeColorRGB(0.35, 0.35, 0.35)
            c.setLineWidth(0.6)
            c.rect(gx, gy_bottom, gw, grid_h, stroke=1, fill=1)

            # ── Dark header band ──────────────────────────────────────────
            hdr_y = gy_bottom + grid_h - HDR_H
            c.setFillColorRGB(*DARK_HDR)
            c.rect(gx, hdr_y, gw, HDR_H, stroke=0, fill=1)

            # "#" label in header
            c.setFont(FONT_B, 7)
            c.setFillColorRGB(*WHITE)
            c.drawCentredString(gx + GRP_PAD_X + NUM_W / 2, hdr_y + 3.5, "#")
            # Choice letter labels in header
            for ci, lbl in enumerate(labels):
                cx = gx + GRP_PAD_X + NUM_W + ci * cw + cw / 2
                c.drawCentredString(cx, hdr_y + 3.5, lbl)

            # ── Vertical rule separating number col from bubble cols ──────
            sep_x = gx + GRP_PAD_X + NUM_W
            c.setStrokeColorRGB(0.70, 0.70, 0.70)
            c.setLineWidth(0.4)
            c.line(sep_x, gy_bottom, sep_x, hdr_y)

            # ── Item rows ─────────────────────────────────────────────────
            row_top = gy_bottom + grid_h - HDR_H - GRP_PAD_Y

            for row_idx, item_no in enumerate(col_items):
                ry_top    = row_top  - row_idx * ROW_H
                ry_bottom = ry_top   - ROW_H
                ry_center = (ry_top + ry_bottom) / 2

                # ── Alternating 5-row shading: rows 5-9, 15-19, … ───────
                if (row_idx % 10) >= 5:
                    c.setFillColorRGB(*SHADE5)
                    c.rect(gx + 0.7, ry_bottom, gw - 1.4, ROW_H, stroke=0, fill=1)

                # ── Part-start: maroon rule + label ──────────────────────
                if item_no in part_starts and part_starts[item_no]:
                    if row_idx > 0:
                        c.setStrokeColorRGB(*MAROON)
                        c.setLineWidth(0.8)
                        c.line(gx + 1, ry_top, gx + gw - 1, ry_top)
                    # Tiny label right-aligned just above the rule
                    c.setFont(FONT_B, 5.2)
                    c.setFillColorRGB(*MAROON)
                    lbl_text = part_starts[item_no]
                    tw = c.stringWidth(lbl_text, FONT_B, 5.2)
                    lbl_y = ry_top + (2.0 if row_idx > 0 else 1.5)
                    c.drawString(gx + gw - GRP_PAD_X - tw, lbl_y, lbl_text)

                # ── Item number (bold on every 5th for easy counting) ────
                c.setFont(FONT_B if item_no % 5 == 0 else FONT_N, 7)
                c.setFillColorRGB(0, 0, 0)
                c.drawRightString(
                    gx + GRP_PAD_X + NUM_W - 2,
                    ry_center - 2.5,
                    f"{item_no}.",
                )

                # ── Bubbles ──────────────────────────────────────────────
                item_layout: dict[str, dict] = {}
                for ci, choice_lbl in enumerate(labels):
                    cx = gx + GRP_PAD_X + NUM_W + ci * cw + cw / 2
                    cy = ry_center
                    c.setStrokeColorRGB(0.12, 0.12, 0.12)
                    c.setLineWidth(0.8)
                    c.circle(cx, cy, BUBBLE_R, stroke=1, fill=0)
                    item_layout[choice_lbl] = {"cx": cx, "cy": cy}

                layout["items"][str(item_no)] = item_layout

        return y - grid_h - 8

    # ─── Section 4 : essay / problem-solving area ─────────────────────────────

    def _draw_essay(self, c, template, y: float) -> float:
        lines = max(template.essay_lines or 10, 5)
        BANNER_H = 15.0
        c.setFillColorRGB(*MAROON)
        c.rect(ML, y - BANNER_H, CONTENT_W, BANNER_H, stroke=0, fill=1)
        c.setFont(FONT_B, 8.5)
        c.setFillColorRGB(*WHITE)
        c.drawString(ML + 6, y - BANNER_H + 4, "Essay / Problem-Solving Section")
        y -= BANNER_H + 8
        c.setStrokeColorRGB(0.60, 0.60, 0.60)
        c.setLineWidth(0.4)
        for _ in range(lines):
            c.line(ML, y, PAGE_W - ML, y)
            y -= 17
        return y

    # ─── Static helper : per-student QR PNG ───────────────────────────────────

    @staticmethod
    def generate_student_qr(student_id: str) -> bytes:
        """Return PNG bytes for a QR code encoding ``student_id``."""
        if not _RL_AVAILABLE:
            raise RuntimeError("qrcode[pil] is required.")
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=6,
            border=2,
        )
        qr.add_data(student_id)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return buf.read()
