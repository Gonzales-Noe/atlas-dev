import re
import uuid

import django.db.models.deletion
from django.db import migrations, models

SR_CODE_RE = re.compile(r'^\d{2}-\d{4,6}$')

# Records of the pre-merge atlas-web-noe migrations (replaced by this one) and of
# an unreleased jasmin-web draft. Their files no longer exist anywhere.
STALE_MIGRATIONS = (
    '0022_blocks',
    '0023_sections',
    '0024_courseload_section_fk',
    '0022_courseload_unique_together',
)


def build_section_tables(apps, schema_editor):
    """Create `blocks` and `section_courses`, or adopt them from the pre-merge schema.

    Databases that ran the old atlas-web-noe migrations already have `blocks`,
    `section_courses` and a separate `sections` table. Those sections are copied
    into `academic_section` with the same ids, the foreign keys pointing at
    `sections` are moved to `academic_section`, and `sections` is dropped.
    """
    connection = schema_editor.connection
    Section = apps.get_model('integrations', 'Section')
    Block = apps.get_model('integrations', 'Block')
    tables = set(connection.introspection.table_names())

    with connection.cursor() as cursor:
        cursor.execute('SET CONSTRAINTS ALL IMMEDIATE')

        if 'sections' in tables:
            cursor.execute("""
                SELECT c.conname, c.conrelid::regclass::text, a.attname
                FROM pg_constraint c
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
                WHERE c.contype = 'f' AND c.confrelid = 'sections'::regclass
            """)
            for conname, table, column in cursor.fetchall():
                cursor.execute(f'ALTER TABLE {table} DROP CONSTRAINT "{conname}"')
                cursor.execute(
                    f'ALTER TABLE {table} ADD CONSTRAINT "{table}_{column}_academic_section_fk" '
                    f'FOREIGN KEY ("{column}") REFERENCES academic_section (section_id) '
                    f'DEFERRABLE INITIALLY DEFERRED NOT VALID'
                )
            cursor.execute("""
                INSERT INTO academic_section (section_id, institution_id, code, name, created_at)
                SELECT s.section_id, s.institution_id, LEFT(s.section_name, 50), '', s.created_at
                FROM sections s
                WHERE NOT EXISTS (SELECT 1 FROM academic_section a WHERE a.section_id = s.section_id)
            """)
            cursor.execute("""
                SELECT c.conname, c.conrelid::regclass::text
                FROM pg_constraint c
                WHERE c.contype = 'f' AND NOT c.convalidated
                  AND c.confrelid = 'academic_section'::regclass
            """)
            for conname, table in cursor.fetchall():
                cursor.execute(f'ALTER TABLE {table} VALIDATE CONSTRAINT "{conname}"')
            cursor.execute('DROP TABLE sections')

        cursor.execute(
            'DELETE FROM django_migrations WHERE app = %s AND name = ANY(%s)',
            ['integrations', list(STALE_MIGRATIONS)],
        )

    if 'blocks' not in tables:
        schema_editor.create_model(Block)
    if 'section_courses' not in tables:
        schema_editor.create_model(Section._meta.get_field('taken_courses').remote_field.through)


def backfill_section_institution(apps, schema_editor):
    Section = apps.get_model('integrations', 'Section')
    for section in Section.objects.select_related('program').filter(institution__isnull=True, program__isnull=False):
        section.institution_id = section.program.institution_id
        section.save(update_fields=['institution'])


def seed_blocks_from_scans(apps, schema_editor):
    Block = apps.get_model('integrations', 'Block')
    BubbleSheetScan = apps.get_model('grading', 'BubbleSheetScan')

    scanned = (
        BubbleSheetScan.objects
        .exclude(student_identifier__isnull=True)
        .values_list('student_identifier', flat=True)
        .distinct()
    )
    existing = set(Block.objects.values_list('student_id', flat=True))
    new_ids = sorted({
        sid.strip() for sid in scanned
        if sid and SR_CODE_RE.match(sid.strip()) and sid.strip() not in existing
    })
    Block.objects.bulk_create([Block(student_id=sid) for sid in new_ids])


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0025_add_college_to_userprofile'),
        ('grading', '0007_alter_omrtemplateprofile_confidence_threshold'),
    ]

    operations = [
        migrations.AlterField(
            model_name='section',
            name='program',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                related_name='sections', to='integrations.program',
            ),
        ),
        migrations.AlterField(
            model_name='section',
            name='year_level',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                related_name='sections', to='integrations.yearlevel',
            ),
        ),
        migrations.AddField(
            model_name='section',
            name='institution',
            field=models.ForeignKey(
                blank=True, db_column='institution_id', null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='sections', to='integrations.institution',
            ),
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='section',
                    name='taken_courses',
                    field=models.ManyToManyField(
                        blank=True, db_table='section_courses',
                        related_name='taking_sections', to='integrations.course',
                    ),
                ),
                migrations.CreateModel(
                    name='Block',
                    fields=[
                        ('block_id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                        ('grade_level', models.CharField(blank=True, default='', max_length=100)),
                        ('student_id', models.CharField(max_length=64, unique=True)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('updated_at', models.DateTimeField(auto_now=True)),
                        ('section', models.ForeignKey(
                            blank=True, db_column='section_id', null=True,
                            on_delete=django.db.models.deletion.SET_NULL,
                            related_name='blocks', to='integrations.section',
                        )),
                    ],
                    options={
                        'db_table': 'blocks',
                    },
                ),
            ],
            database_operations=[],
        ),
        migrations.RunPython(build_section_tables, migrations.RunPython.noop),
        migrations.RunPython(backfill_section_institution, migrations.RunPython.noop),
        migrations.RunPython(seed_blocks_from_scans, migrations.RunPython.noop),
    ]
