import django.db.models.deletion
from django.db import migrations, models
from django.db.models import Q, Value
from django.db.models.functions import Concat


def move_section_names_to_sections(apps, schema_editor):
    CourseLoad = apps.get_model('integrations', 'CourseLoad')
    Section = apps.get_model('integrations', 'Section')
    for load in CourseLoad.objects.select_related('faculty').exclude(section_legacy=''):
        name = load.section_legacy.strip()[:50]
        if not name:
            continue
        institution_id = load.faculty.institution_id
        section = Section.objects.annotate(
            display_label=Concat('program__code', Value(' '), 'code'),
        ).filter(
            Q(institution_id=institution_id) | Q(program__institution_id=institution_id),
            Q(code__iexact=name) | Q(display_label__iexact=name),
        ).first() or Section.objects.create(institution_id=institution_id, code=name)
        section.taken_courses.add(load.course_id)
        load.section = section
        load.save(update_fields=['section'])


def restore_section_names(apps, schema_editor):
    CourseLoad = apps.get_model('integrations', 'CourseLoad')
    for load in CourseLoad.objects.select_related('section').exclude(section__isnull=True):
        load.section_legacy = load.section.code
        load.save(update_fields=['section_legacy'])


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0026_section_institution_courses_blocks'),
    ]

    operations = [
        migrations.AlterUniqueTogether(name='courseload', unique_together=set()),
        migrations.RenameField(model_name='courseload', old_name='section', new_name='section_legacy'),
        migrations.AddField(
            model_name='courseload',
            name='section',
            field=models.ForeignKey(
                blank=True, db_column='section_id', null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='course_loads', to='integrations.section',
            ),
        ),
        migrations.RunPython(move_section_names_to_sections, restore_section_names),
        migrations.RemoveField(model_name='courseload', name='section_legacy'),
        migrations.AlterUniqueTogether(
            name='courseload',
            unique_together={('course', 'faculty', 'section')},
        ),
    ]
