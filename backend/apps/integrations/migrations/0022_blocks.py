import re
import uuid

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


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0021_institution_billing_application'),
        ('grading', '0006_change_student_identifier_to_charfield'),
    ]

    operations = [
        migrations.CreateModel(
            name='Block',
            fields=[
                ('block_id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('grade_level', models.CharField(blank=True, default='', max_length=100)),
                ('section', models.CharField(blank=True, db_index=True, default='', max_length=100)),
                ('student_id', models.CharField(max_length=64, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'blocks',
                'indexes': [models.Index(fields=['grade_level', 'section'], name='idx_blocks_grade_section')],
            },
        ),
        migrations.RunPython(seed_blocks_from_scans, migrations.RunPython.noop),
    ]
