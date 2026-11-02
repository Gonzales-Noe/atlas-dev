"""
AES-256-GCM encryption for data at rest.

Used by the encrypted model fields (``apps.integrations.fields``) and the encrypted
file storage (``apps.integrations.storage``). Nothing here talks to the database.

Keys
----
``settings.ATLAS_ENCRYPTION_KEYS`` is a list of 256-bit keys (set from the
``ATLAS_ENCRYPTION_KEYS`` environment variable, comma separated, base64 or hex).
The FIRST key encrypts new data. Every key in the list can still decrypt, so a key is
rotated by putting the new key first, keeping the old one in the list, and running
``python manage.py encrypt_at_rest``. Remove the old key once that command finishes.

Text format:   ``enc1:<key id>:<base64url(nonce + ciphertext + tag)>``
File format:   ``ATLASENC1\\0`` + 4-byte key id + 12-byte nonce + ciphertext + tag

Each value gets a fresh random 96-bit nonce. The field's table and column name is
bound into the authentication tag (AAD), so a ciphertext copied into another column
fails to decrypt instead of being read as valid data.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import os
from functools import lru_cache

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

TEXT_PREFIX = 'enc1:'
FILE_MAGIC = b'ATLASENC1\x00'
KEY_SIZE = 32      # 256 bits -> AES-256
NONCE_SIZE = 12    # 96 bits, the size GCM is designed for
KEY_ID_SIZE = 4    # bytes of SHA-256(key); only identifies the key, reveals nothing about it


class EncryptionError(Exception):
    """A value could not be encrypted or decrypted (wrong key, tampering, or bad config)."""


class EncryptionNotConfigured(ImproperlyConfigured):
    """No usable encryption key is configured."""


def generate_key() -> str:
    """A new random 256-bit key, base64url encoded, ready for ATLAS_ENCRYPTION_KEYS."""
    return base64.urlsafe_b64encode(os.urandom(KEY_SIZE)).decode('ascii')


def parse_key(raw: str) -> bytes:
    """Accept a 64-character hex key or a base64 / base64url key that decodes to 32 bytes."""
    value = (raw or '').strip()
    key = None
    if len(value) == KEY_SIZE * 2:
        try:
            key = bytes.fromhex(value)
        except ValueError:
            key = None
    if key is None:
        normalized = value.replace('-', '+').replace('_', '/')
        normalized += '=' * (-len(normalized) % 4)
        try:
            key = base64.b64decode(normalized, validate=True)
        except (binascii.Error, ValueError):
            key = b''
    if len(key) != KEY_SIZE:
        raise EncryptionNotConfigured(
            'ATLAS_ENCRYPTION_KEYS holds a key that is not 32 bytes (256 bits). '
            'Generate one with: python manage.py encrypt_at_rest --generate-key'
        )
    return key


def _key_id(key: bytes) -> bytes:
    return hashlib.sha256(key).digest()[:KEY_ID_SIZE]


class _KeyRing:
    def __init__(self, keys: list[bytes]):
        self.active_id = _key_id(keys[0])
        self.active = AESGCM(keys[0])
        self.by_id = {}
        for key in keys:
            self.by_id.setdefault(_key_id(key), AESGCM(key))


@lru_cache(maxsize=8)
def _build_keyring(raw_keys: tuple, allow_derived: bool, secret_key: str) -> _KeyRing:
    keys = [parse_key(raw) for raw in raw_keys if str(raw).strip()]
    if keys:
        return _KeyRing(keys)
    if allow_derived:
        # Local development only: a stable key derived from SECRET_KEY so the app runs
        # without extra setup. Never allowed in production (see ATLAS_ENCRYPTION_ALLOW_DERIVED_KEY).
        derived = HKDF(
            algorithm=hashes.SHA256(), length=KEY_SIZE, salt=None,
            info=b'atlas-at-rest-dev-key',
        ).derive(secret_key.encode('utf-8'))
        return _KeyRing([derived])
    raise EncryptionNotConfigured(
        'ATLAS_ENCRYPTION_KEYS is not set. Generate a key with '
        '"python manage.py encrypt_at_rest --generate-key" and add it to the environment.'
    )


def _keyring() -> _KeyRing:
    raw = getattr(settings, 'ATLAS_ENCRYPTION_KEYS', None) or []
    if isinstance(raw, str):
        raw = raw.split(',')
    allow_derived = bool(
        getattr(settings, 'ATLAS_ENCRYPTION_ALLOW_DERIVED_KEY', False) or settings.DEBUG
    )
    return _build_keyring(tuple(raw), allow_derived, settings.SECRET_KEY)


def encryption_is_configured() -> bool:
    try:
        _keyring()
    except EncryptionNotConfigured:
        return False
    return True


def active_key_id() -> str:
    return _keyring().active_id.hex()


# ── Text ──────────────────────────────────────────────────────────────────────

def is_encrypted_text(value) -> bool:
    return isinstance(value, str) and value.startswith(TEXT_PREFIX)


def _text_aad(context: str) -> bytes:
    return f'atlas:text:{context}'.encode('utf-8')


def encrypt_text(plaintext: str, context: str) -> str:
    ring = _keyring()
    nonce = os.urandom(NONCE_SIZE)
    sealed = ring.active.encrypt(nonce, plaintext.encode('utf-8'), _text_aad(context))
    payload = base64.urlsafe_b64encode(nonce + sealed).decode('ascii').rstrip('=')
    return f'{TEXT_PREFIX}{ring.active_id.hex()}:{payload}'


def text_key_id(token: str) -> str:
    """Hex id of the key an encrypted text token was written with ('' if not a token)."""
    if not is_encrypted_text(token):
        return ''
    return token[len(TEXT_PREFIX):].split(':', 1)[0]


def decrypt_text(token: str, context: str) -> str:
    try:
        key_id_hex, payload = token[len(TEXT_PREFIX):].split(':', 1)
        key_id = bytes.fromhex(key_id_hex)
        blob = base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4))
    except (ValueError, binascii.Error) as exc:
        raise EncryptionError('Encrypted value is malformed.') from exc
    aead = _keyring().by_id.get(key_id)
    if aead is None:
        raise EncryptionError(
            f'No configured key matches key id {key_id_hex}. Add the key that wrote '
            'this data to ATLAS_ENCRYPTION_KEYS.'
        )
    if len(blob) < NONCE_SIZE + 16:
        raise EncryptionError('Encrypted value is truncated.')
    try:
        return aead.decrypt(blob[:NONCE_SIZE], blob[NONCE_SIZE:], _text_aad(context)).decode('utf-8')
    except InvalidTag as exc:
        raise EncryptionError(
            f'Could not decrypt {context}: wrong key, or the stored value was altered.'
        ) from exc


# ── Files / bytes ─────────────────────────────────────────────────────────────

def is_encrypted_bytes(data: bytes) -> bool:
    return data[:len(FILE_MAGIC)] == FILE_MAGIC


def bytes_key_id(data: bytes) -> str:
    if not is_encrypted_bytes(data):
        return ''
    start = len(FILE_MAGIC)
    return data[start:start + KEY_ID_SIZE].hex()


_FILE_AAD = b'atlas:file'


def encrypt_bytes(data: bytes) -> bytes:
    ring = _keyring()
    nonce = os.urandom(NONCE_SIZE)
    sealed = ring.active.encrypt(nonce, data, _FILE_AAD)
    return FILE_MAGIC + ring.active_id + nonce + sealed


def decrypt_bytes(blob: bytes) -> bytes:
    header = len(FILE_MAGIC) + KEY_ID_SIZE + NONCE_SIZE
    if not is_encrypted_bytes(blob) or len(blob) < header + 16:
        raise EncryptionError('Encrypted file is malformed.')
    key_id = blob[len(FILE_MAGIC):len(FILE_MAGIC) + KEY_ID_SIZE]
    nonce = blob[len(FILE_MAGIC) + KEY_ID_SIZE:header]
    aead = _keyring().by_id.get(key_id)
    if aead is None:
        raise EncryptionError(
            f'No configured key matches key id {key_id.hex()}. Add the key that wrote '
            'this file to ATLAS_ENCRYPTION_KEYS.'
        )
    try:
        return aead.decrypt(nonce, blob[header:], _FILE_AAD)
    except InvalidTag as exc:
        raise EncryptionError('Could not decrypt file: wrong key, or the file was altered.') from exc
