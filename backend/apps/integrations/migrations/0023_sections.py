import uuid

import django.db.models.deletion
from django.db import migrations, models


def move_section_names_to_sections(apps, schema_editor):
    Block = apps.get_model('integrations', 'Block')
    Section = apps.get_model('integrations', 'Section')
    for block in Block.objects.exclude(section_legacy=''):
        name = block.section_legacy.strip()
        if not name:
            continue
        section, _ = Section.objects.get_or_create(institution=None, section_name=name)
        block.section = section
        block.save(update_fields=['section'])


def restore_section_names(apps, schema_editor):
    Block = apps.get_model('integrations', 'Block')
    for block in Block.objects.select_related('section').exclude(section__isnull=True):
        block.section_legacy = block.section.section_name
        block.save(update_fields=['section_legacy'])


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0022_blocks'),
    ]

    operations = [
        migrations.CreateModel(
            name='Section',
            fields=[
                ('section_id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('section_name', models.CharField(max_length=100)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('institution', models.ForeignKey(
                    blank=True, db_column='institution_id', null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='sections', to='integrations.institution',
                )),
                ('courses', models.ManyToManyField(
                    blank=True, db_table='section_courses',
                    related_name='sections', to='integrations.course',
                )),
            ],
            options={
                'db_table': 'sections',
                'constraints': [
                    models.UniqueConstraint(fields=('institution', 'section_name'), name='uq_section_institution_name'),
                ],
            },
        ),
        migrations.RemoveIndex(model_name='block', name='idx_blocks_grade_section'),
        migrations.RenameField(model_name='block', old_name='section', new_name='section_legacy'),
        migrations.AddField(
            model_name='block',
            name='section',
            field=models.ForeignKey(
                blank=True, db_column='section_id', null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='blocks', to='integrations.section',
            ),
        ),
        migrations.RunPython(move_section_names_to_sections, restore_section_names),
        migrations.RemoveField(model_name='block', name='section_legacy'),
    ]
