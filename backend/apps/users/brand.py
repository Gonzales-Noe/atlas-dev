"""Deployment brand color. One primary hex drives the palette the web uses."""

import re

from django.core.cache import cache

HEX_RE = re.compile(r'^#[0-9A-Fa-f]{6}$')
DEFAULT_BRAND = '#AA2423'
MAINTENANCE_CACHE_KEY = 'platform:maintenance'
DEFAULT_MAINTENANCE_MESSAGE = (
    'ATLAS is briefly unavailable while the IT team performs maintenance.'
)


def normalize_hex(value):
    text = str(value or '').strip()
    if not text.startswith('#'):
        text = f'#{text}'
    if not HEX_RE.match(text):
        raise ValueError('Enter a color like #1B4F8A.')
    text = text.upper()
    if _too_light(text):
        raise ValueError('Choose a darker color so white text on buttons stays readable.')
    return text


def _rgb(hex_color):
    h = hex_color.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _hex(channels):
    clamped = [max(0, min(255, int(round(channel)))) for channel in channels]
    return '#{:02X}{:02X}{:02X}'.format(*clamped)


def _mix(hex_color, target, amount):
    start = _rgb(hex_color)
    end = _rgb(target)
    return _hex(tuple(start[i] + (end[i] - start[i]) * amount for i in range(3)))


def _too_light(hex_color):
    def channel(value):
        value = value / 255
        if value <= 0.04045:
            return value / 12.92
        return ((value + 0.055) / 1.055) ** 2.4

    red, green, blue = _rgb(hex_color)
    luminance = 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
    return luminance > 0.72


def palette(primary):
    primary = normalize_hex(primary)
    if primary == DEFAULT_BRAND:
        red, green, blue = _rgb(primary)
        return {
            'brand_primary': primary,
            'brand_primary_hover': '#6E1212',
            'brand_core': '#6E1212',
            'brand_deep': '#3F0A0A',
            'brand_accent': '#E24B4A',
            'brand_pale': '#F3B4B3',
            'brand_glow': f'rgba({red}, {green}, {blue}, 0.35)',
            'brand_border': f'rgba({red}, {green}, {blue}, 0.55)',
            'brand_soft': f'rgba({red}, {green}, {blue}, 0.12)',
            'nav_active_bg': (
                f'linear-gradient(135deg, rgba({red}, {green}, {blue}, 0.35), '
                f'rgba({red}, {green}, {blue}, 0.18))'
            ),
            'nav_active_bg_light': (
                f'linear-gradient(135deg, rgba({red}, {green}, {blue}, 0.14), '
                f'rgba({red}, {green}, {blue}, 0.06))'
            ),
            'nav_active_border': f'rgba({red}, {green}, {blue}, 0.40)',
            'is_default': True,
        }

    red, green, blue = _rgb(primary)
    core = _mix(primary, '#000000', 0.42)
    return {
        'brand_primary': primary,
        'brand_primary_hover': _mix(primary, '#000000', 0.28),
        'brand_core': core,
        'brand_deep': _mix(primary, '#000000', 0.62),
        'brand_accent': _mix(primary, '#FFFFFF', 0.28),
        'brand_pale': _mix(primary, '#FFFFFF', 0.72),
        'brand_glow': f'rgba({red}, {green}, {blue}, 0.35)',
        'brand_border': f'rgba({red}, {green}, {blue}, 0.55)',
        'brand_soft': f'rgba({red}, {green}, {blue}, 0.12)',
        'nav_active_bg': (
            f'linear-gradient(135deg, rgba({red}, {green}, {blue}, 0.35), '
            f'rgba({red}, {green}, {blue}, 0.18))'
        ),
        'nav_active_bg_light': (
            f'linear-gradient(135deg, rgba({red}, {green}, {blue}, 0.14), '
            f'rgba({red}, {green}, {blue}, 0.06))'
        ),
        'nav_active_border': f'rgba({red}, {green}, {blue}, 0.40)',
        'is_default': False,
    }


def theme_payload(row=None):
    primary = DEFAULT_BRAND
    maintenance_enabled = False
    maintenance_message = DEFAULT_MAINTENANCE_MESSAGE
    notice_enabled = False
    scheduled_for = None
    if row is not None:
        primary = row.brand_primary or DEFAULT_BRAND
        maintenance_enabled = bool(row.maintenance_enabled)
        maintenance_message = row.maintenance_message or DEFAULT_MAINTENANCE_MESSAGE
        notice_enabled = bool(getattr(row, 'maintenance_notice_enabled', False))
        scheduled = getattr(row, 'maintenance_scheduled_for', None)
        scheduled_for = scheduled.isoformat() if scheduled else None
    try:
        colors = palette(primary)
    except ValueError:
        colors = palette(DEFAULT_BRAND)
    return {
        'palette': colors,
        'maintenance_enabled': maintenance_enabled,
        'maintenance_message': maintenance_message,
        'maintenance_notice_enabled': notice_enabled,
        'maintenance_scheduled_for': scheduled_for,
    }


def remember_maintenance(payload):
    cache.set(
        MAINTENANCE_CACHE_KEY,
        {
            'enabled': bool(payload.get('maintenance_enabled')),
            'message': payload.get('maintenance_message') or DEFAULT_MAINTENANCE_MESSAGE,
        },
        timeout=30,
    )


def cached_maintenance():
    cached = cache.get(MAINTENANCE_CACHE_KEY)
    if isinstance(cached, dict):
        return cached
    return None
