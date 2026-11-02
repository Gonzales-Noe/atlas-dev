from django.core.checks import Error, register

from .encryption import EncryptionNotConfigured, _keyring


@register()
def encryption_key_check(app_configs, **kwargs):
    """Refuse to run (migrate, runserver, check) without a usable AES-256 key."""
    try:
        _keyring()
    except EncryptionNotConfigured as exc:
        return [Error(
            str(exc),
            hint='Set ATLAS_ENCRYPTION_KEYS in the environment (backend/.env).',
            id='atlas.E001',
        )]
    return []
