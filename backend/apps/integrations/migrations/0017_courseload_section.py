from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('integrations', '0016_alter_studentdata_sr_code'),
    ]

    operations = [
        migrations.AddField(
            model_name='courseload',
            name='section',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
    ]