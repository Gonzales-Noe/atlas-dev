import logging

try:
    from celery import shared_task
except ImportError:  # pragma: no cover - fallback for local envs without celery
    def shared_task(func=None, **_kwargs):
        if func is None:
            def decorator(inner):
                return inner
            return decorator
        return func

from django.utils import timezone

from apps.grading.models import OmrGradingJob, OmrJobStatus
from apps.grading.services.parser import OmrOutputParserService
from apps.grading.services.runner import OmrCheckerRunnerService

logger = logging.getLogger(__name__)


@shared_task
def run_omr_job(job_id: str):
    """
    Phase-4: Full OMRChecker execution pipeline.

    Steps:
      1. Transition job to PROCESSING.
      2. Extract input bundle, stage template files, invoke OMRChecker subprocess
         (OmrCheckerRunnerService).
      3. Parse OMRChecker output CSV into OmrJobResult rows (OmrOutputParserService).
      4. Apply first-pass identifier normalisation and flagging (OmrMapperService,
         called internally by the parser).
      5. Set final status (REVIEW_REQUIRED / READY_TO_IMPORT / FAILED).
    """
    try:
        job = OmrGradingJob.objects.get(job_id=job_id)
    except OmrGradingJob.DoesNotExist:
        return {"success": False, "detail": "Job not found."}

    if job.status in (OmrJobStatus.CANCELLED, OmrJobStatus.IMPORTED):
        return {"success": False, "detail": f"Job in terminal state: {job.status}"}

    # ── Step 1: Mark as processing ────────────────────────────────────────────
    job.status = OmrJobStatus.PROCESSING
    job.progress_pct = 5
    if not job.started_at:
        job.started_at = timezone.now()
    job.save(update_fields=["status", "progress_pct", "started_at"])

    # ── Step 2: Run OMRChecker ────────────────────────────────────────────────
    runner = OmrCheckerRunnerService()
    run_result = runner.run(job)

    # Capture any subprocess stderr/stdout for diagnostics.
    stderr_snippet = (run_result.get("stderr") or "")[-2000:]
    stdout_snippet = (run_result.get("stdout") or "")[-1000:]
    returncode = run_result.get("returncode")

    if not run_result["success"]:
        logger.warning(
            "OMRChecker failed for job %s (rc=%s): %s",
            job_id,
            returncode,
            stderr_snippet,
        )

    job.progress_pct = 40
    job.save(update_fields=["progress_pct"])

    # ── Step 3 + 4: Parse output CSV → OmrJobResult rows + normalise ─────────
    parser = OmrOutputParserService()
    parse_stats = parser.parse_job_outputs(job)

    parsed_rows = parse_stats.get("parsed_rows", 0)
    flagged_rows = parse_stats.get("flagged_rows", 0)

    # ── Step 5: Set final status ──────────────────────────────────────────────
    if parsed_rows == 0 and not run_result["success"]:
        # OMRChecker failed AND produced no parseable output → FAILED.
        diag_parts = []
        if stderr_snippet:
            diag_parts.append(f"stderr: {stderr_snippet}")
        if stdout_snippet:
            diag_parts.append(f"stdout: {stdout_snippet}")
        if returncode is not None:
            diag_parts.append(f"exit code: {returncode}")
        job.status = OmrJobStatus.FAILED
        job.error_message = "\n".join(diag_parts) or "OMRChecker produced no output."
        job.progress_pct = 0
    else:
        job.processed_sheets = parsed_rows
        job.total_sheets = max(job.total_sheets, parsed_rows)
        job.flagged_sheets = flagged_rows
        job.progress_pct = 100 if parsed_rows > 0 else 60
        job.status = (
            OmrJobStatus.REVIEW_REQUIRED
            if flagged_rows > 0
            else OmrJobStatus.READY_TO_IMPORT
        )

    job.finished_at = timezone.now()
    job.save(
        update_fields=[
            "status",
            "progress_pct",
            "processed_sheets",
            "total_sheets",
            "flagged_sheets",
            "error_message",
            "finished_at",
        ]
    )

    return {
        "success": job.status != OmrJobStatus.FAILED,
        "job_id": str(job.job_id),
        "status": job.status,
        "omrchecker_returncode": returncode,
        "parse_stats": parse_stats,
    }
