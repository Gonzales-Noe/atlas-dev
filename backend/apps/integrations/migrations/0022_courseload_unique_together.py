from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("integrations", "0021_institution_billing_application"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            -- Drop old unique constraint (course_id, faculty_id)
            ALTER TABLE course_load DROP CONSTRAINT IF EXISTS course_load_course_id_faculty_id_6f102c98_uniq;
            
            -- Add new unique constraint on (course_id, faculty_id, section)
            ALTER TABLE course_load ADD CONSTRAINT course_load_course_faculty_section_key 
            UNIQUE (course_id, faculty_id, section);
            """,
            reverse_sql="""
            -- Drop the new constraint
            ALTER TABLE course_load DROP CONSTRAINT IF EXISTS course_load_course_faculty_section_key;
            
            -- Recreate old constraint
            ALTER TABLE course_load ADD CONSTRAINT course_load_course_id_faculty_id_6f102c98_uniq 
            UNIQUE (course_id, faculty_id);
            """,
        ),
    ]