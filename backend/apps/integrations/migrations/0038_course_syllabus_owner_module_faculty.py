from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0036_section_year_number'),
    ]

    operations = [
        migrations.AddField(
            model_name='course',
            name='syllabus_owner',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='syllabus_owned_courses',
                to='integrations.userprofile',
            ),
        ),
        migrations.AddField(
            model_name='module',
            name='faculty',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='generated_modules',
                to='integrations.userprofile',
            ),
        ),
    ]
