"""
BubbleSheetScannerService
==========================
Scans a photograph/scan of a completed bubble sheet and returns:
  - ``student_identifier`` – value decoded from the QR code
  - ``responses``          – dict mapping item number → detected letter
  - ``score_raw``          – number of correct answers vs the answer key
  - ``score_percent``      – percentage score
  - ``is_flagged``         – True if confidence is low or QR could not be decoded
  - ``flag_reason``        – human-readable reason when flagged

Pipeline
--------
1. Load image with OpenCV, convert to grayscale.
2. Decode QR code using OpenCV's QRCodeDetector (no external deps).
3. For every item in layout_metadata, sample pixel intensity at each
   bubble centre (using the bubble radius from the metadata).
   The darkest bubble is the selected choice.
4. Grade against the answer key if provided.

The service is intentionally self-contained and free of third-party OMR
frameworks so the institution owns the entire pipeline.
"""

import logging
from decimal import Decimal
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    import cv2
    import numpy as np

    _CV_AVAILABLE = True
except ImportError:
    _CV_AVAILABLE = False


# ── Constants ────────────────────────────────────────────────────────────────

# Fraction of the bubble area that must be filled to count as "selected"
FILL_THRESHOLD = 0.42

# If the fill ratio of the top choice is below this the item is ambiguous
CONFIDENCE_FLOOR = 0.28

# Scale factor: layout_metadata stores coordinates in ReportLab pts
# (72 pt/inch).  Scanned images are typically ~150–300 dpi.
# We detect the actual dpi from the image dimensions compared to the
# stored page size when the metadata provides page_width_pt.


def _pts_to_px(pts: float, dpi: float) -> int:
    """Convert ReportLab points to pixels at a given dpi."""
    return round(pts * dpi / 72.0)


