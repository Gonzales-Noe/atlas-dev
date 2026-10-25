from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('integrations', '0033_course_request'),
    ]

    operations = [
        migrations.AddField(
            model_name='institutioncustomization',
            name='syllabus_style_profile',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
