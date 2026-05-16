import re
from decimal import Decimal

from apps.grading.models import OmrGradingJob, OmrJobResult


class OmrMapperService:
    """
    First-pass mapper for normalizing student identifiers and basic row flagging.
    """

    @staticmethod
    def normalize_student_identifier(raw_identifier: str) -> str:
        if not raw_identifier:
            return ""
        normalized = re.sub(r"[^A-Za-z0-9]", "", str(raw_identifier).upper())
        return normalized

    def apply_first_pass_mapping(self, job: OmrGradingJob):
        updated_rows = 0
        flagged_rows = 0

        for row in OmrJobResult.objects.filter(job=job).iterator():
            normalized = self.normalize_student_identifier(row.student_identifier_raw)
            row.student_identifier_normalized = normalized

            reasons = []
            if not normalized:
                reasons.append("missing_student_identifier")
            if row.confidence is not None and row.confidence < Decimal("0.8500"):
                reasons.append("low_confidence")
            if row.score_raw > row.max_score:
                reasons.append("score_exceeds_max")

            row.is_flagged = bool(reasons)
            row.flag_reason = ",".join(reasons) if reasons else None
            row.save(
                update_fields=[
                    "student_identifier_normalized",
                    "is_flagged",
                    "flag_reason",
                    "updated_at",
                ]
            )
            updated_rows += 1
            if row.is_flagged:
                flagged_rows += 1

        return {"updated_rows": updated_rows, "flagged_rows": flagged_rows}
