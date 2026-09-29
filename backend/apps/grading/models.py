import uuid
from decimal import Decimal

from django.db import models

from apps.integrations.models import (
    Assessment,
    AssessmentScoreResult,
    Course,
    UserProfile,
)


class OmrJobStatus(models.TextChoices):
    QUEUED = "queued", "Queued"
    PROCESSING = "processing", "Processing"
    REVIEW_REQUIRED = "review_required", "Review Required"
    READY_TO_IMPORT = "ready_to_import", "Ready To Import"
    IMPORTED = "imported", "Imported"
    FAILED = "failed", "Failed"
    CANCELLED = "cancelled", "Cancelled"


class OmrReviewActionType(models.TextChoices):
    CONFIRM = "confirm", "Confirm"
    EDIT_STUDENT = "edit_student", "Edit Student"
    EDIT_SCORE = "edit_score", "Edit Score"
    EXCLUDE = "exclude", "Exclude"


class OmrTemplateProfile(models.Model):
    template_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="omr_templates")
    name = models.CharField(max_length=120)
    template_json_path = models.TextField()
    evaluation_json_path = models.TextField()
    form_code = models.CharField(max_length=50, null=True, blank=True)
    total_items = models.IntegerField(default=0)
    passing_score = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    confidence_threshold = models.DecimalField(max_digits=5, decimal_places=4, default=Decimal('0.8500'))
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        UserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_omr_templates",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "omr_template_profiles"
        constraints = [
            models.UniqueConstraint(
                fields=["course", "name"], name="uq_omr_template_course_name"
            )
        ]


class OmrGradingJob(models.Model):
    job_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="omr_jobs")
    assessment = models.ForeignKey(
        Assessment, on_delete=models.CASCADE, related_name="omr_jobs"
    )
    template = models.ForeignKey(
        OmrTemplateProfile, on_delete=models.PROTECT, related_name="grading_jobs"
    )
    submitted_by = models.ForeignKey(
        UserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="submitted_omr_jobs",
    )
    status = models.CharField(
        max_length=30, choices=OmrJobStatus.choices, default=OmrJobStatus.QUEUED
    )
    progress_pct = models.IntegerField(default=0)
    input_bundle_path = models.TextField()
    output_bundle_path = models.TextField(null=True, blank=True)
    total_sheets = models.IntegerField(default=0)
    processed_sheets = models.IntegerField(default=0)
    flagged_sheets = models.IntegerField(default=0)
    error_message = models.TextField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "omr_grading_jobs"
        indexes = [
            models.Index(fields=["course", "assessment"], name="idx_omr_job_course_assessment"),
            models.Index(fields=["status"], name="idx_omr_job_status"),
            models.Index(fields=["created_at"], name="idx_omr_job_created"),
        ]


class OmrJobResult(models.Model):
    result_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job = models.ForeignKey(
        OmrGradingJob, on_delete=models.CASCADE, related_name="results"
    )
    sheet_filename = models.CharField(max_length=255)
    student_identifier_raw = models.CharField(max_length=255)
    student_identifier_normalized = models.CharField(max_length=255, db_index=True)
    score_raw = models.DecimalField(max_digits=7, decimal_places=2)
    score_percent = models.DecimalField(max_digits=5, decimal_places=2)
    max_score = models.DecimalField(max_digits=7, decimal_places=2)
    confidence = models.DecimalField(max_digits=5, decimal_places=4, null=True, blank=True)
    is_flagged = models.BooleanField(default=False, db_index=True)
    flag_reason = models.CharField(max_length=255, null=True, blank=True)
    responses_json = models.JSONField(default=dict, blank=True)
    omr_metrics_json = models.JSONField(default=dict, blank=True)
    mapped_assessment_result = models.ForeignKey(
        AssessmentScoreResult,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="omr_rows",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "omr_job_results"
        indexes = [
            models.Index(fields=["job", "is_flagged"], name="idx_omr_result_job_flagged"),
            models.Index(
                fields=["student_identifier_normalized"], name="idx_omr_result_student_norm"
            ),
        ]


class OmrReviewAction(models.Model):
    action_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job = models.ForeignKey(
        OmrGradingJob, on_delete=models.CASCADE, related_name="review_actions"
    )
    result = models.ForeignKey(
        OmrJobResult, on_delete=models.CASCADE, related_name="review_actions"
    )
    reviewer = models.ForeignKey(
        UserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="omr_review_actions",
    )
    action_type = models.CharField(max_length=20, choices=OmrReviewActionType.choices)
    before_json = models.JSONField(default=dict, blank=True)
    after_json = models.JSONField(default=dict, blank=True)
    comment = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "omr_review_actions"
        indexes = [
            models.Index(fields=["job", "created_at"], name="idx_omr_review_job_created"),
        ]


# ── Bubble Sheet Models ───────────────────────────────────────────────────────

class BubbleSheetTemplate(models.Model):
    """
    Defines the layout and configuration of a printable bubble sheet.
    Stores layout_metadata so the scanner knows exact bubble positions.
    """

    template_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey(
        Course, on_delete=models.CASCADE, related_name="bubble_sheet_templates"
    )
    assessment = models.ForeignKey(
        Assessment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bubble_sheet_templates",
    )
    name = models.CharField(max_length=150)
    total_items = models.IntegerField(default=30)
    num_choices = models.IntegerField(default=4)  # 2–5  (A–B … A–E)
    # [{"label": "Part I", "start_item": 1, "end_item": 30}, ...]
    parts = models.JSONField(default=list)
    has_essay = models.BooleanField(default=False)
    essay_lines = models.IntegerField(default=10)
    # {"1": "A", "2": "B", ...}  — set separately after creation
    answer_key = models.JSONField(default=dict)
    # Computed by the generator; stores bubble centres (RL pts, bottom-left origin)
    # so the scanner can locate every circle without re-deriving positions.
    layout_metadata = models.JSONField(default=dict)
    passing_score = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    created_by = models.ForeignKey(
        UserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_bubble_templates",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "bubble_sheet_templates"
        indexes = [
            models.Index(fields=["course"], name="idx_bst_course"),
        ]


class BubbleSheetScan(models.Model):
    """
    Stores the result of scanning one student's completed bubble sheet.
    """

    scan_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template = models.ForeignKey(
        BubbleSheetTemplate, on_delete=models.CASCADE, related_name="scans"
    )
    scanned_by = models.ForeignKey(
        UserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="submitted_bubble_scans",
    )
    # Value decoded from the QR code on the sheet (student ID number, no PII)
    # Student ID decoded from the ID bubble grid below the QR code (e.g. "23-35007")
    student_identifier = models.CharField(max_length=64, db_index=True, null=True, blank=True)
    # {"1": "A", "2": "C", ...}  — detected answers
    responses = models.JSONField(default=dict)
    score_raw = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    score_percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    max_score = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    is_flagged = models.BooleanField(default=False)
    flag_reason = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "bubble_sheet_scans"
        indexes = [
            models.Index(
                fields=["template", "student_identifier"], name="idx_bss_template_student"
            ),
            models.Index(fields=["is_flagged"], name="idx_bss_flagged"),
        ]
