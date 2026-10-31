from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0042_performance_indexes'),
    ]

    operations = [
        migrations.CreateModel(
            name='PlatformSettings',
            fields=[
                ('settings_id', models.PositiveSmallIntegerField(default=1, primary_key=True, serialize=False)),
                ('brand_primary', models.CharField(default='#AA2423', max_length=7)),
                ('maintenance_enabled', models.BooleanField(default=False)),
                ('maintenance_message', models.CharField(
                    blank=True,
                    default='ATLAS is briefly unavailable while the IT team performs maintenance.',
                    max_length=500,
                )),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'platform_settings',
            },
        ),
        migrations.CreateModel(
            name='SystemMetricSample',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('sampled_at', models.DateTimeField(auto_now_add=True)),
                ('cpu_percent', models.FloatField(default=0)),
                ('memory_percent', models.FloatField(default=0)),
                ('disk_percent', models.FloatField(default=0)),
                ('load_1', models.FloatField(blank=True, null=True)),
            ],
            options={
                'db_table': 'system_metric_sample',
                'indexes': [
                    models.Index(fields=['-sampled_at'], name='sysmetric_sampled_desc_idx'),
                ],
            },
        ),
    ]
