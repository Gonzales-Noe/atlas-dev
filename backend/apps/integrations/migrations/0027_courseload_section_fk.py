import django.db.models.deletion
from django.db import migrations, models
from django.db.models import Q, Value
from django.db.models.functions import Concat

# Unique constraints on course_load are matched by columns rather than by name:
# the shared database went through two divergent migration histories, so the
# constraint names (and how many exist) cannot be predicted.
_DROP_SECTION_UNIQUES = """
DO $drop$
DECLARE
    target regclass := to_regclass('course_load');
    con text;
BEGIN
    IF target IS NULL THEN
        RETURN;
    END IF;
    FOR con IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = target AND c.contype = 'u'
          AND a.attname IN ('section', 'section_id')
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', target, con);
    END LOOP;
END
$drop$;
"""

_ADD_SECTION_UNIQUE = """
ALTER TABLE course_load
    ADD CONSTRAINT course_load_course_id_faculty_id_section_id_uniq
    UNIQUE (course_id, faculty_id, section_id);
"""

_DROP_SECTION_UNIQUE = """
ALTER TABLE course_load DROP CONSTRAINT IF EXISTS course_load_course_id_faculty_id_section_id_uniq;
"""


def _institution_sections(Section, institution_id):
    return Section.objects.filter(
        Q(institution_id=institution_id) | Q(program__institution_id=institution_id),
    )


def move_section_names_to_sections(apps, schema_editor):
    """Link each course load to a Section.

    Loads whose text section was wiped (0024_fix_courseload_section_column dropped
    the earlier section_id column) are recovered when exactly one section of the
    faculty's institution takes the course.
    """
    schema_editor.execute('SET CONSTRAINTS ALL IMMEDIATE')
    CourseLoad = apps.get_model('integrations', 'CourseLoad')
    Section = apps.get_model('integrations', 'Section')
    for load in CourseLoad.objects.select_related('faculty'):
        institution_id = load.faculty.institution_id
        name = load.section_legacy.strip()[:50]
        if name:
            section = _institution_sections(Section, institution_id).annotate(
                display_label=Concat('program__code', Value(' '), 'code'),
            ).filter(
                Q(code__iexact=name) | Q(display_label__iexact=name),
            ).first() or Section.objects.create(institution_id=institution_id, code=name)
        else:
            candidates = list(
                _institution_sections(Section, institution_id).filter(taken_courses=load.course_id)[:2]
            )
            if len(candidates) != 1:
                continue
            section = candidates[0]
        duplicate = CourseLoad.objects.filter(
            course_id=load.course_id, faculty_id=load.faculty_id, section=section,
        ).exclude(pk=load.pk).exists()
        if duplicate:
            continue
        section.taken_courses.add(load.course_id)
        load.section = section
        load.save(update_fields=['section'])


def restore_section_names(apps, schema_editor):
    schema_editor.execute('SET CONSTRAINTS ALL IMMEDIATE')
    CourseLoad = apps.get_model('integrations', 'CourseLoad')
    for load in CourseLoad.objects.select_related('section').exclude(section__isnull=True):
        load.section_legacy = load.section.code
        load.save(update_fields=['section_legacy'])


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0026_section_institution_courses_blocks'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[migrations.AlterUniqueTogether(name='courseload', unique_together=set())],
            database_operations=[migrations.RunSQL(_DROP_SECTION_UNIQUES, migrations.RunSQL.noop)],
        ),
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
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterUniqueTogether(
                    name='courseload',
                    unique_together={('course', 'faculty', 'section')},
                ),
            ],
            database_operations=[migrations.RunSQL(_ADD_SECTION_UNIQUE, _DROP_SECTION_UNIQUE)],
        ),
    ]
