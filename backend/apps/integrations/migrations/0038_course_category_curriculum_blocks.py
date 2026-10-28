from django.db import migrations, models


NEW_CHOICES = [
    ('ged', 'General Education'),
    ('common', 'Common Courses'),
    ('professional', 'Professional Courses'),
    ('mandated', 'Mandated Courses'),
]


def remap_categories(apps, schema_editor):
    """Fold retired labels into the four curriculum blocks.

    Elective, laboratory, and other were program courses. Physical education
    is a mandated course. Internship, thesis, and capstone stay professional.
    """
    Course = apps.get_model('integrations', 'Course')
    CourseRequest = apps.get_model('integrations', 'CourseRequest')
    for model in (Course, CourseRequest):
        model.objects.filter(category__in=['elective', 'laboratory', 'other']).update(category='professional')
        model.objects.filter(category='pe').update(category='mandated')


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0036_section_year_number'),
    ]

    operations = [
        migrations.RunPython(remap_categories, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='course',
            name='category',
            field=models.CharField(
                choices=NEW_CHOICES,
                default='professional',
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='courserequest',
            name='category',
            field=models.CharField(
                choices=NEW_CHOICES,
                default='professional',
                max_length=20,
            ),
        ),
    ]
