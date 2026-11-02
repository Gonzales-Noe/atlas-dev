import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0050_single_tenant_batstateu_lipa'),
    ]

    operations = [
        migrations.CreateModel(
            name='SupportReport',
            fields=[
                ('report_id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('message', models.TextField()),
                ('phone_note', models.CharField(blank=True, default='', max_length=300)),
                ('status', models.CharField(default='with_admin', max_length=32)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('forwarded_at', models.DateTimeField(blank=True, null=True)),
                ('forwarded_by', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, related_name='forwarded_support_reports', to='integrations.userprofile')),
                ('institution', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, related_name='support_reports', to='integrations.institution')),
                ('reporter', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='support_reports', to='integrations.userprofile')),
            ],
            options={
                'db_table': 'support_reports',
                'ordering': ['-created_at'],
                'indexes': [
                    models.Index(fields=['institution', '-created_at'], name='support_inst_created_idx'),
                    models.Index(fields=['status', '-created_at'], name='support_status_created_idx'),
                ],
            },
        ),
    ]
