from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0013_add_sr_code_to_student_data'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='picture_url',
            field=models.URLField(blank=True, max_length=500, null=True),
        ),
    ]
