from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0055_supportreport_resolved'),
    ]

    operations = [
        migrations.AddField(
            model_name='supportreport',
            name='image_blob',
            field=models.BinaryField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='supportreport',
            name='image_mime',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
    ]
