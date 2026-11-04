from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0056_supportreport_image_blob'),
    ]

    operations = [
        migrations.AddField(
            model_name='supportreport',
            name='resolution_category',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
        migrations.AddField(
            model_name='supportreport',
            name='resolution_summary',
            field=models.CharField(blank=True, default='', max_length=300),
        ),
        migrations.AddField(
            model_name='supportreport',
            name='resolution_details',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='supportreport',
            name='resolution_follow_up',
            field=models.CharField(blank=True, default='', max_length=300),
        ),
        migrations.AddField(
            model_name='supportreport',
            name='updated_at',
            field=models.DateTimeField(auto_now=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
    ]

