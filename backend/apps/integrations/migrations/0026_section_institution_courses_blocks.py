import re
import uuid

import django.db.models.deletion
from django.db import migrations, models

SR_CODE_RE = re.compile(r'^\d{2}-\d{4,6}$')


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


def backfill_section_institution(apps, schema_editor):
    Section = apps.get_model('integrations', 'Section')
    for section in Section.objects.select_related('program').filter(institution__isnull=True, program__isnull=False):
        section.institution_id = section.program.institution_id
        section.save(update_fields=['institution'])


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
        migrations.AddField(
            model_name='section',
            name='taken_courses',
            field=models.ManyToManyField(
                blank=True, db_table='section_courses',
                related_name='taking_sections', to='integrations.course',
            ),
        ),
        migrations.RunPython(backfill_section_institution, migrations.RunPython.noop),
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
        migrations.RunPython(seed_blocks_from_scans, migrations.RunPython.noop),
    ]
