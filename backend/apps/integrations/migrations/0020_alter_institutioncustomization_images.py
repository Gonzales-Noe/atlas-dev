from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('integrations', '0019_institutioncustomization_images'),
    ]

    operations = [
        migrations.AlterField(
            model_name='institutioncustomization',
            name='header_image_url',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AlterField(
            model_name='institutioncustomization',
            name='footer_image_url',
            field=models.TextField(blank=True, default=''),
        ),
    ]