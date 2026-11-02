"""
File storage that keeps uploaded files AES-256-GCM encrypted on disk.

Set as the default storage in settings, so every ``FileField`` (for example the
institution syllabus template) is encrypted without changing the models. Files are
decrypted in memory when read; callers still use ``field.open()`` / ``field.read()``.

Files saved before this storage was enabled are returned unchanged until
``python manage.py encrypt_at_rest`` encrypts them.
"""
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage

from .encryption import decrypt_bytes, encrypt_bytes, is_encrypted_bytes


class EncryptedFileSystemStorage(FileSystemStorage):
    def _save(self, name, content):
        content.seek(0)
        data = content.read()
        if isinstance(data, str):
            data = data.encode('utf-8')
        sealed = ContentFile(encrypt_bytes(data))
        return super()._save(name, sealed)

    def _open(self, name, mode='rb'):
        with open(self.path(name), 'rb') as handle:
            raw = handle.read()
        data = decrypt_bytes(raw) if is_encrypted_bytes(raw) else raw
        return ContentFile(data, name=name)

    def size(self, name):
        # Report the plaintext size, not the larger encrypted size on disk.
        with open(self.path(name), 'rb') as handle:
            raw = handle.read()
        return len(decrypt_bytes(raw)) if is_encrypted_bytes(raw) else len(raw)
