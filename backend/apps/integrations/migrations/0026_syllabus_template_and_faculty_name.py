from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('integrations', '0025_add_college_to_userprofile'),
    ]

    operations = [
        migrations.AddField(
            model_name='institutioncustomization',
            name='syllabus_template_name',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='institutioncustomization',
            name='syllabus_template',
            field=models.FileField(blank=True, upload_to='syllabus_templates/'),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='full_name',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
    ]
