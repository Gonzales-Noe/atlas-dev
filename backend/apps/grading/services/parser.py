import csv
from decimal import Decimal
from pathlib import Path

from django.conf import settings

from apps.grading.models import OmrGradingJob, OmrJobResult
from apps.grading.services.mapper import OmrMapperService


class OmrOutputParserService:
    """
    Output parsing skeleton for OMRChecker artifacts.
    Current implementation reads a conventional CSV if present.
    """

    CSV_CANDIDATES = (
        "results.csv",
        "output.csv",
        "scores.csv",
    )

    def parse_job_outputs(self, job: OmrGradingJob):
        media_root = Path(settings.MEDIA_ROOT)
        output_path = Path(job.output_bundle_path or "")
        if not output_path:
            return {"parsed_rows": 0, "detail": "No output bundle path set."}

        absolute_output_dir = media_root / output_path
        if not absolute_output_dir.exists():
            return {"parsed_rows": 0, "detail": "Output bundle directory does not exist yet."}

        csv_file = self._find_output_csv(absolute_output_dir)
        if not csv_file:
            return {"parsed_rows": 0, "detail": "No parseable CSV found in output bundle."}

        parsed_rows = 0
        with csv_file.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            for raw in reader:
                payload = self._normalize_row(raw)
                OmrJobResult.objects.update_or_create(
                    job=job,
                    sheet_filename=payload["sheet_filename"],
                    student_identifier_raw=payload["student_identifier_raw"],
                    defaults=payload,
                )
                parsed_rows += 1

        mapper = OmrMapperService()
        map_stats = mapper.apply_first_pass_mapping(job)
        return {"parsed_rows": parsed_rows, **map_stats}

    def _find_output_csv(self, output_dir: Path):
        # Named candidates in root first.
        for candidate in self.CSV_CANDIDATES:
            candidate_path = output_dir / candidate
            if candidate_path.exists() and candidate_path.is_file():
                return candidate_path

        # OMRChecker writes its CSV under a Results/ subdirectory.
        results_subdir = output_dir / "Results"
        if results_subdir.is_dir():
            for candidate_path in sorted(results_subdir.glob("*.csv")):
                if candidate_path.is_file():
                    return candidate_path

        # Fallback: any CSV in the root output directory.
        for candidate_path in sorted(output_dir.glob("*.csv")):
            if candidate_path.is_file():
                return candidate_path

        return None

    def _normalize_row(self, raw):
        def _dec(value, default="0"):
            try:
                return Decimal(str(value).strip())
            except Exception:
                return Decimal(default)

        # Try column names used by OMRChecker and various CSV conventions.
        student_raw = (
            raw.get("student_identifier")
            or raw.get("Student ID")
            or raw.get("student_id")
            or raw.get("Student-Id")
            or raw.get("roll_number")
            or raw.get("Roll No")
            or raw.get("id")
            or ""
        )
        # OMRChecker uses 'file_id' for the source image filename.
        sheet_filename = (
            raw.get("sheet_filename")
            or raw.get("file_id")
            or raw.get("source_file")
            or "unknown"
        )
        # OMRChecker may use 'Total Score' instead of 'score'.
        score_raw = _dec(raw.get("score") or raw.get("Total Score"), "0")
        max_score = _dec(raw.get("max_score") or raw.get("Max Score"), "100")
        percent = _dec(raw.get("score_percent"), "0")
        if percent == Decimal("0") and max_score > Decimal("0"):
            percent = (score_raw / max_score) * Decimal("100")

        confidence = raw.get("confidence")
        confidence_val = None
        if confidence not in (None, ""):
            try:
                confidence_val = Decimal(str(confidence).strip())
            except Exception:
                confidence_val = None

        return {
            "sheet_filename": str(sheet_filename),
            "student_identifier_raw": str(student_raw),
            "student_identifier_normalized": "",
            "score_raw": score_raw,
            "score_percent": percent,
            "max_score": max_score,
            "confidence": confidence_val,
            "is_flagged": False,
            "flag_reason": None,
            "responses_json": {},
            "omr_metrics_json": {
                "parser_source_columns": list(raw.keys()),
            },
        }
