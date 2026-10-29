"""Shared ATLAS email service.

Renders Django templates into HTML, falls back to a plain-text body, and
sends through the configured SMTP backend. All ATLAS transactional emails
(OTP, contact notifications, etc.) go through here so the branding stays
consistent.
"""
import logging
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.template import TemplateDoesNotExist

logger = logging.getLogger(__name__)

# Absolute URL to the ATLAS logo used inside emails. In production this should
# point at a real public asset; in dev we fall back to the static file URL.
def _logo_url() -> str:
    logo = getattr(settings, 'ATLAS_EMAIL_LOGO_URL', '').strip()
    if logo:
        return logo
    # Static files in dev are served at /static/... via Django. Email clients
    # cannot resolve relative URLs, so prefix the configured BASE_URL.
    base = getattr(settings, 'BASE_URL', 'http://localhost:5173').rstrip('/')
    return f'{base}/static/email/atlas-logo.png'


def render_email(template_name: str, context: dict) -> tuple[str, str]:
    """Render an HTML email template and produce a plain-text fallback.

    Returns (html_body, text_body).
    """
    logo_url = _logo_url()
    ctx = {
        'logo_url': logo_url,
        'year': context.pop('year', 2026),
        **context,
    }

    try:
        html_body = render_to_string(template_name, ctx)
    except TemplateDoesNotExist:
        # Last-resort plain wrapper so we never send a broken email.
        html_body = (
            f'<html><body style="font-family:sans-serif;color:#F0F0F0;background:#0A0A0B;">'
            f'<div style="max-width:600px;margin:24px auto;padding:24px;background:#141416;border-radius:12px;">'
            f'<h2>ATLAS</h2>'
            f'{ctx.get("text_body", "")}'
            f'</div></body></html>'
        )

    text_body = ctx.get('text_body', '') or _strip_tags(html_body)
    return html_body, text_body


def _strip_tags(html: str) -> str:
    """Very small HTML→text converter used as a plain-text fallback."""
    import re
    # Strip Django template comments first so they don't leak into plain text.
    html = re.sub(r'\{#.*?#\}', '', html, flags=re.DOTALL)
    text = re.sub(r'<br\s*/?>', '\n', html, flags=re.IGNORECASE)
    text = re.sub(r'</p\s*>', '\n\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    # Decode a handful of entities we use in templates.
    text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    text = text.replace('&nbsp;', ' ').replace('&quot;', '"').replace('&#39;', "'")
    # Collapse whitespace.
    lines = [line.strip() for line in text.splitlines()]
    return '\n'.join(line for line in lines if line)


def send_templated_email(
    *,
    subject: str,
    template_name: str,
    context: dict,
    recipient_list,
    from_email=None,
    reply_to=None,
    fail_silently: bool = False,
) -> bool:
    """Send a branded HTML email. Returns True on success."""
    html_body, text_body = render_email(template_name, context)
    sender = from_email or settings.DEFAULT_FROM_EMAIL

    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=sender,
        to=list(recipient_list),
        reply_to=list(reply_to or []),
        alternatives=[(html_body, 'text/html')],
    )
    try:
        msg.send(fail_silently=fail_silently)
        return True
    except Exception:
        logger.exception('Failed to send templated email to %s', recipient_list)
        return False


def send_password_reset_otp(email: str, otp: str, user_name: str = '') -> bool:
    """Send the branded OTP email for password reset."""
    reset_url = f'{getattr(settings, "BASE_URL", "")}/reset-password'
    return send_templated_email(
        subject='ATLAS Password Reset Code',
        template_name='email/password_reset_otp.html',
        context={
            'otp': otp,
            'user_name': user_name,
            'reset_url': reset_url,
        },
        recipient_list=[email],
    )


def send_contact_notification(
    *,
    name: str,
    email: str,
    institution: str,
    message: str,
    submitted_at: str,
) -> bool:
    """Notify the ATLAS team about a new contact form submission."""
    recipients = [r.strip() for r in getattr(settings, 'ATLAS_CONTACT_EMAILS', 'atlas.hybrid.dev@gmail.com').split(',') if r.strip()]
    sender = (getattr(settings, 'EMAIL_HOST_USER', '') or '').strip() or None
    return send_templated_email(
        subject=f'ATLAS Contact Form - {name}',
        template_name='email/contact_notification.html',
        context={
            'name': name,
            'email': email,
            'institution': institution,
            'message': message,
            'submitted_at': submitted_at,
            'text_body': f'Contact form submission from {name} <{email}> of {institution}:\n\n{message}',
        },
        recipient_list=recipients,
        from_email=sender,
        reply_to=[email],
    )


def _contact_inbox() -> str:
    raw = getattr(settings, 'ATLAS_CONTACT_EMAILS', 'atlas.hybrid.dev@gmail.com')
    return next((part.strip() for part in str(raw).split(',') if part.strip()), 'atlas.hybrid.dev@gmail.com')


def send_contact_confirmation(name: str, email: str) -> bool:
    """Automatic reply to the address on the demo form."""
    inbox = _contact_inbox()
    home_url = getattr(settings, 'BASE_URL', '').rstrip('/') or '/'
    sender = (getattr(settings, 'EMAIL_HOST_USER', '') or '').strip() or None
    return send_templated_email(
        subject='We received your ATLAS request',
        template_name='email/contact_confirmation.html',
        context={
            'home_url': home_url,
            'contact_email': inbox,
            'text_body': (
                'We received your ATLAS request and will reply within 24 hours. '
                f'You can also write to {inbox}.'
            ),
        },
        recipient_list=[email],
        from_email=sender,
        reply_to=[inbox],
    )

