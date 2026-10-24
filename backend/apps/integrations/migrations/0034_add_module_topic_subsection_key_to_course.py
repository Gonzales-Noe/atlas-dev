from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0033_course_request'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='course',
                    name='module_topic_section_key',
                    field=models.CharField(blank=True, default='', max_length=255, null=True),
                ),
                migrations.AddField(
                    model_name='course',
                    name='module_topic_subsection_key',
                    field=models.CharField(blank=True, default='', max_length=255, null=True),
                ),
            ],
            database_operations=[
                # Both columns already exist in the shared database (added by an external
                # process) with NOT NULL constraints. Make them nullable and provide a
                # default so Django can insert rows without specifying them.
                migrations.RunSQL(
                    "ALTER TABLE course ALTER COLUMN module_topic_section_key DROP NOT NULL;",
                    "ALTER TABLE course ALTER COLUMN module_topic_section_key SET NOT NULL;",
                ),
                migrations.RunSQL(
                    "ALTER TABLE course ALTER COLUMN module_topic_section_key SET DEFAULT '';",
                    "ALTER TABLE course ALTER COLUMN module_topic_section_key DROP DEFAULT;",
                ),
                migrations.RunSQL(
                    "ALTER TABLE course ALTER COLUMN module_topic_subsection_key DROP NOT NULL;",
                    "ALTER TABLE course ALTER COLUMN module_topic_subsection_key SET NOT NULL;",
                ),
                migrations.RunSQL(
                    "ALTER TABLE course ALTER COLUMN module_topic_subsection_key SET DEFAULT '';",
                    "ALTER TABLE course ALTER COLUMN module_topic_subsection_key DROP DEFAULT;",
                ),
            ],
        ),
    ]
