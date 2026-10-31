from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0044_userprofile_auth_session'),
    ]

    operations = [
        migrations.AddField(
            model_name='platformsettings',
            name='maintenance_notice_enabled',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='platformsettings',
            name='maintenance_scheduled_for',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
