"""One-time password reset codes.

Codes are 8 characters from an alphabet without look-alike glyphs.
Guessing is also capped by the reset views and the request throttle.
"""
import hmac
import secrets

OTP_LENGTH = 8
OTP_ATTEMPT_LIMIT = 5
OTP_TTL_SECONDS = 600
OTP_LOCK_SECONDS = 900
# 32 symbols: no 0/O or 1/I.
OTP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'


def generate_otp():
    return ''.join(secrets.choice(OTP_ALPHABET) for _ in range(OTP_LENGTH))


def normalize_otp(value):
    return ''.join(str(value or '').split()).upper()


def otp_matches(stored, submitted):
    left = normalize_otp(stored).encode()
    right = normalize_otp(submitted).encode()
    if len(left) != OTP_LENGTH or len(left) != len(right):
        return False
    return hmac.compare_digest(left, right)


def same_secret(stored, submitted):
    left = str(stored or '').encode()
    right = str(submitted or '').encode()
    if not left or len(left) != len(right):
        return False
    return hmac.compare_digest(left, right)
