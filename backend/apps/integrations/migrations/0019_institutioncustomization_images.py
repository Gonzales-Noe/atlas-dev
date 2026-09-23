from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('integrations', '0018_institutioncustomization'),
    ]

    operations = [
        migrations.AddField(
            model_name='institutioncustomization',
            name='header_image_url',
            field=models.URLField(blank=True, default='', max_length=1000),
        ),
        migrations.AddField(
            model_name='institutioncustomization',
            name='footer_image_url',
            field=models.URLField(blank=True, default='', max_length=1000),
        ),
    ]
