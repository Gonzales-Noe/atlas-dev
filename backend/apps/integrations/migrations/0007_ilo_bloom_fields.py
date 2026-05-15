from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("integrations", "0006_syllabus_content"),
    ]

    operations = [
        migrations.AddField(
            model_name="ilo",
            name="bloom_level",
            field=models.CharField(
                max_length=50,
                null=True,
                blank=True,
                help_text="Bloom's Taxonomy level: Remember/Understand/Apply/Analyze/Evaluate/Create",
            ),
        ),
        migrations.AddField(
            model_name="ilo",
            name="bloom_verb",
            field=models.CharField(
                max_length=50,
                null=True,
                blank=True,
                help_text="First action verb detected in the ILO statement",
            ),
        ),
    ]
