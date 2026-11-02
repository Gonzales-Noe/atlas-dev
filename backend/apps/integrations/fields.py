"""
Model fields that store their value AES-256-GCM encrypted in the database.

Reading and writing look the same as the plain Django fields: the model attribute
holds the normal Python value, and only the database column holds ciphertext.

* ``EncryptedTextField`` keeps the ``text`` column type.
* ``EncryptedJSONField`` keeps the ``jsonb`` column type. The ciphertext is stored as
  a JSON string, so no column change is needed.

Rows written before a field became encrypted still read normally (a value that is not
ciphertext is returned as-is). ``python manage.py encrypt_at_rest`` encrypts them.

Because the database only sees ciphertext, these columns cannot be searched, filtered,
ordered, or indexed in SQL. Keep that in mind before encrypting a new field.
"""
import json

from django.db import models

from .encryption import decrypt_text, encrypt_text, is_encrypted_text


class _EncryptedFieldMixin:
    """Marker + shared helpers. ``encrypt_at_rest`` finds fields by this class."""

    def _encryption_context(self) -> str:
        # Bound into the GCM tag so ciphertext cannot be moved to another column.
        return f'{self.model._meta.db_table}.{self.column}'


class EncryptedTextField(_EncryptedFieldMixin, models.TextField):
    description = 'Text stored encrypted with AES-256-GCM'

    def get_db_prep_value(self, value, connection, prepared=False):
        value = super().get_db_prep_value(value, connection, prepared)
        # prepared=True is a query lookup value; only saves are encrypted.
        if prepared or value is None or hasattr(value, 'resolve_expression'):
            return value
        return encrypt_text(value, self._encryption_context())

    def from_db_value(self, value, expression, connection):
        if is_encrypted_text(value):
            return decrypt_text(value, self._encryption_context())
        return value


class EncryptedJSONField(_EncryptedFieldMixin, models.JSONField):
    description = 'JSON stored encrypted with AES-256-GCM'

    def get_db_prep_value(self, value, connection, prepared=False):
        if prepared or value is None or hasattr(value, 'resolve_expression'):
            return super().get_db_prep_value(value, connection, prepared)
        value = self.get_prep_value(value)
        payload = json.dumps(value, cls=self.encoder)
        token = encrypt_text(payload, self._encryption_context())
        return connection.ops.adapt_json_value(token, None)

    def from_db_value(self, value, expression, connection):
        value = super().from_db_value(value, expression, connection)
        if is_encrypted_text(value):
            return json.loads(
                decrypt_text(value, self._encryption_context()), cls=self.decoder,
            )
        return value
