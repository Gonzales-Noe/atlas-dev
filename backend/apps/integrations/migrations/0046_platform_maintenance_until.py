from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0045_platform_maintenance_notice'),
    ]

    operations = [
        migrations.AddField(
            model_name='platformsettings',
            name='maintenance_scheduled_until',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
