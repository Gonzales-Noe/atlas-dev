from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0033_course_request'),
    ]

    operations = [
        migrations.AddField(
            model_name='course',
            name='module_topic_confirmed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='course',
            name='module_topic_section_key',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.AddField(
            model_name='course',
            name='module_topic_subsection_key',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
    ]
