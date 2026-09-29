from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("integrations", "0022_courseload_unique_together"),
    ]

    operations = [
        # The unique constraint on (course_id, faculty_id, section) was already
        # created by migration 0022 using raw SQL. This migration is a no-op to
        # avoid trying to drop a non-existent old constraint.
        migrations.RunSQL(
            sql="",
            reverse_sql="",
        ),
    ]