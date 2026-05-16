import django.db.models.deletion
import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("grading", "0001_initial"),
        ("integrations", "0006_syllabus_content"),
    ]

    operations = [
        migrations.CreateModel(
            name="BubbleSheetTemplate",
            fields=[
                (
                    "template_id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("name", models.CharField(max_length=150)),
                ("total_items", models.IntegerField(default=30)),
                ("num_choices", models.IntegerField(default=4)),
                ("parts", models.JSONField(default=list)),
                ("has_essay", models.BooleanField(default=False)),
                ("essay_lines", models.IntegerField(default=10)),
                ("answer_key", models.JSONField(default=dict)),
                ("layout_metadata", models.JSONField(default=dict)),
                (
                    "passing_score",
                    models.DecimalField(
                        blank=True, decimal_places=2, max_digits=7, null=True
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "assessment",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="bubble_sheet_templates",
                        to="integrations.assessment",
                    ),
                ),
                (
                    "course",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="bubble_sheet_templates",
                        to="integrations.course",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_bubble_templates",
                        to="integrations.userprofile",
                    ),
                ),
            ],
            options={
                "db_table": "bubble_sheet_templates",
            },
        ),
        migrations.AddIndex(
            model_name="bubblesheettemplate",
            index=models.Index(fields=["course"], name="idx_bst_course"),
        ),
        migrations.CreateModel(
            name="BubbleSheetScan",
            fields=[
                (
                    "scan_id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("student_identifier", models.CharField(db_index=True, max_length=100)),
                ("responses", models.JSONField(default=dict)),
                (
                    "score_raw",
                    models.DecimalField(
                        blank=True, decimal_places=2, max_digits=7, null=True
                    ),
                ),
                (
                    "score_percent",
                    models.DecimalField(
                        blank=True, decimal_places=2, max_digits=5, null=True
                    ),
                ),
                (
                    "max_score",
                    models.DecimalField(
                        blank=True, decimal_places=2, max_digits=7, null=True
                    ),
                ),
                ("is_flagged", models.BooleanField(default=False)),
                ("flag_reason", models.CharField(blank=True, max_length=255, null=True)),
                ("image_path", models.TextField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "scanned_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="submitted_bubble_scans",
                        to="integrations.userprofile",
                    ),
                ),
                (
                    "template",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="scans",
                        to="grading.bubblesheettemplate",
                    ),
                ),
            ],
            options={
                "db_table": "bubble_sheet_scans",
            },
        ),
        migrations.AddIndex(
            model_name="bubblesheetscan",
            index=models.Index(
                fields=["template", "student_identifier"],
                name="idx_bss_template_student",
            ),
        ),
        migrations.AddIndex(
            model_name="bubblesheetscan",
            index=models.Index(fields=["is_flagged"], name="idx_bss_flagged"),
        ),
    ]