class BubbleSheetScannerService:
    """
    Usage::

        svc = BubbleSheetScannerService()
        result = svc.scan(image_path, template_obj)
    """

    def scan(self, image_path: str | Path, template) -> dict:
        """
        Parameters
        ----------
        image_path : path to the uploaded image file
        template   : BubbleSheetTemplate Django model instance

        Returns
        -------
        dict with keys: student_identifier, responses, score_raw,
                        score_percent, max_score, is_flagged, flag_reason
        """
        if not _CV_AVAILABLE:
            raise RuntimeError(
                "opencv-python-headless and numpy are required for scanning. "
                "Run: pip install opencv-python-headless numpy"
            )

        img_path = str(image_path)
        img_bgr = cv2.imread(img_path)
        if img_bgr is None:
            return self._flagged(f"Could not read image at {img_path}")

        img_gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        h_px, w_px = img_gray.shape

        # ── 1. Decode QR code ────────────────────────────────────────────────
        qr_detector = cv2.QRCodeDetector()
        qr_data, _, _ = qr_detector.detectAndDecode(img_bgr)
        student_id = (qr_data or "").strip()

        flagged = False
        flag_reason = None
        if not student_id:
            flagged = True
            flag_reason = "QR code could not be decoded"

        # ── 2. Derive dpi from page dimensions ───────────────────────────────
        meta = template.layout_metadata or {}
        page_w_pt = meta.get("page_width_pt", 612)
        page_h_pt = meta.get("page_height_pt", 792)
        dpi_x = w_px * 72.0 / page_w_pt
        dpi_y = h_px * 72.0 / page_h_pt
        dpi = (dpi_x + dpi_y) / 2
        bubble_r_pt = meta.get("bubble_radius_pt", 5.5)
        bubble_r_px = max(3, _pts_to_px(bubble_r_pt, dpi))

        items_meta: dict = meta.get("items", {})
        if not items_meta:
            return self._flagged("Template has no layout metadata; regenerate the sheet first.")

        # ── 3. Detect responses ──────────────────────────────────────────────
        # ReportLab uses bottom-left origin; OpenCV uses top-left.
        # Convert:  cv_y = page_h_px - rl_y
        page_h_px = _pts_to_px(page_h_pt, dpi)

        responses: dict[str, str] = {}
        low_confidence_items: list[str] = []

        for item_no, choices in items_meta.items():
            best_choice: str | None = None
            best_fill: float = -1.0
            ambiguous = False

            choice_fills: list[tuple[str, float]] = []
            for choice_label, coords in choices.items():
                cx_pt = coords["cx"]
                cy_pt = coords["cy"]
                cx_px = _pts_to_px(cx_pt, dpi)
                cy_px = page_h_px - _pts_to_px(cy_pt, dpi)
                fill = self._bubble_fill_ratio(img_gray, cx_px, cy_px, bubble_r_px)
                choice_fills.append((choice_label, fill))

            # Sort descending by fill
            choice_fills.sort(key=lambda x: x[1], reverse=True)
            top_label, top_fill = choice_fills[0]

            if top_fill < CONFIDENCE_FLOOR:
                ambiguous = True
            elif len(choice_fills) >= 2:
                second_fill = choice_fills[1][1]
                # If top two are within 8 % of each other → ambiguous
                if top_fill - second_fill < 0.08:
                    ambiguous = True

            if ambiguous:
                low_confidence_items.append(item_no)
                best_choice = "?"
            else:
                best_choice = top_label if top_fill >= FILL_THRESHOLD else "?"

            responses[item_no] = best_choice

        if low_confidence_items:
            flagged = True
            existing_reason = flag_reason or ""
            flag_reason = (
                f"{existing_reason}; ".lstrip("; ")
                + f"Low-confidence items: {', '.join(low_confidence_items)}"
            )

        # ── 4. Grade ─────────────────────────────────────────────────────────
        answer_key: dict = template.answer_key or {}
        score_raw, max_score, score_percent = self._grade(responses, answer_key)

        return {
            "student_identifier": student_id,
            "responses": responses,
            "score_raw": score_raw,
            "score_percent": score_percent,
            "max_score": max_score,
            "is_flagged": flagged,
            "flag_reason": flag_reason,
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _bubble_fill_ratio(gray_img, cx: int, cy: int, r: int) -> float:
        """
        Return the fraction of pixels inside the bubble circle that are
        'dark' (i.e., filled in by pencil / pen).
        """
        mask = np.zeros_like(gray_img, dtype=np.uint8)
        cv2.circle(mask, (cx, cy), r, 255, thickness=-1)
        roi = gray_img[
            max(0, cy - r): cy + r + 1,
            max(0, cx - r): cx + r + 1,
        ]
        mask_roi = mask[
            max(0, cy - r): cy + r + 1,
            max(0, cx - r): cx + r + 1,
        ]
        total_pixels = int(np.sum(mask_roi > 0))
        if total_pixels == 0:
            return 0.0
        # Threshold at 128; dark pixels (marks) are below 128
        dark_pixels = int(np.sum((roi < 128) & (mask_roi > 0)))
        return dark_pixels / total_pixels

    @staticmethod
    def _grade(
        responses: dict, answer_key: dict
    ) -> tuple[Decimal, Decimal, Decimal]:
        """Return (score_raw, max_score, score_percent)."""
        if not answer_key:
            return Decimal("0"), Decimal("0"), Decimal("0")

        correct = 0
        total = len(answer_key)
        for item_no, correct_ans in answer_key.items():
            student_ans = responses.get(str(item_no), "?")
            if student_ans.upper() == str(correct_ans).upper():
                correct += 1

        max_score = Decimal(str(total))
        score_raw = Decimal(str(correct))
        score_percent = (
            (score_raw / max_score * 100).quantize(Decimal("0.01"))
            if max_score > 0
            else Decimal("0")
        )
        return score_raw, max_score, score_percent

    @staticmethod
    def _flagged(reason: str) -> dict:
        return {
            "student_identifier": None,
            "responses": {},
            "score_raw": Decimal("0"),
            "score_percent": Decimal("0"),
            "max_score": Decimal("0"),
            "is_flagged": True,
            "flag_reason": reason,
        }
