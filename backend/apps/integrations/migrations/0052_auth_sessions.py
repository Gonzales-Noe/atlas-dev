from django.db import migrations, models
from django.utils import timezone


def copy_current_sessions(apps, schema_editor):
    """Keep whoever is signed in right now. Their token still carries this session id."""
    UserProfile = apps.get_model('integrations', 'UserProfile')
    AuthSession = apps.get_model('integrations', 'AuthSession')
    now = timezone.now()
    rows = []
    for profile in UserProfile.objects.exclude(auth_session_id='').iterator():
        rows.append(AuthSession(
            session_id=profile.auth_session_id,
            user_id=profile.user_id,
            seen_at=profile.auth_session_seen_at or now,
            created_at=profile.auth_session_seen_at or now,
            kind='web',
        ))
    if rows:
        AuthSession.objects.bulk_create(rows, ignore_conflicts=True)


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0050_single_tenant_batstateu_lipa'),
    ]

    operations = [
        migrations.CreateModel(
            name='AuthSession',
            fields=[
                ('session_id', models.CharField(max_length=64, primary_key=True, serialize=False)),
                ('seen_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('kind', models.CharField(default='web', max_length=16)),
                ('user', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='auth_sessions', to='integrations.userprofile')),
            ],
            options={
                'db_table': 'auth_sessions',
                'indexes': [models.Index(fields=['user', '-seen_at'], name='auth_session_user_seen_idx')],
            },
        ),
        migrations.RunPython(copy_current_sessions, migrations.RunPython.noop),
    ]
