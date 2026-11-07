"""
Purge audit logs older than the retention window and scrub legacy free-text notes.

Retention matches Privacy Policy §8 (3 years). Schedule on the VPS, e.g.:

    python manage.py purge_audit_logs

Recommended: daily or weekly cron.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.integrations.audit import scrub_allocation_notes
from apps.integrations.models import AuditLog

DEFAULT_RETENTION_YEARS = 3


class Command(BaseCommand):
    help = (
        'Delete audit logs older than 3 years and remove legacy allocation_note '
        'text from remaining rows. Run periodically via cron on the VPS.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--years',
            type=int,
            default=DEFAULT_RETENTION_YEARS,
            help=f'Retention window in years (default {DEFAULT_RETENTION_YEARS}).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report what would change without writing.',
        )

    def handle(self, *args, **options):
        years = max(1, int(options['years'] or DEFAULT_RETENTION_YEARS))
        dry_run = bool(options['dry_run'])
        cutoff = timezone.now() - timedelta(days=365 * years)

        old_qs = AuditLog.objects.filter(timestamp__lt=cutoff)
        old_count = old_qs.count()
        if dry_run:
            self.stdout.write(f'Would delete {old_count} audit log(s) older than {years} year(s).')
        else:
            deleted, _ = old_qs.delete()
            self.stdout.write(self.style.SUCCESS(
                f'Deleted {deleted} audit log row(s) older than {years} year(s).'
            ))

        scrubbed = 0
        remaining = AuditLog.objects.exclude(details=None).iterator(chunk_size=200)
        for log in remaining:
            details, changed = scrub_allocation_notes(log.details)
            if not changed:
                continue
            scrubbed += 1
            if not dry_run:
                log.details = details
                log.save(update_fields=['details'])

        if dry_run:
            self.stdout.write(f'Would scrub allocation_note from {scrubbed} remaining row(s).')
        else:
            self.stdout.write(self.style.SUCCESS(
                f'Scrubbed allocation_note from {scrubbed} remaining row(s).'
            ))
