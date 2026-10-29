from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0037_merge_course_module_and_syllabus_preview'),
        ('integrations', '0038_course_category_curriculum_blocks'),
    ]

    operations = [
        migrations.AddField(
            model_name='assessment',
            name='qa_report',
            field=models.JSONField(blank=True, null=True),
        ),
    ]
