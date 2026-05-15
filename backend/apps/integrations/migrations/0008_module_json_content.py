from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("integrations", "0007_ilo_bloom_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="module",
            name="module_content",
            field=models.JSONField(blank=True, null=True),
        ),
    ]
