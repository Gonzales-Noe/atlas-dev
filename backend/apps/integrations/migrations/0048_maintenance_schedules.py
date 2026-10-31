import uuid

from django.db import migrations, models


def copy_existing_window(apps, schema_editor):
    PlatformSettings = apps.get_model('integrations', 'PlatformSettings')
    MaintenanceSchedule = apps.get_model('integrations', 'MaintenanceSchedule')
    row = PlatformSettings.objects.filter(pk=1).first()
    if row is None or not row.maintenance_scheduled_for or not row.maintenance_scheduled_until:
        return
    if MaintenanceSchedule.objects.exists():
        return
    MaintenanceSchedule.objects.create(
        starts_at=row.maintenance_scheduled_for,
        ends_at=row.maintenance_scheduled_until,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0047_maintenance_updates'),
    ]

    operations = [
        migrations.CreateModel(
            name='MaintenanceSchedule',
            fields=[
                ('schedule_id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('starts_at', models.DateTimeField()),
                ('ends_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'maintenance_schedules',
                'ordering': ['starts_at'],
            },
        ),
        migrations.RunPython(copy_existing_window, migrations.RunPython.noop),
    ]
