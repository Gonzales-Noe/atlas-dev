from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0053_encrypted_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='supportreport',
            name='image',
            field=models.ImageField(blank=True, default='', upload_to='support_reports/'),
        ),
    ]
