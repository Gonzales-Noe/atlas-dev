from django.db import migrations


# The `section` column on `course_load` drifted in the live database: some
# environments still carry the legacy UUID `section_id` column that replaced the
# original varchar column. This migration reconciles the table so it matches the
# `CourseLoad.section` model field (varchar), and is written so that it is a safe
# no-op on a database that is already correct.
_FORWARD_SQL = """
DO $reconcile$
DECLARE
    target regclass := to_regclass('course_load');
BEGIN
    IF target IS NULL THEN
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_attribute
        WHERE attrelid = target AND attname = 'section_id' AND NOT attisdropped
    ) THEN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_attribute
            WHERE attrelid = target AND attname = 'section' AND NOT attisdropped
        ) THEN
            EXECUTE format(
                $ddl$ALTER TABLE %s ADD COLUMN section VARCHAR(100) NOT NULL DEFAULT ''$ddl$,
                target
            );
        END IF;

        EXECUTE format($ddl$ALTER TABLE %s DROP COLUMN section_id$ddl$, target);
    END IF;
END
$reconcile$;
"""

_REVERSE_SQL = """
DO $restore$
DECLARE
    target regclass := to_regclass('course_load');
BEGIN
    IF target IS NULL THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_attribute
        WHERE attrelid = target AND attname = 'section_id' AND NOT attisdropped
    ) THEN
        EXECUTE format($ddl$ALTER TABLE %s ADD COLUMN section_id UUID$ddl$, target);
    END IF;
END
$restore$;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0023_alter_courseload_unique_together'),
    ]

    operations = [
        migrations.RunSQL(
            sql=_FORWARD_SQL,
            reverse_sql=_REVERSE_SQL,
        ),
    ]
