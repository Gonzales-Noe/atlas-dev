import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0048_maintenance_schedules'),
    ]

    operations = [
        migrations.CreateModel(
            name='Notification',
            fields=[
                ('notification_id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('kind', models.CharField(max_length=40)),
                ('title', models.CharField(max_length=180)),
                ('body', models.TextField(blank=True, default='')),
                ('href', models.CharField(blank=True, default='', max_length=300)),
                ('dedupe_key', models.CharField(blank=True, default='', max_length=180)),
                ('read_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('recipient', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='notifications', to='integrations.userprofile')),
            ],
            options={
                'db_table': 'notifications',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='PushSubscription',
            fields=[
                ('subscription_id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('endpoint', models.TextField(unique=True)),
                ('p256dh', models.CharField(max_length=255)),
                ('auth', models.CharField(max_length=255)),
                ('user_agent', models.CharField(blank=True, default='', max_length=300)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='push_subscriptions', to='integrations.userprofile')),
            ],
            options={
                'db_table': 'push_subscriptions',
            },
        ),
        migrations.CreateModel(
            name='WebPushConfig',
            fields=[
                ('config_id', models.PositiveSmallIntegerField(default=1, primary_key=True, serialize=False)),
                ('public_key', models.CharField(max_length=200)),
                ('private_key', models.TextField()),
                ('subject', models.CharField(default='mailto:no-reply@atlas.local', max_length=200)),
            ],
            options={
                'db_table': 'web_push_config',
            },
        ),
        migrations.AddIndex(
            model_name='notification',
            index=models.Index(fields=['recipient', '-created_at'], name='notif_recipient_created_idx'),
        ),
        migrations.AddIndex(
            model_name='notification',
            index=models.Index(fields=['recipient', 'read_at'], name='notif_recipient_read_idx'),
        ),
        migrations.AddConstraint(
            model_name='notification',
            constraint=models.UniqueConstraint(
                condition=models.Q(('dedupe_key', ''), _negated=True),
                fields=('recipient', 'dedupe_key'),
                name='uniq_notification_dedupe',
            ),
        ),
    ]
