from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("integrations", "0005_parent_child_rag"),
    ]

    operations = [
        migrations.AddField(
            model_name="syllabus",
            name="syllabus_content",
            field=models.JSONField(blank=True, null=True),
        ),
    ]
