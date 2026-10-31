from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0043_platform_settings_and_metric_samples'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='auth_session_id',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='auth_session_seen_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
