import json
import tempfile
from types import SimpleNamespace

from django.core.files.base import ContentFile
from django.test import SimpleTestCase, override_settings

from apps.integrations import encryption
from apps.integrations.fields import EncryptedJSONField, EncryptedTextField
from apps.integrations.storage import EncryptedFileSystemStorage

KEY_A = encryption.generate_key()
KEY_B = encryption.generate_key()


def _bound(field, table='demo_table', name='demo_col'):
    field.set_attributes_from_name(name)
    field.model = SimpleNamespace(_meta=SimpleNamespace(db_table=table))
    return field


FAKE_CONNECTION = SimpleNamespace(
    ops=SimpleNamespace(adapt_json_value=lambda value, encoder: json.dumps(value)),
)


@override_settings(ATLAS_ENCRYPTION_KEYS=[KEY_A], ATLAS_ENCRYPTION_ALLOW_DERIVED_KEY=False, DEBUG=False)
class EncryptionTests(SimpleTestCase):
    def test_text_round_trip_is_aes_gcm_and_not_plaintext(self):
        token = encryption.encrypt_text('Juan dela Cruz — 23-35007', 't.c')
        self.assertTrue(token.startswith(encryption.TEXT_PREFIX))
        self.assertNotIn('Juan', token)
        self.assertEqual(encryption.decrypt_text(token, 't.c'), 'Juan dela Cruz — 23-35007')

    def test_every_encryption_uses_a_fresh_nonce(self):
        self.assertNotEqual(encryption.encrypt_text('same', 't.c'), encryption.encrypt_text('same', 't.c'))

    def test_empty_string_round_trips(self):
        self.assertEqual(encryption.decrypt_text(encryption.encrypt_text('', 't.c'), 't.c'), '')

    def test_tampered_ciphertext_is_rejected(self):
        token = encryption.encrypt_text('secret', 't.c')
        flipped = token[:-2] + ('A' if token[-2] != 'A' else 'B') + token[-1]
        with self.assertRaises(encryption.EncryptionError):
            encryption.decrypt_text(flipped, 't.c')

    def test_ciphertext_cannot_be_moved_to_another_column(self):
        token = encryption.encrypt_text('secret', 'table_a.col')
        with self.assertRaises(encryption.EncryptionError):
            encryption.decrypt_text(token, 'table_b.col')

    def test_malformed_token_is_rejected(self):
        with self.assertRaises(encryption.EncryptionError):
            encryption.decrypt_text('enc1:nothex:abc', 't.c')

    def test_key_must_be_256_bits(self):
        with self.assertRaises(encryption.EncryptionNotConfigured):
            encryption.parse_key('c2hvcnQ=')
        self.assertEqual(len(encryption.parse_key(KEY_A)), 32)
        self.assertEqual(len(encryption.parse_key('ab' * 32)), 32)

    def test_key_rotation_reads_old_data_and_writes_with_new_key(self):
        old_token = encryption.encrypt_text('rotate me', 't.c')
        old_id = encryption.text_key_id(old_token)
        with override_settings(ATLAS_ENCRYPTION_KEYS=[KEY_B, KEY_A]):
            self.assertEqual(encryption.decrypt_text(old_token, 't.c'), 'rotate me')
            new_token = encryption.encrypt_text('rotate me', 't.c')
            self.assertNotEqual(encryption.text_key_id(new_token), old_id)
        with override_settings(ATLAS_ENCRYPTION_KEYS=[KEY_B]):
            self.assertEqual(encryption.decrypt_text(new_token, 't.c'), 'rotate me')
            with self.assertRaises(encryption.EncryptionError):
                encryption.decrypt_text(old_token, 't.c')

    def test_bytes_round_trip_and_tamper(self):
        blob = encryption.encrypt_bytes(b'%PDF-1.7 syllabus')
        self.assertTrue(encryption.is_encrypted_bytes(blob))
        self.assertNotIn(b'syllabus', blob)
        self.assertEqual(encryption.decrypt_bytes(blob), b'%PDF-1.7 syllabus')
        with self.assertRaises(encryption.EncryptionError):
            encryption.decrypt_bytes(blob[:-1] + bytes([blob[-1] ^ 1]))

    def test_missing_key_fails_closed_outside_debug(self):
        with override_settings(ATLAS_ENCRYPTION_KEYS=[], DEBUG=False):
            self.assertFalse(encryption.encryption_is_configured())
            with self.assertRaises(encryption.EncryptionNotConfigured):
                encryption.encrypt_text('x', 't.c')

    def test_debug_falls_back_to_a_derived_key(self):
        with override_settings(ATLAS_ENCRYPTION_KEYS=[], DEBUG=True):
            token = encryption.encrypt_text('dev', 't.c')
            self.assertEqual(encryption.decrypt_text(token, 't.c'), 'dev')


