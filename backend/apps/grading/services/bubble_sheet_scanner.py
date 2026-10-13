"""
BubbleSheetScannerService
==========================
Thin wrapper around ``omr_core.process_sheet`` so Django uploads use the same
ArUco → 300 DPI → inner-core → z-score pipeline as the mobile Python sidecar.
"""

from decimal import Decimal
from pathlib import Path

from .omr_core import is_correct, process_sheet


def _truncate_flag_reason(reason: str | None, max_len: int = 255) -> str | None:
    if not reason:
        return reason
    reason = reason.strip()
    if len(reason) <= max_len:
        return reason
    return reason[: max_len - 1].rstrip() + "…"


class BubbleSheetScannerService:
    """
    Usage::

        svc = BubbleSheetScannerService()
        result = svc.scan(image_path, template_obj)
    """

    def scan(self, image_path: str | Path, template) -> dict:
        meta = template.layout_metadata or {}
        if not meta.get("items"):
            return self._flagged(
                "Template has no layout metadata; regenerate the sheet first."
            )

        core = process_sheet(str(image_path), meta, template.answer_key or {})
        return {
            "student_identifier": core.student_identifier,
            "responses": core.responses,
            "score_raw": Decimal(str(core.correct_count)),
            "score_percent": Decimal(str(round(core.score_percent, 2))),
            "max_score": Decimal(str(core.max_score)),
            "is_flagged": core.is_flagged,
            "flag_reason": _truncate_flag_reason(core.flag_reason),
        }

    @staticmethod
    def _flagged(reason: str) -> dict:
        return {
            "student_identifier": None,
            "responses": {},
            "score_raw": Decimal("0"),
            "score_percent": Decimal("0"),
            "max_score": Decimal("0"),
            "is_flagged": True,
            "flag_reason": _truncate_flag_reason(reason),
        }

    @staticmethod
    def _grade(responses: dict, answer_key: dict) -> tuple[Decimal, Decimal, Decimal]:
        if not answer_key:
            return Decimal("0"), Decimal("0"), Decimal("0")
        key = {str(k): str(v) for k, v in answer_key.items() if str(v or "").strip()}
        if not key:
            return Decimal("0"), Decimal("0"), Decimal("0")
        correct = sum(1 for k, v in key.items() if is_correct(responses.get(k), v))
        max_score = Decimal(str(len(key)))
        score_raw = Decimal(str(correct))
        score_percent = (
            (score_raw / max_score * 100).quantize(Decimal("0.01"))
            if max_score > 0
            else Decimal("0")
        )
        return score_raw, max_score, score_percent
