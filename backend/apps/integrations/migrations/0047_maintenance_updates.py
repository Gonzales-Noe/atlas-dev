from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0046_platform_maintenance_until'),
    ]

    operations = [
        migrations.AddField(
            model_name='platformsettings',
            name='maintenance_schedule_started',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='platformsettings',
            name='maintenance_opened_by_schedule',
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name='MaintenanceUpdate',
            fields=[
                ('update_id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('summary', models.CharField(max_length=300)),
                ('started_at', models.DateTimeField(blank=True, null=True)),
                ('ended_at', models.DateTimeField(blank=True, null=True)),
                ('recorded_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'maintenance_updates',
                'ordering': ['-recorded_at'],
            },
        ),
    ]
