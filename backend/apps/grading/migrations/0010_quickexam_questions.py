from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("grading", "0009_restore_omr_tables"),
    ]

    operations = [
        migrations.AddField(
            model_name="quickexam",
            name="questions",
            field=models.JSONField(blank=True, null=True),
        ),
    ]
