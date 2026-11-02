"""
Switch sensitive columns to AES-256-GCM encrypted fields.

State only: the encrypted fields keep the same database column types (text / jsonb),
so no table is altered or rewritten. Existing rows stay readable as plaintext until
``python manage.py encrypt_at_rest`` encrypts them.
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
        # 0051 and 0052 both branched from 0050; depending on both also merges them.
        ('integrations', '0051_support_reports'),
        ('integrations', '0052_auth_sessions'),
    ]

    operations = [
        _alter(
            'assessmentscoreresult', 'performance',
            apps.integrations.fields.EncryptedJSONField(blank=True, null=True),
        ),
        _alter(
            'analyticssnapshot', 'snapshot_data',
            apps.integrations.fields.EncryptedJSONField(),
        ),
        _alter(
            'webpushconfig', 'private_key',
            apps.integrations.fields.EncryptedTextField(),
        ),
        _alter(
            'parentchunk', 'parent_content',
            apps.integrations.fields.EncryptedTextField(),
        ),
        _alter(
            'childchunk', 'overlap_text',
            apps.integrations.fields.EncryptedTextField(blank=True, null=True),
        ),
        _alter(
            'globaldocumentchunk', 'text_content',
            apps.integrations.fields.EncryptedTextField(),
        ),
        _alter(
            'supportreport', 'message',
            apps.integrations.fields.EncryptedTextField(),
        ),
    ]
