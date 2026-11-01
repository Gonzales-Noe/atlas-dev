"""Point every account and academic record at one institution."""

from django.db import migrations
from django.db.models import Q

TENANT_NAME = 'Batangas State University - Lipa Campus'
LEGACY_NAME = 'Batangas State University'


def _claim(value, taken, max_len):
    base = (value or '').strip() or 'ITEM'
    candidate = base[:max_len]
    if candidate.lower() not in taken:
        taken.add(candidate.lower())
        return candidate
    number = 2
    while True:
        suffix = f'-{number}'
        candidate = f'{base[:max_len - len(suffix)]}{suffix}'
        if candidate.lower() not in taken:
            taken.add(candidate.lower())
            return candidate
        number += 1


def consolidate_single_tenant(apps, schema_editor):
    Institution = apps.get_model('integrations', 'Institution')
    UserProfile = apps.get_model('integrations', 'UserProfile')
    College = apps.get_model('integrations', 'College')
    Program = apps.get_model('integrations', 'Program')
    Course = apps.get_model('integrations', 'Course')
    Section = apps.get_model('integrations', 'Section')
    CourseRequest = apps.get_model('integrations', 'CourseRequest')
    GlobalDocument = apps.get_model('integrations', 'GlobalDocument')

    tenant = Institution.objects.filter(name__iexact=TENANT_NAME).first()
    if tenant is None:
        tenant = Institution.objects.filter(name__iexact=LEGACY_NAME).order_by('created_at').first()
    if tenant is None:
        tenant = Institution.objects.create(
            name=TENANT_NAME,
            plan_tier='free',
            subscription_status='active',
            application_status='active',
            payment_status='paid',
            is_active=True,
        )
    elif tenant.name != TENANT_NAME:
        tenant.name = TENANT_NAME
        tenant.save(update_fields=['name'])

    tenant_id = tenant.pk

    def move_unique(model, code_field, max_len, name_field=None, name_max=255):
        rows = list(model.objects.all())
        taken_codes = {
            (getattr(row, code_field) or '').lower()
            for row in rows
            if row.institution_id == tenant_id
        }
        taken_names = set()
        if name_field:
            taken_names = {
                (getattr(row, name_field) or '').lower()
                for row in rows
                if row.institution_id == tenant_id
            }
        for row in rows:
            if row.institution_id == tenant_id:
                continue
            update_fields = ['institution']
            new_code = _claim(getattr(row, code_field), taken_codes, max_len)
            if new_code != getattr(row, code_field):
                setattr(row, code_field, new_code)
                update_fields.append(code_field)
            if name_field:
                new_name = _claim(getattr(row, name_field), taken_names, name_max)
                if new_name != getattr(row, name_field):
                    setattr(row, name_field, new_name)
                    update_fields.append(name_field)
            row.institution_id = tenant_id
            row.save(update_fields=update_fields)

    move_unique(College, 'code', 50, 'name', 255)
    move_unique(Program, 'code', 50, 'name', 255)
    move_unique(Course, 'course_code', 100)

    others = Q(institution_id__isnull=True) | ~Q(institution_id=tenant_id)
    Section.objects.filter(others).update(institution_id=tenant_id)
    CourseRequest.objects.filter(others).update(institution_id=tenant_id)
    GlobalDocument.objects.filter(others).update(institution_id=tenant_id)
    UserProfile.objects.filter(others).update(institution_id=tenant_id)

    Customization = apps.get_model('integrations', 'InstitutionCustomization')
    _keep_syllabus_template(Customization, tenant_id)

    Institution.objects.exclude(pk=tenant_id).delete()


def _keep_syllabus_template(Customization, tenant_id):
    """Keep an uploaded syllabus file when the surviving school row has none."""
    donor = (
        Customization.objects
        .exclude(institution_id=tenant_id)
        .exclude(syllabus_template='')
        .exclude(syllabus_template__isnull=True)
        .order_by('-updated_at')
        .first()
    )
    if donor is None:
        return
    current = Customization.objects.filter(institution_id=tenant_id).first()
    if current is None:
        donor.institution_id = tenant_id
        donor.save(update_fields=['institution'])
        return
    if current.syllabus_template:
        return
    current.syllabus_template = donor.syllabus_template.name or ''
    current.syllabus_working_docx = donor.syllabus_working_docx.name or ''
    current.syllabus_template_name = donor.syllabus_template_name
    current.syllabus_template_kind = donor.syllabus_template_kind
    current.syllabus_preview_blocks = donor.syllabus_preview_blocks
    current.syllabus_field_map = donor.syllabus_field_map
    current.syllabus_style_profile = donor.syllabus_style_profile or current.syllabus_style_profile
    if not current.header_image_url:
        current.header_image_url = donor.header_image_url
    if not current.footer_image_url:
        current.footer_image_url = donor.footer_image_url
    if not current.header_text:
        current.header_text = donor.header_text
    if not current.footer_text:
        current.footer_text = donor.footer_text
    current.save()


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0049_notifications'),
    ]

    operations = [
        migrations.RunPython(consolidate_single_tenant, migrations.RunPython.noop),
    ]
