"""Single-tenant deployment: one institution for every account."""

from django.db import transaction

TENANT_INSTITUTION_NAME = 'Batangas State University - Lipa Campus'
_LEGACY_TENANT_NAME = 'Batangas State University'


def get_tenant_institution():
    """Return the school this deployment serves, if it already exists."""
    from apps.integrations.models import Institution

    exact = Institution.objects.filter(name__iexact=TENANT_INSTITUTION_NAME).first()
    if exact is not None:
        return exact
    return Institution.objects.filter(name__iexact=_LEGACY_TENANT_NAME).order_by('created_at').first()


@transaction.atomic
def ensure_tenant_institution():
    """Return the one institution, creating it only when the database has none."""
    from apps.integrations.fixed_syllabus import attach_shared_syllabus_format
    from apps.integrations.models import Institution, PaymentStatusEnum, SubscriptionStatusEnum

    institution = get_tenant_institution()
    if institution is None:
        institution = Institution.objects.create(
            name=TENANT_INSTITUTION_NAME,
            plan_tier='free',
            subscription_status=SubscriptionStatusEnum.ACTIVE,
            application_status='active',
            payment_status=PaymentStatusEnum.PAID,
            is_active=True,
        )
        attach_shared_syllabus_format(institution)
        return institution

    if institution.name != TENANT_INSTITUTION_NAME:
        institution.name = TENANT_INSTITUTION_NAME
        institution.save(update_fields=['name'])
    return institution
