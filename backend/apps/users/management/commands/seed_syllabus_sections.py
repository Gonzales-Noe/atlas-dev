from django.core.management.base import BaseCommand

from apps.integrations.models import Institution, InstitutionCustomization
from apps.integrations.syllabus_defaults import default_syllabus_sections


def _uses_shared_format(sections):
    return any(
        isinstance(section, dict) and isinstance(section.get('fields'), list) and section['fields']
        for section in sections
    )


class Command(BaseCommand):
    help = 'Apply the shared Faculty Syllabus blueprint to every institution.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Replace formats that already use the shared structure.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report what would change without saving.',
        )

    def handle(self, *args, **options):
        created = seeded = replaced = skipped = 0
        for institution in Institution.objects.all().iterator():
            customization = InstitutionCustomization.objects.filter(institution=institution).first()
            if customization is None:
                if options['dry_run']:
                    self.stdout.write(f'Would create {institution.name} ({institution.pk})')
                else:
                    InstitutionCustomization.objects.create(
                        institution=institution,
                        syllabus_sections=default_syllabus_sections(),
                    )
                created += 1
                continue

            sections = customization.syllabus_sections or []
            if _uses_shared_format(sections) and not options['force']:
                skipped += 1
                continue
            if options['dry_run']:
                self.stdout.write(f'Would update {institution.name} ({institution.pk})')
            else:
                customization.syllabus_sections = default_syllabus_sections()
                customization.save(update_fields=['syllabus_sections', 'updated_at'])
            if sections:
                replaced += 1
            else:
                seeded += 1

        verb = 'Would seed' if options['dry_run'] else 'Seeded'
        self.stdout.write(self.style.SUCCESS(
            f'{verb}: {seeded} empty, {replaced} legacy, {created} created '
            f'| skipped {skipped} already on the shared format'
        ))
