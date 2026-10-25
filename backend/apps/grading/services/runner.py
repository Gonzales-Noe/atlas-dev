"""
OmrCheckerRunnerService – Phase 4 implementation.

Handles the full OMRChecker execution pipeline for a grading job:
  1. Input extraction  – unpack the job's input_bundle_path into a clean work dir.
  2. Template staging  – copy template.json / evaluation.json alongside the images.
  3. Subprocess run    – invoke the configured OMRChecker CLI, capture stdout/stderr.
  4. Output wiring     – point job.output_bundle_path at the directory OMRChecker wrote.
"""

import logging
import shutil
import subprocess
import zipfile
from pathlib import Path

from django.conf import settings

from apps.grading.models import OmrGradingJob

logger = logging.getLogger(__name__)


class OmrCheckerRunnerService:
    """
    Executes OMRChecker as a subprocess for a given grading job.

    Returns dict:
        {
            "success":    bool,
            "returncode": int | None,
            "stdout":     str,
            "stderr":     str,
            "output_dir": str | None,   # relative path under MEDIA_ROOT
        }
    """

    def run(self, job: OmrGradingJob) -> dict:
        media_root = Path(settings.MEDIA_ROOT)

        # ── Working directories ───────────────────────────────────────────────
        work_base = media_root / "omr" / "work" / str(job.job_id)
        input_work_dir = work_base / "inputs"
        output_work_dir = work_base / "outputs"
        input_work_dir.mkdir(parents=True, exist_ok=True)
        output_work_dir.mkdir(parents=True, exist_ok=True)

        # ── 1. Extract input bundle ───────────────────────────────────────────
        bundle_abs = media_root / job.input_bundle_path
        extract_result = self._extract_bundle(bundle_abs, input_work_dir)
        if not extract_result["success"]:
            return {
                **extract_result,
                "returncode": None,
                "stdout": "",
                "output_dir": None,
            }

        # ── 2. Stage template + evaluation JSON ───────────────────────────────
        template = job.template
        for src_rel, dst_name in [
            (template.template_json_path, "template.json"),
            (template.evaluation_json_path, "evaluation.json"),
        ]:
            src_abs = media_root / src_rel
            if src_abs.exists():
                shutil.copy2(src_abs, input_work_dir / dst_name)
            else:
                logger.warning("OMR runner: expected file missing at %s", src_abs)

        # ── 3. Invoke OMRChecker ──────────────────────────────────────────────
        cmd_result = self._invoke_omrchecker(input_work_dir, output_work_dir)

        # ── 4. Persist output_bundle_path (even on failure, so partial output
        #        can be inspected / retried by the parser) ────────────────────
        output_rel = str(
            Path("omr") / "work" / str(job.job_id) / "outputs"
        ).replace("\\", "/")
        job.output_bundle_path = output_rel
        job.save(update_fields=["output_bundle_path"])

        return {**cmd_result, "output_dir": output_rel}

    # ── Bundle extraction helpers ─────────────────────────────────────────────

    def _extract_bundle(self, bundle_path: Path, target_dir: Path) -> dict:
        """Dispatch to the appropriate extractor based on file extension."""
        if not bundle_path.exists():
            return {
                "success": False,
                "stderr": f"Input bundle not found: {bundle_path}",
            }

        suffix = bundle_path.suffix.lower()
        if suffix == ".zip":
            return self._extract_zip(bundle_path, target_dir)
        if suffix == ".pdf":
            return self._extract_pdf(bundle_path, target_dir)
        if suffix in {".jpg", ".jpeg", ".png"}:
            shutil.copy2(bundle_path, target_dir / bundle_path.name)
            return {"success": True, "stderr": ""}
        return {
            "success": False,
            "stderr": f"Unsupported bundle file type: {suffix}",
        }

    @staticmethod
    def _extract_zip(zip_path: Path, target_dir: Path) -> dict:
        """Extract a zip archive, rejecting path-traversal entries."""
        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                for member in zf.namelist():
                    member_path = Path(member)
                    if member_path.is_absolute() or ".." in member_path.parts:
                        return {
                            "success": False,
                            "stderr": (
                                f"Unsafe zip entry rejected: {member}"
                            ),
                        }
                zf.extractall(target_dir)
            return {"success": True, "stderr": ""}
        except zipfile.BadZipFile as exc:
            return {"success": False, "stderr": f"Bad zip file: {exc}"}
        except Exception as exc:  # noqa: BLE001
            return {"success": False, "stderr": f"Zip extraction error: {exc}"}

    @staticmethod
    def _extract_pdf(pdf_path: Path, target_dir: Path) -> dict:
        """
        Convert each PDF page to a PNG at 144 dpi using PyMuPDF.
        PyMuPDF is already declared in requirements.txt as pymupdf>=1.24.0.
        """
        try:
            import pymupdf  # noqa: PLC0415
        except ImportError:
            return {
                "success": False,
                "stderr": (
                    "PyMuPDF is not installed; "
                    "cannot convert PDF bundles to images."
                ),
            }

        try:
            doc = pymupdf.open(str(pdf_path))
            scale = pymupdf.Matrix(2.0, 2.0)  # 2× → ~144 dpi
            for page_num, page in enumerate(doc, start=1):
                pix = page.get_pixmap(matrix=scale, alpha=False)
                pix.save(str(target_dir / f"page_{page_num:04d}.png"))
            doc.close()
            return {"success": True, "stderr": ""}
        except Exception as exc:  # noqa: BLE001
            return {"success": False, "stderr": f"PDF conversion error: {exc}"}

    # ── Subprocess execution ──────────────────────────────────────────────────

    def _invoke_omrchecker(self, input_dir: Path, output_dir: Path) -> dict:
        """Build the CLI command and run OMRChecker as a subprocess."""
        cmd = self._build_command(input_dir, output_dir)
        timeout = int(getattr(settings, "OMR_JOB_TIMEOUT_SECONDS", 300))

        logger.info("OMR runner: %s", " ".join(str(c) for c in cmd))
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            if proc.returncode != 0:
                logger.warning(
                    "OMRChecker exited %d.\nSTDOUT: %s\nSTDERR: %s",
                    proc.returncode,
                    proc.stdout[-3000:],
                    proc.stderr[-3000:],
                )
            else:
                logger.info(
                    "OMRChecker completed successfully.\nSTDOUT: %s",
                    proc.stdout[-2000:],
                )
            return {
                "success": proc.returncode == 0,
                "returncode": proc.returncode,
                "stdout": proc.stdout,
                "stderr": proc.stderr,
            }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "returncode": None,
                "stdout": "",
                "stderr": f"OMRChecker timed out after {timeout}s.",
            }
        except FileNotFoundError:
            return {
                "success": False,
                "returncode": None,
                "stdout": "",
                "stderr": (
                    "OMRChecker executable not found. "
                    "Install OMRChecker or set OMR_CHECKER_CMD in settings."
                ),
            }

    @staticmethod
    def _build_command(input_dir: Path, output_dir: Path) -> list:
        """
        Assemble the subprocess command list from settings.OMR_CHECKER_CMD.

        Examples of valid OMR_CHECKER_CMD values:
          "omrchecker"                             – installed package CLI
          ["python", "/opt/OMRChecker/main.py"]   – path to a repo checkout
        """
        raw = getattr(settings, "OMR_CHECKER_CMD", "omrchecker")
        base = raw.split() if isinstance(raw, str) else list(raw)
        return base + [
            "--inputDir", str(input_dir),
            "--outputDir", str(output_dir),
        ]
