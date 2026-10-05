"""Recreate OMR pipeline tables that are recorded as migrated but missing.

Deleting an assessment or course cascades through these tables; when they are
absent the delete fails with ``relation "omr_grading_jobs" does not exist``.
Creates only the tables that are missing, so it is a no-op elsewhere.
"""

from django.db import migrations

MODELS_IN_FK_ORDER = (
    "OmrTemplateProfile",
    "OmrGradingJob",
    "OmrJobResult",
    "OmrReviewAction",
)


def create_missing(apps, schema_editor):
    existing = set(schema_editor.connection.introspection.table_names())
    for name in MODELS_IN_FK_ORDER:
        model = apps.get_model("grading", name)
        if model._meta.db_table not in existing:
            schema_editor.create_model(model)


class Migration(migrations.Migration):

    dependencies = [
        ("grading", "0008_quick_exams"),
    ]

    operations = [
        migrations.RunPython(create_missing, migrations.RunPython.noop),
    ]
