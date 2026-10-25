from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('integrations', '0034_institutioncustomization_syllabus_style_profile'),
    ]

    operations = [
        migrations.AddField(
            model_name='institutioncustomization',
            name='syllabus_field_map',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='institutioncustomization',
            name='syllabus_preview_blocks',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