@override_settings(ATLAS_ENCRYPTION_KEYS=[KEY_A], DEBUG=False)
class EncryptedFieldTests(SimpleTestCase):
    def test_text_field_encrypts_on_save_and_decrypts_on_read(self):
        field = _bound(EncryptedTextField())
        stored = field.get_db_prep_value('chunk about OBE', FAKE_CONNECTION)
        self.assertTrue(encryption.is_encrypted_text(stored))
        self.assertNotIn('OBE', stored)
        self.assertEqual(field.from_db_value(stored, None, FAKE_CONNECTION), 'chunk about OBE')

    def test_text_field_keeps_null_and_reads_legacy_plaintext(self):
        field = _bound(EncryptedTextField(null=True))
        self.assertIsNone(field.get_db_prep_value(None, FAKE_CONNECTION))
        self.assertIsNone(field.from_db_value(None, None, FAKE_CONNECTION))
        self.assertEqual(field.from_db_value('written before encryption', None, FAKE_CONNECTION),
                         'written before encryption')

    def test_text_field_lookup_values_are_not_encrypted(self):
        field = _bound(EncryptedTextField())
        self.assertEqual(field.get_db_prep_value('abc', FAKE_CONNECTION, prepared=True), 'abc')

    def test_json_field_stores_a_ciphertext_string(self):
        field = _bound(EncryptedJSONField(default=dict))
        stored = field.get_db_prep_value({'1': 'A', '2': 'C'}, FAKE_CONNECTION)
        token = json.loads(stored)  # what the jsonb column holds: a JSON string
        self.assertTrue(encryption.is_encrypted_text(token))
        self.assertNotIn('"A"', stored)
        self.assertEqual(field.from_db_value(stored, None, FAKE_CONNECTION), {'1': 'A', '2': 'C'})

    def test_json_field_reads_legacy_plaintext_json(self):
        field = _bound(EncryptedJSONField(default=dict))
        self.assertEqual(field.from_db_value('{"1": "A"}', None, FAKE_CONNECTION), {'1': 'A'})
        self.assertEqual(field.from_db_value('[1, 2]', None, FAKE_CONNECTION), [1, 2])
        self.assertIsNone(field.from_db_value(None, None, FAKE_CONNECTION))

    def test_json_field_round_trips_lists_and_nested_values(self):
        field = _bound(EncryptedJSONField())
        value = {'rows': [{'sr': '23-35007', 'score': 41.5}], 'ok': True}
        stored = field.get_db_prep_value(value, FAKE_CONNECTION)
        self.assertEqual(field.from_db_value(stored, None, FAKE_CONNECTION), value)


@override_settings(ATLAS_ENCRYPTION_KEYS=[KEY_A], DEBUG=False)
class EncryptedStorageTests(SimpleTestCase):
    def test_file_is_encrypted_on_disk_and_decrypted_on_read(self):
        with tempfile.TemporaryDirectory() as root:
            storage = EncryptedFileSystemStorage(location=root)
            name = storage.save('syllabus.docx', ContentFile(b'Course: Data Structures'))
            with open(storage.path(name), 'rb') as handle:
                on_disk = handle.read()
            self.assertTrue(encryption.is_encrypted_bytes(on_disk))
            self.assertNotIn(b'Data Structures', on_disk)
            with storage.open(name) as handle:
                self.assertEqual(handle.read(), b'Course: Data Structures')
            self.assertEqual(storage.size(name), len(b'Course: Data Structures'))

    def test_file_saved_before_encryption_still_reads(self):
        with tempfile.TemporaryDirectory() as root:
            storage = EncryptedFileSystemStorage(location=root)
            with open(storage.path('legacy.txt'), 'wb') as handle:
                handle.write(b'plain old file')
            with storage.open('legacy.txt') as handle:
                self.assertEqual(handle.read(), b'plain old file')
