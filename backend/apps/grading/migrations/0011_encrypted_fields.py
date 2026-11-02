"""
Switch student response columns to AES-256-GCM encrypted JSON fields.

State only: the column type stays jsonb, so no table is altered or rewritten.
Existing rows stay readable as plaintext until ``python manage.py encrypt_at_rest``
encrypts them.
"""
from django.db import migrations

import apps.integrations.fields


def _alter(model_name, name, field):
    return migrations.SeparateDatabaseAndState(
        state_operations=[
            migrations.AlterField(model_name=model_name, name=name, field=field),
        ],
        database_operations=[],
    )


class Migration(migrations.Migration):

    dependencies = [
        ('grading', '0010_quickexam_questions'),
        ('integrations', '0053_encrypted_fields'),
    ]

    operations = [
        _alter(
            'omrjobresult', 'responses_json',
            apps.integrations.fields.EncryptedJSONField(blank=True, default=dict),
        ),
        _alter(
            'omrreviewaction', 'before_json',
            apps.integrations.fields.EncryptedJSONField(blank=True, default=dict),
        ),
        _alter(
            'omrreviewaction', 'after_json',
            apps.integrations.fields.EncryptedJSONField(blank=True, default=dict),
        ),
        _alter(
            'bubblesheetscan', 'responses',
            apps.integrations.fields.EncryptedJSONField(default=dict),
        ),
        _alter(
            'quickexamscan', 'responses',
            apps.integrations.fields.EncryptedJSONField(default=dict),
        ),
    ]
