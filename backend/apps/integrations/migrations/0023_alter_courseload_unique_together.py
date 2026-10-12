from django.db import migrations

_TABLE = 'course_load'
_OLD_COLUMNS = ('course_id', 'faculty_id')
_NEW_COLUMNS = ('course_id', 'faculty_id', 'section')
# The names Django itself generates for these unique_together sets, so the
# database stays consistent with what a later makemigrations/migrate expects.
_OLD_NAME = 'course_load_course_id_faculty_id_6f102c98_uniq'
_NEW_NAME = 'course_load_course_id_faculty_id_section_7199290a_uniq'


def _array_literal(columns):
    return 'ARRAY[{}]::name[]'.format(', '.join("'{}'".format(c) for c in columns))


# Matches any UNIQUE constraint on the table whose column set is exactly
# `columns`, whatever name it happens to carry. Merging two branches left the
# database holding several different names for the same rule, so matching by a
# hard-coded name is not reliable.
_UNIQUE_CONSTRAINTS_ON = """
        SELECT c.conname
        FROM pg_constraint c
        WHERE c.conrelid = target
          AND c.contype = 'u'
          AND (
              SELECT array_agg(a.attname ORDER BY a.attname)
              FROM unnest(c.conkey) AS k(attnum)
              JOIN pg_attribute a
                ON a.attrelid = target
               AND a.attnum = k.attnum
               AND a.attisdropped = false
          ) = {array}
"""


def _drop_unique(columns):
    """Drop every UNIQUE constraint on `columns` (no-op if there is none)."""
    return """
DO $drop_unique$
DECLARE
    target regclass := to_regclass('{table}');
    con text;
BEGIN
    IF target IS NULL THEN
        RETURN;
    END IF;
    FOR con IN
        {select}
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', target, con);
    END LOOP;
END
$drop_unique$;
""".format(
        table=_TABLE,
        select=_UNIQUE_CONSTRAINTS_ON.format(array=_array_literal(columns)),
    )


def _add_unique(columns, name, skip_on_conflicts=False):
    """Add the named UNIQUE constraint unless that exact column set is covered."""
    conflict_guard = (
        """
    EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM %s GROUP BY {group} HAVING count(*) > 1)',
        target
    ) INTO has_conflicts;
    IF has_conflicts THEN
        -- Rolling back to a rule the data no longer satisfies: leave it out
        -- rather than aborting the rollback.
        RETURN;
    END IF;
""".format(group=', '.join(columns))
        if skip_on_conflicts
        else ''
    )
    return """
DO $add_unique$
DECLARE
    target regclass := to_regclass('{table}');
    has_conflicts boolean;
BEGIN
    IF target IS NULL THEN
        RETURN;
    END IF;
{conflict_guard}
    IF NOT EXISTS (
        {select}
    ) THEN
        EXECUTE format(
            'ALTER TABLE %s ADD CONSTRAINT %I UNIQUE ({columns})',
            target,
            '{name}'
        );
    END IF;
END
$add_unique$;
""".format(
        table=_TABLE,
        conflict_guard=conflict_guard,
        select=_UNIQUE_CONSTRAINTS_ON.format(array=_array_literal(columns)),
        columns=', '.join(columns),
        name=name,
    )


class Migration(migrations.Migration):
    """Replace the (course, faculty) unique key on course_load with (course, faculty, section).

    The database work is written by hand rather than left to
    AlterUniqueTogether because Django's implementation raises ValueError unless
    it finds exactly one pre-existing constraint for the old column set, which
    cannot be guaranteed while two divergent migration histories are being
    reconciled. The migration *state* is still advanced through
    AlterUniqueTogether so no follow-up migration is generated.
    """

    dependencies = [
        ('integrations', '0022_alter_course_options_course_category_and_more'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql=(
                        _drop_unique(_OLD_COLUMNS)
                        + _add_unique(_NEW_COLUMNS, _NEW_NAME)
                    ),
                    reverse_sql=(
                        _drop_unique(_NEW_COLUMNS)
                        + _add_unique(
                            _OLD_COLUMNS, _OLD_NAME, skip_on_conflicts=True
                        )
                    ),
                ),
            ],
            state_operations=[
                migrations.AlterUniqueTogether(
                    name='courseload',
                    unique_together={('course', 'faculty', 'section')},
                ),
            ],
        ),
    ]
