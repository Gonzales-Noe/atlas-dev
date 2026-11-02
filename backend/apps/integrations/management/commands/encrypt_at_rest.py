"""
Encrypt (or re-encrypt) everything ATLAS keeps encrypted at rest.

    python manage.py encrypt_at_rest --generate-key   # print a new AES-256 key, change nothing
    python manage.py encrypt_at_rest --dry-run        # count what would be written
    python manage.py encrypt_at_rest                  # encrypt plaintext rows and files

Run it once after turning encryption on, and again after rotating keys (new key first
in ATLAS_ENCRYPTION_KEYS, old key still listed). It is safe to run repeatedly: every
value is rewritten under the current first key.
"""
import os
import tempfile

from django.apps import apps
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import FileField

from apps.integrations import encryption
from apps.integrations.fields import _EncryptedFieldMixin
from apps.integrations.storage import EncryptedFileSystemStorage


class Command(BaseCommand):
    help = 'Encrypt existing plaintext data and files with AES-256-GCM (or re-encrypt under a new key).'
    # --generate-key must work before any key exists, so skip the atlas.E001 key check;
    # handle() reports a missing key itself for the other modes.
    requires_system_checks = []

    def add_arguments(self, parser):
        parser.add_argument('--generate-key', action='store_true',
                            help='Print a new random 256-bit key and exit.')
        parser.add_argument('--dry-run', action='store_true',
                            help='Report what would be rewritten without changing anything.')
        parser.add_argument('--batch-size', type=int, default=200)

    def handle(self, *args, **opts):
        if opts['generate_key']:
            self.stdout.write(encryption.generate_key())
            return
        if not encryption.encryption_is_configured():
            raise CommandError('ATLAS_ENCRYPTION_KEYS is not set. Run with --generate-key first.')

        dry = opts['dry_run']
        self.stdout.write(f'Active key id: {encryption.active_key_id()}' + ('  (dry run)' if dry else ''))
        total = 0
        for model in apps.get_models():
            fields = [f for f in model._meta.concrete_fields if isinstance(f, _EncryptedFieldMixin)]
            if fields:
                total += self._encrypt_rows(model, fields, opts['batch_size'], dry)
        total += self._encrypt_files(dry)
        self.stdout.write(self.style.SUCCESS(
            f'{"Would rewrite" if dry else "Rewrote"} {total} value(s)/file(s).'
        ))

    def _encrypt_rows(self, model, fields, batch_size, dry):
        label = model._meta.label
        names = [f.name for f in fields]
        count = 0
        batch = []

        def flush():
            nonlocal count
            if not batch:
                return
            if not dry:
                with transaction.atomic():
                    model._default_manager.bulk_update(batch, names, batch_size=batch_size)
            count += len(batch)
            batch.clear()

        rows = model._default_manager.only(model._meta.pk.name, *names).order_by('pk')
        for obj in rows.iterator(chunk_size=batch_size):
            # None is SQL NULL: nothing to encrypt. Everything else is rewritten, which
            # encrypts plaintext rows and moves older ciphertext onto the active key.
            if any(getattr(obj, name) is not None for name in names):
                if any(getattr(obj, name) is None for name in names):
                    # bulk_update would write a JSON null for a NULL column; update singly.
                    self._update_single(model, obj, names, dry)
                    count += 1
                    continue
                batch.append(obj)
                if len(batch) >= batch_size:
                    flush()
        flush()
        self.stdout.write(f'  {label}: {count} row(s) ({", ".join(names)})')
        return count

    def _update_single(self, model, obj, names, dry):
        values = {n: getattr(obj, n) for n in names if getattr(obj, n) is not None}
        if not dry:
            model._default_manager.filter(pk=obj.pk).update(**values)

    def _encrypt_files(self, dry):
        from django.core.files.storage import default_storage

        storage = default_storage
        if not isinstance(storage, EncryptedFileSystemStorage):
            self.stdout.write('  files: default storage is not encrypted; skipped.')
            return 0
        count = 0
        active = encryption.active_key_id()
        for model in apps.get_models():
            for field in model._meta.concrete_fields:
                if not isinstance(field, FileField):
                    continue
                names = (model._default_manager.exclude(**{field.name: ''})
                         .exclude(**{f'{field.name}__isnull': True})
                         .values_list(field.name, flat=True))
                for name in set(names):
                    try:
                        path = storage.path(name)
                    except Exception:
                        continue
                    if not os.path.isfile(path):
                        continue
                    with open(path, 'rb') as handle:
                        raw = handle.read()
                    if encryption.is_encrypted_bytes(raw):
                        if encryption.bytes_key_id(raw) == active:
                            continue
                        plain = encryption.decrypt_bytes(raw)
                    else:
                        plain = raw
                    count += 1
                    if not dry:
                        self._write_atomic(path, encryption.encrypt_bytes(plain))
        self.stdout.write(f'  files: {count} file(s) under {settings.MEDIA_ROOT}')
        return count

    @staticmethod
    def _write_atomic(path, data):
        directory = os.path.dirname(path)
        fd, tmp = tempfile.mkstemp(dir=directory, prefix='.enc-')
        try:
            with os.fdopen(fd, 'wb') as handle:
                handle.write(data)
            os.replace(tmp, path)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise
