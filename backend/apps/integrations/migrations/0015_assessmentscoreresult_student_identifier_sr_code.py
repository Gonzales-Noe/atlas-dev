from django.db import migrations, models


class Migration(migrations.Migration):
    """
    student_identifier is an SR code, not a users.user_id FK.

    Apply the ALTER in Supabase (see SQL in the commit/PR notes).
    This migration only updates Django state so manage.py migrate
    does not try to recreate the FK or uuid column.
    """

    dependencies = [
        ("integrations", "0014_userprofile_picture_url"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name="assessmentscoreresult",
                    name="student_identifier",
                    field=models.CharField(db_index=True, max_length=64),
                ),
            ],
            database_operations=[],
        ),
    ]
