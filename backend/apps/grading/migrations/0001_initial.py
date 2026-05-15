import django.db.models.deletion
import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("integrations", "0006_syllabus_content"),
    ]

    operations = [
        migrations.CreateModel(
            name="OmrTemplateProfile",
            fields=[
                ("template_id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=120)),
                ("template_json_path", models.TextField()),
                ("evaluation_json_path", models.TextField()),
                ("form_code", models.CharField(blank=True, max_length=50, null=True)),
                ("total_items", models.IntegerField(default=0)),
                ("passing_score", models.DecimalField(blank=True, decimal_places=2, max_digits=7, null=True)),
                ("confidence_threshold", models.DecimalField(decimal_places=4, default=0.85, max_digits=5)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "course",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="omr_templates", to="integrations.course"),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_omr_templates",
                        to="integrations.userprofile",
                    ),
                ),
            ],
            options={
                "db_table": "omr_template_profiles",
                "constraints": [models.UniqueConstraint(fields=("course", "name"), name="uq_omr_template_course_name")],
            },
        ),
        migrations.CreateModel(
            name="OmrGradingJob",
            fields=[
                ("job_id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("queued", "Queued"),
                            ("processing", "Processing"),
                            ("review_required", "Review Required"),
                            ("ready_to_import", "Ready To Import"),
                            ("imported", "Imported"),
                            ("failed", "Failed"),
                            ("cancelled", "Cancelled"),
                        ],
                        default="queued",
                        max_length=30,
                    ),
                ),
                ("progress_pct", models.IntegerField(default=0)),
                ("input_bundle_path", models.TextField()),
                ("output_bundle_path", models.TextField(blank=True, null=True)),
                ("total_sheets", models.IntegerField(default=0)),
                ("processed_sheets", models.IntegerField(default=0)),
                ("flagged_sheets", models.IntegerField(default=0)),
                ("error_message", models.TextField(blank=True, null=True)),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "assessment",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="omr_jobs", to="integrations.assessment"),
                ),
                (
                    "course",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="omr_jobs", to="integrations.course"),
                ),
                (
                    "submitted_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="submitted_omr_jobs",
                        to="integrations.userprofile",
                    ),
                ),
                (
                    "template",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="grading_jobs", to="grading.omrtemplateprofile"),
                ),
            ],
            options={
                "db_table": "omr_grading_jobs",
                "indexes": [
                    models.Index(fields=["course", "assessment"], name="idx_omr_job_course_assessment"),
                    models.Index(fields=["status"], name="idx_omr_job_status"),
                    models.Index(fields=["created_at"], name="idx_omr_job_created"),
                ],
            },
        ),
        migrations.CreateModel(
            name="OmrJobResult",
            fields=[
                ("result_id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("sheet_filename", models.CharField(max_length=255)),
                ("student_identifier_raw", models.CharField(max_length=255)),
                ("student_identifier_normalized", models.CharField(db_index=True, max_length=255)),
                ("score_raw", models.DecimalField(decimal_places=2, max_digits=7)),
                ("score_percent", models.DecimalField(decimal_places=2, max_digits=5)),
                ("max_score", models.DecimalField(decimal_places=2, max_digits=7)),
                ("confidence", models.DecimalField(blank=True, decimal_places=4, max_digits=5, null=True)),
                ("is_flagged", models.BooleanField(db_index=True, default=False)),
                ("flag_reason", models.CharField(blank=True, max_length=255, null=True)),
                ("responses_json", models.JSONField(blank=True, default=dict)),
                ("omr_metrics_json", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "job",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="results", to="grading.omrgradingjob"),
                ),
                (
                    "mapped_assessment_result",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="omr_rows",
                        to="integrations.assessmentscoreresult",
                    ),
                ),
            ],
            options={
                "db_table": "omr_job_results",
                "indexes": [
                    models.Index(fields=["job", "is_flagged"], name="idx_omr_result_job_flagged"),
                    models.Index(fields=["student_identifier_normalized"], name="idx_omr_result_student_norm"),
                ],
            },
        ),
        migrations.CreateModel(
            name="OmrReviewAction",
            fields=[
                ("action_id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "action_type",
                    models.CharField(
                        choices=[
                            ("confirm", "Confirm"),
                            ("edit_student", "Edit Student"),
                            ("edit_score", "Edit Score"),
                            ("exclude", "Exclude"),
                        ],
                        max_length=20,
                    ),
                ),
                ("before_json", models.JSONField(blank=True, default=dict)),
                ("after_json", models.JSONField(blank=True, default=dict)),
                ("comment", models.TextField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "job",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="review_actions", to="grading.omrgradingjob"),
                ),
                (
                    "result",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="review_actions", to="grading.omrjobresult"),
                ),
                (
                    "reviewer",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="omr_review_actions",
                        to="integrations.userprofile",
                    ),
                ),
            ],
            options={
                "db_table": "omr_review_actions",
                "indexes": [
                    models.Index(fields=["job", "created_at"], name="idx_omr_review_job_created"),
                ],
            },
        ),
    ]
