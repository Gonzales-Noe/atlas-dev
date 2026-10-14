from datetime import timedelta

from django.db.models import F
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from .models import PaymentStatusEnum, SubscriptionStatusEnum, UserProfile, UserRole


TRIAL_DAYS = 7
TRIAL_FACULTY_LIMIT = 2
TRIAL_SYLLABUS_GENERATION_LIMIT = 5
PAID_PLAN_DAYS = 30


def trial_is_active(institution, now=None):
    now = now or timezone.now()
    return bool(
        institution
        and institution.subscription_status == SubscriptionStatusEnum.TRIALING
        and institution.trial_ends_at
        and institution.trial_ends_at > now
    )


def institution_access_is_active(institution, now=None):
    if institution is None:
        return None

    now = now or timezone.now()
    if institution.subscription_status == SubscriptionStatusEnum.TRIALING:
        return trial_is_active(institution, now)
    if (
        institution.subscription_status == SubscriptionStatusEnum.ACTIVE
        and institution.payment_status == PaymentStatusEnum.PAID
    ):
        return not institution.subscription_ends_at or institution.subscription_ends_at > now
    return False


def trial_generation_gate(user, *, syllabus_generation):
    institution = getattr(user, 'institution', None)
    if not institution or institution.subscription_status != SubscriptionStatusEnum.TRIALING:
        return None

    now = timezone.now()
    if not trial_is_active(institution, now):
        return Response(
            {'detail': 'Your 7-day trial has ended. Ask your institution admin to choose a paid plan.'},
            status=status.HTTP_402_PAYMENT_REQUIRED,
        )

    if not syllabus_generation:
        return Response(
            {'detail': 'During the trial, AI generation is available only in the Syllabus module.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    if user.role != UserRole.FACULTY:
        return Response(
            {'detail': 'Trial syllabus generation is available to faculty accounts.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    updated = UserProfile.objects.filter(
        user_id=user.user_id,
        institution_id=institution.institution_id,
        is_active=True,
        trial_generation_count__lt=TRIAL_SYLLABUS_GENERATION_LIMIT,
    ).update(trial_generation_count=F('trial_generation_count') + 1)
    if not updated:
        return Response(
            {
                'detail': 'This faculty account has used all 5 syllabus generations included in the trial.',
                'generation_limit': TRIAL_SYLLABUS_GENERATION_LIMIT,
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    user.trial_generation_count = getattr(user, 'trial_generation_count', 0) + 1
    return None


def trial_expiry(now=None):
    started_at = now or timezone.now()
    return started_at, started_at + timedelta(days=TRIAL_DAYS)
