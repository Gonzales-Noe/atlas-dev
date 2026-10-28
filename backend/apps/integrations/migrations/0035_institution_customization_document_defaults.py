from django.db import migrations


# These columns exist on the shared database but not in this branch's model.
# Without defaults, any INSERT from this code base fails the NOT NULL check.
SET_DEFAULTS = """
DO $defaults$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = current_schema()
                 AND table_name = 'institution_customization'
                 AND column_name = 'syllabus_style_profile') THEN
        ALTER TABLE institution_customization ALTER COLUMN syllabus_style_profile SET DEFAULT '{}'::jsonb;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = current_schema()
                 AND table_name = 'institution_customization'
                 AND column_name = 'syllabus_field_map') THEN
        ALTER TABLE institution_customization ALTER COLUMN syllabus_field_map SET DEFAULT '{}'::jsonb;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = current_schema()
                 AND table_name = 'institution_customization'
                 AND column_name = 'syllabus_preview_blocks') THEN
        ALTER TABLE institution_customization ALTER COLUMN syllabus_preview_blocks SET DEFAULT '[]'::jsonb;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = current_schema()
                 AND table_name = 'institution_customization'
                 AND column_name = 'syllabus_template_kind') THEN
        ALTER TABLE institution_customization ALTER COLUMN syllabus_template_kind SET DEFAULT '';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = current_schema()
                 AND table_name = 'institution_customization'
                 AND column_name = 'syllabus_working_docx') THEN
        ALTER TABLE institution_customization ALTER COLUMN syllabus_working_docx SET DEFAULT '';
    END IF;
END
$defaults$;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0034_course_module_topic_confirmed_at_and_more'),
    ]

    operations = [
        migrations.RunSQL(sql=SET_DEFAULTS, reverse_sql=migrations.RunSQL.noop),
    ]
