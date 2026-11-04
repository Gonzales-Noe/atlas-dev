from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0057_supportreport_resolution_and_edit'),
    ]

    operations = [
        migrations.AddField(
            model_name='supportreport',
            name='source',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
    ]
