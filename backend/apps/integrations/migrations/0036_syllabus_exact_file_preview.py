from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('integrations', '0035_syllabus_field_map_preview'),
    ]

    operations = [
        migrations.AddField(
            model_name='institutioncustomization',
            name='syllabus_template_kind',
            field=models.CharField(blank=True, default='', max_length=16),
        ),
        migrations.AddField(
            model_name='institutioncustomization',
            name='syllabus_working_docx',
            field=models.FileField(blank=True, upload_to='syllabus_templates/working/'),
        ),
    ]
