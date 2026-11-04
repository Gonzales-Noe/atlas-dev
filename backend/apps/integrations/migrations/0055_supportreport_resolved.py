from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0054_supportreport_image'),
    ]

    operations = [
        migrations.AddField(
            model_name='supportreport',
            name='is_resolved',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='supportreport',
            name='resolved_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='supportreport',
            name='resolved_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='resolved_support_reports',
                to='integrations.userprofile',
            ),
        ),
    ]
