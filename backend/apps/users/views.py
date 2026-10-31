import base64
import copy
import hashlib
import hmac
import json
import logging
import uuid
from datetime import timedelta
from io import BytesIO

import requests

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core import signing
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.db import transaction
from django.http import HttpResponse

from django.db.models import Count, Q, Value
from django.db.models.functions import Concat

from apps.users.system_health import activity_by_day
from django.utils import timezone
from django.core.mail import send_mail
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.users.sessions import end_session, touch_session

from apps.integrations import syllabus_pipeline, syllabus_template_doc
from apps.integrations.fixed_syllabus import canonical_syllabus_sections, publish_fixed_syllabus, seed_course_syllabi
from apps.integrations.syllabus_defaults import default_syllabus_sections
from apps.integrations.document_processor import DocumentProcessor
from apps.integrations.models import Assessment, AuditLog, Course, CourseLoad, Institution, InstitutionCustomization, MaintenanceUpdate, Section, StudentData, UserProfile, UserRole
from apps.integrations.trial import (
    PAID_PLAN_DAYS,
    TRIAL_FACULTY_LIMIT,
    TRIAL_SYLLABUS_GENERATION_LIMIT,
    institution_access_is_active,
    trial_is_active,
)

from .otp import OTP_ATTEMPT_LIMIT, OTP_LOCK_SECONDS, OTP_TTL_SECONDS, generate_otp, otp_matches, same_secret
from .serializers import (
    PASSWORD_RESET_CACHE_PREFIX,
    PASSWORD_RESET_SALT,
    ContactFormSerializer,
    DashboardSummarySerializer,
    EnrollCourseSerializer,
    FacultyCreateSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    PasswordResetVerifySerializer,
    ProfileSettingsUpdateSerializer,
    RegisterSerializer,
    StudentDetailsUpdateSerializer,
    UserAccountSerializer,
    UserProfileSerializer,
    UserProfileTokenObtainPairSerializer,
    UserProfileTokenRefreshSerializer,
    normalize_role,
    tokens_for_profile,
)

logger = logging.getLogger(__name__)


def _is_uuid(value) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def _otp_cache_key(email):
    return f'{PASSWORD_RESET_CACHE_PREFIX}{email.lower()}'


def _otp_attempts_key(email):
    return f'{PASSWORD_RESET_CACHE_PREFIX}attempts:{email.lower()}'


def _otp_lock_key(email):
    return f'{PASSWORD_RESET_CACHE_PREFIX}lock:{email.lower()}'


def _reset_grant_key(email):
    return f'{PASSWORD_RESET_CACHE_PREFIX}grant:{email.lower()}'


def _to_database_role(role_value):
    if role_value in {'superadmin', 'super_admin'}:
        return UserRole.SUPERADMIN
    if role_value == 'admin':
        return UserRole.ADMIN
    if role_value == 'faculty':
        return UserRole.FACULTY
    if role_value == 'student':
        return UserRole.STUDENT
    return role_value


def _verify_google_id_token(token):
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    allowed_audiences = set(settings.GOOGLE_OAUTH_CLIENT_IDS)
    if not allowed_audiences:
        raise ValueError('Google Sign-In is not configured on the server.')

    idinfo = google_id_token.verify_oauth2_token(
        token,
        google_requests.Request(),
        clock_skew_in_seconds=10,
    )
    issuer = idinfo.get('iss')
    if issuer not in {'accounts.google.com', 'https://accounts.google.com'}:
        raise ValueError('Invalid Google token issuer.')
    if idinfo.get('aud') not in allowed_audiences:
        raise ValueError('Invalid Google token audience.')
    if not idinfo.get('email_verified', False):
        raise ValueError('Google email is not verified.')
    if not idinfo.get('email'):
        raise ValueError('Google token did not include an email.')
    return idinfo


class AuthTokenView(TokenObtainPairView):
    permission_classes = [permissions.AllowAny]
    serializer_class = UserProfileTokenObtainPairSerializer


class GoogleAuthView(APIView):
    """Exchange a Google ID token for ATLAS JWT credentials."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        token = request.data.get('id_token') or request.data.get('credential')
        if not token or not isinstance(token, str):
            return Response(
                {'detail': 'Missing Google ID token.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            idinfo = _verify_google_id_token(token.strip())
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_401_UNAUTHORIZED)

        email = idinfo['email'].strip().lower()
        name = (idinfo.get('name') or email.split('@', 1)[0]).strip()

        profile = UserProfile.objects.select_related('institution').filter(email__iexact=email).first()
        if profile is None:
            return Response({
                'user_exists': False,
                'email': email,
                'name': name,
            })
        if not profile.is_active:
            return Response(
                {'detail': 'Account is inactive.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if profile.role == UserRole.STUDENT:
            return Response(
                {
                    'detail': 'Student accounts are no longer supported. ATLAS is for faculty and administrators.',
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        picture = idinfo.get('picture')
        if isinstance(picture, str) and picture.strip():
            profile.picture_url = picture.strip()[:500]
            try:
                profile.save(update_fields=['picture_url'])
            except Exception:
                pass

        return Response(tokens_for_profile(profile))


class AuthTokenRefreshView(TokenRefreshView):
    permission_classes = [permissions.AllowAny]
    serializer_class = UserProfileTokenRefreshSerializer


class LogoutView(APIView):
    """End this sign-in. A newer sign-in on another device is left alone."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        raw = request.data.get('refresh')
        if isinstance(raw, str) and raw.strip():
            try:
                token = RefreshToken(raw.strip())
            except TokenError:
                token = None
            if token is not None:
                end_session(
                    token.payload.get('user_id'),
                    token.payload.get('sid'),
                )
        return Response({'detail': 'Signed out.'})


class AuthActivityView(APIView):
    """Heartbeat from a page the person is actually using. Extends the 30-minute idle window."""

    def post(self, request):
        touch_session(request.user)
        return Response({'ok': True})


class MeView(APIView):
    def get(self, request):
        return Response(UserProfileSerializer(request.user).data)

    def patch(self, request):
        user = request.user
        profile_fields = {'full_name', 'picture_url', 'current_password', 'new_password'}
        if profile_fields.intersection(request.data):
            serializer = ProfileSettingsUpdateSerializer(
                user,
                data=request.data,
                partial=True,
                context={'request': request},
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()

        if 'courses_enrolled' in request.data:
            serializer = StudentDetailsUpdateSerializer(data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            student_data, _ = StudentData.objects.get_or_create(user=user)
            student_data.courses_enrolled = serializer.validated_data['courses_enrolled']
            student_data.save()

        return Response(UserProfileSerializer(user).data)


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    @transaction.atomic
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = serializer.save()
        return Response(
            {
                'detail': 'Registration received.',
                **tokens_for_profile(profile),
                'user': UserProfileSerializer(profile).data,
            },
            status=status.HTTP_201_CREATED,
        )


class BillingCheckoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    PLAN_PRICES = {
        'Starter': 249900,
        'Professional': 699900,
    }
    PAID_PLANS = frozenset(PLAN_PRICES)

    def _get_selected_plan(self, request):
        value = str(request.data.get('selected_plan') or request.user.institution.selected_plan or '').strip()
        if value not in self.PAID_PLANS:
            raise ValueError('Please select a plan before continuing.')
        return value

    def _build_checkout_payload(self, request, plan_name, amount):
        success_url = settings.PAYMONGO_SUCCESS_URL
        cancel_url = settings.PAYMONGO_CANCEL_URL
        if success_url and '://' in success_url:
            success_url = success_url
        if cancel_url and '://' in cancel_url:
            cancel_url = cancel_url

        return {
            'data': {
                'attributes': {
                    'payment_method_types': ['card'],
                    'line_items': [{
                        'amount': int(amount),
                        'currency': 'PHP',
                        'quantity': 1,
                        'name': f'ATLAS {plan_name} Plan',
                    }],
                    'success_url': success_url,
                    'cancel_url': cancel_url,
                    'customer_email': request.user.email,
                    'description': f'ATLAS institutional subscription for {request.user.institution.name if request.user.institution else "institution"}',
                }
            }
        }

    def post(self, request):
        if normalize_role(request.user.role) not in {'admin'}:
            return Response({'detail': 'Only institution admins can start billing.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            plan_name = self._get_selected_plan(request)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        institution = getattr(request.user, 'institution', None)
        if not institution:
            return Response({'detail': 'Institution not found for this account.'}, status=status.HTTP_404_NOT_FOUND)

        if not settings.PAYMONGO_SECRET_KEY:
            return Response({'detail': 'PayMongo is not configured on this server.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        amount = self.PLAN_PRICES.get(plan_name)
        if amount is None:
            return Response({'detail': 'Unsupported plan selected.'}, status=status.HTTP_400_BAD_REQUEST)

        payload = self._build_checkout_payload(request, plan_name, amount)
        try:
            response = requests.post(
                f'{settings.PAYMONGO_API_BASE}/v1/checkout_sessions',
                json=payload,
                auth=(settings.PAYMONGO_SECRET_KEY, ''),
                timeout=30,
            )
            if response.status_code >= 400:
                logger.error('PayMongo checkout failed: %s %s', response.status_code, response.text)
                try:
                    data = response.json()
                    detail = data.get('errors') or data.get('detail') or 'Unable to create checkout session.'
                except ValueError:
                    detail = response.text or 'Unable to create checkout session.'
                return Response({'detail': detail}, status=response.status_code)
        except requests.RequestException as exc:
            logger.exception('PayMongo request error during checkout.')
            return Response({'detail': f'Unable to reach PayMongo: {exc}'}, status=status.HTTP_502_BAD_GATEWAY)

        try:
            data = response.json()
        except ValueError:
            return Response({'detail': 'PayMongo returned an invalid response.'}, status=status.HTTP_502_BAD_GATEWAY)

        session_data = data.get('data', {})
        session_attributes = session_data.get('attributes', {}) if isinstance(session_data, dict) else {}
        checkout_id = session_data.get('id', '')
        checkout_url = session_attributes.get('checkout_url', '')

        institution.selected_plan = plan_name
        institution.payment_status = 'pending'
        is_trial_active = trial_is_active(institution)
        if not is_trial_active:
            institution.application_status = 'approved_pending_payment'
            institution.is_active = False
        institution.paymongo_checkout_session_id = checkout_id
        institution.paymongo_checkout_url = checkout_url or ''
        institution.paymongo_reference_number = session_attributes.get('reference_number') or ''
        update_fields = [
            'selected_plan',
            'payment_status',
            'paymongo_checkout_session_id',
            'paymongo_checkout_url',
            'paymongo_reference_number',
        ]
        if not is_trial_active:
            update_fields.extend(['application_status', 'is_active'])
        institution.save(update_fields=update_fields)

        return Response({
            'checkout_url': checkout_url,
            'checkout_session_id': checkout_id,
            'status': 'pending_payment',
            'plan': plan_name,
        })


class BillingStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        institution = getattr(request.user, 'institution', None)
        if not institution:
            return Response({'detail': 'Institution not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            'application_status': institution.application_status,
            'payment_status': institution.payment_status,
            'subscription_status': institution.subscription_status,
            'selected_plan': institution.selected_plan or institution.plan_tier,
            'is_active': institution.is_active,
            'access_active': institution_access_is_active(institution),
            'trial_active': trial_is_active(institution),
            'trial_expired': (
                institution.subscription_status == 'trialing'
                and not trial_is_active(institution)
            ),
            'trial_started_at': institution.trial_started_at,
            'trial_ends_at': institution.trial_ends_at,
            'subscription_ends_at': institution.subscription_ends_at,
            'faculty_count': UserProfile.objects.filter(
                institution=institution,
                role=UserRole.FACULTY,
                is_active=True,
            ).count(),
            'faculty_limit': TRIAL_FACULTY_LIMIT,
            'generation_used': getattr(request.user, 'trial_generation_count', 0),
            'generation_limit': TRIAL_SYLLABUS_GENERATION_LIMIT,
            'role': normalize_role(request.user.role),
            'checkout_session_id': institution.paymongo_checkout_session_id,
            'checkout_url': institution.paymongo_checkout_url,
        })


class BillingWebhookView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        secret = settings.PAYMONGO_WEBHOOK_SECRET
        if not secret:
            return Response({'detail': 'Webhook secret is not configured.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        signature = request.META.get('HTTP_X_PAYMONGO_SIGNATURE') or request.META.get('HTTP_X_PAYMONGO_WEBHOOK_SIGNATURE')
        if not signature:
            return Response({'detail': 'Missing PayMongo signature.'}, status=status.HTTP_401_UNAUTHORIZED)

        raw_body = request.body
        expected_signature = hmac.new(secret.encode('utf-8'), raw_body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected_signature, signature):
            logger.warning('PayMongo webhook signature mismatch for institution billing webhook.')
            return Response({'detail': 'Invalid signature.'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            payload = json.loads(raw_body.decode('utf-8'))
        except (TypeError, ValueError):
            return Response({'detail': 'Invalid payload.'}, status=status.HTTP_400_BAD_REQUEST)

        event = payload.get('data', {}) if isinstance(payload, dict) else {}
        resource_type = event.get('type') if isinstance(event, dict) else None
        resource_attributes = event.get('attributes', {}) if isinstance(event, dict) else {}
        resource_id = event.get('id') if isinstance(event, dict) else None
        if resource_type != 'checkout_session':
            return Response({'received': True, 'ignored': True})

        checkout_status = str(resource_attributes.get('status', '')).lower()
        if checkout_status not in {'paid', 'complete', 'completed'}:
            return Response({'received': True, 'status': checkout_status or 'unknown'})

        institution = Institution.objects.filter(paymongo_checkout_session_id=resource_id).first()
        if not institution:
            institution = Institution.objects.filter(paymongo_reference_number=resource_attributes.get('reference_number', '')).first()

        if institution is None:
            logger.warning('PayMongo webhook received for unknown checkout_session_id=%s', resource_id)
            return Response({'received': True, 'status': 'ignored_unknown_session'})

        event_id = event.get('id')
        if event_id and institution.paymongo_last_event_id == event_id:
            return Response({'received': True, 'status': 'already_processed'})

        now = timezone.now()
        current_period_end = institution.subscription_ends_at
        period_start = current_period_end if current_period_end and current_period_end > now else now
        institution.payment_status = 'paid'
        institution.application_status = 'active'
        institution.subscription_status = 'active'
        institution.is_active = True
        institution.paid_at = now
        institution.reviewed_at = now
        institution.subscription_ends_at = period_start + timedelta(days=PAID_PLAN_DAYS)
        if event_id:
            institution.paymongo_last_event_id = event_id
        institution.save(update_fields=[
            'payment_status',
            'application_status',
            'subscription_status',
            'is_active',
            'paid_at',
            'reviewed_at',
            'subscription_ends_at',
            'paymongo_last_event_id',
        ])
        logger.info('Activated institution %s after PayMongo checkout payment.', institution.institution_id)
        return Response({'received': True, 'status': 'paid'})


class FacultyCreateView(APIView):
    """Allow institution admins to create faculty users within their institution."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        role = normalize_role(request.user.role)
        if role != 'admin':
            return Response({'detail': 'Only institution admins can create faculty users.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = FacultyCreateSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        profile = serializer.save()
        AuditLog.objects.create(
            user=request.user,
            action_type="faculty_account_created",
            resource_type="UserProfile",
            resource_id=profile.user_id,
            details={
                "faculty_email": profile.email,
                "faculty_name": profile.full_name or '',
                "role": profile.role,
                "institution_id": str(profile.institution_id) if profile.institution_id else None,
            },
        )
        return Response(
            {
                'detail': 'Faculty account created.',
                'user': UserProfileSerializer(profile).data,
            },
            status=status.HTTP_201_CREATED,
        )


class PasswordResetRequestView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        profile = UserProfile.objects.filter(email__iexact=email, is_active=True).first()
        if profile and not cache.get(_otp_lock_key(email)):
            otp = generate_otp()
            cache.set(_otp_cache_key(email), otp, timeout=OTP_TTL_SECONDS)
            cache.delete(_otp_attempts_key(email))
            # Send the branded OTP email through the shared email service so the
            # structure, logo and footer stay consistent with the rest of ATLAS.
            from .email_service import send_password_reset_otp
            send_password_reset_otp(
                email=email,
                otp=otp,
                user_name=profile.name or '',
            )

        return Response({'detail': 'If the account exists, a reset code has been generated.'})


class PasswordResetVerifyView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        otp = serializer.validated_data['otp']

        if cache.get(_otp_lock_key(email)):
            return Response(
                {'detail': 'Too many attempts. Request a new code later.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        cached_otp = cache.get(_otp_cache_key(email))
        if not cached_otp or not otp_matches(cached_otp, otp):
            try:
                attempts = cache.incr(_otp_attempts_key(email))
            except ValueError:
                cache.set(_otp_attempts_key(email), 1, timeout=OTP_TTL_SECONDS)
                attempts = 1
            if attempts >= OTP_ATTEMPT_LIMIT:
                cache.delete(_otp_cache_key(email))
                cache.delete(_otp_attempts_key(email))
                cache.set(_otp_lock_key(email), 1, timeout=OTP_LOCK_SECONDS)
                return Response(
                    {'detail': 'Too many attempts. Request a new code later.'},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )
            return Response(
                {'detail': 'Invalid or expired code.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cache.delete(_otp_cache_key(email))
        cache.delete(_otp_attempts_key(email))
        reset_token = signing.dumps({'email': email}, salt=PASSWORD_RESET_SALT)
        cache.set(_reset_grant_key(email), reset_token, timeout=1800)
        return Response({'reset_token': reset_token})


class PasswordResetConfirmView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            payload = signing.loads(
                serializer.validated_data['reset_token'],
                salt=PASSWORD_RESET_SALT,
                max_age=1800,
            )
        except signing.BadSignature:
            return Response({'detail': 'Invalid or expired reset token.'}, status=status.HTTP_400_BAD_REQUEST)

        email = payload.get('email')
        submitted = serializer.validated_data['reset_token']
        issued = cache.get(_reset_grant_key(email))
        if not issued or not same_secret(issued, submitted):
            return Response({'detail': 'Invalid or expired reset token.'}, status=status.HTTP_400_BAD_REQUEST)

        profile = UserProfile.objects.filter(email__iexact=email, is_active=True).first()
        if not profile:
            return Response({'detail': 'Account not found.'}, status=status.HTTP_404_NOT_FOUND)

        profile.password_hash = make_password(serializer.validated_data['new_password'])
        profile.save(update_fields=['password_hash'])
        cache.delete(_otp_cache_key(email))
        cache.delete(_otp_attempts_key(email))
        cache.delete(_reset_grant_key(email))
        return Response({'detail': 'Password updated successfully.'})


_DASHBOARD_CACHE_SECONDS = 15


def _dashboard_cache_get(key):
    try:
        return cache.get(key)
    except Exception:
        logger.warning('Dashboard cache read failed for %s', key, exc_info=True)
        return None


def _dashboard_cache_set(key, value):
    try:
        cache.set(key, value, timeout=_DASHBOARD_CACHE_SECONDS)
    except Exception:
        logger.warning('Dashboard cache write failed for %s', key, exc_info=True)


class DashboardSummaryView(APIView):
    def get(self, request):
        cache_key = f'dashboard:summary:{request.user.user_id}'
        cached = _dashboard_cache_get(cache_key)
        if cached is not None:
            return Response(cached)

        role = normalize_role(request.user.role)
        if role == 'admin':
            payload = self._admin_summary(request)
        elif role == 'superadmin':
            payload = self._superadmin_summary(request)
        elif role == 'student':
            payload = self._student_summary(request)
        else:
            payload = self._faculty_summary(request)
        _dashboard_cache_set(cache_key, payload)
        return Response(payload)

    def _faculty_summary(self, request):
        faculty = request.user
        assignments = CourseLoad.objects.select_related('course', 'section').filter(faculty=faculty)
        by_course = {}
        for assignment in assignments:
            entry = by_course.setdefault(assignment.course_id, {
                'course_id': str(assignment.course.course_id),
                'course_code': assignment.course.course_code,
                'course_title': assignment.course.course_title,
                'sections': [],
            })
            if assignment.section_name:
                entry['sections'].append(assignment.section_name)
        for entry in by_course.values():
            entry['section'] = ', '.join(sorted(entry['sections']))
        course_count = len(by_course)
        assessment_count = Assessment.objects.filter(course_id__in=list(by_course)).count()
        courses = list(by_course.values())[:5]
        payload = {
            'role': 'faculty',
            'title': 'Faculty Dashboard',
            'subtitle': 'Manage your teaching load, assessments, and grading workflow.',
            'cards': [
                {'label': 'Assigned courses', 'value': course_count, 'tone': 'faculty'},
                {'label': 'Assessments', 'value': assessment_count, 'tone': 'faculty'},
            ],
            'nav_items': [
                {'label': 'Dashboard', 'to': '/faculty/dashboard'},
                {'label': 'Syllabus', 'to': '/faculty/syllabus'},
                {'label': 'Module Builder', 'to': '/faculty/module'},
                {'label': 'Assessment', 'to': '/faculty/assessment'},
                {'label': 'Grading', 'to': '/faculty/grading'},
            ],
            'recent': courses,
            'courses': list(by_course.values()),
        }
        DashboardSummarySerializer(data=payload).is_valid(raise_exception=True)
        return payload

    def _admin_summary(self, request):
        institution = request.user.institution
        faculty_count = UserProfile.objects.filter(institution=institution, role=UserRole.FACULTY).count()
        admin_count = UserProfile.objects.filter(institution=institution, role=UserRole.ADMIN).count()
        active_users = UserProfile.objects.filter(institution=institution, is_active=True).count()
        payload = {
            'role': 'admin',
            'title': 'Admin Dashboard',
            'subtitle': 'Oversee institutional users and governance tasks.',
            'cards': [
                {'label': 'Active users', 'value': active_users, 'tone': 'admin'},
                {'label': 'Faculty accounts', 'value': faculty_count, 'tone': 'admin'},
                {'label': 'Admin accounts', 'value': admin_count, 'tone': 'admin'},
            ],
            'nav_items': [
                {'label': 'Dashboard', 'to': '/admin/dashboard'},
                {'label': 'Accounts', 'to': '/admin/account-management'},
                {'label': 'Knowledge Base', 'to': '/admin/global-knowledge'},
                {'label': 'Audit Logs', 'to': '/admin/audit-logs'},
            ],
            'recent': [
                {'label': user.email, 'value': normalize_role(user.role), 'detail': 'Account status' }
                for user in UserProfile.objects.filter(institution=institution).order_by('-created_at')[:5]
            ],
        }
        DashboardSummarySerializer(data=payload).is_valid(raise_exception=True)
        return payload

    def _student_summary(self, request):
        student = request.user
        student_data = StudentData.objects.filter(user=student).first()
        enrolled_courses = student_data.courses_enrolled if student_data else []
        course_count = len(enrolled_courses)

        recent = [
            {
                'course_id': c.get('course_id', ''),
                'course_code': c.get('course_code', ''),
                'course_title': c.get('course_title', ''),
            }
            for c in enrolled_courses[:10]
        ]

        payload = {
            'role': 'student',
            'title': 'Student Dashboard',
            'subtitle': 'View your enrolled courses, assessments, and grades.',
            'cards': [
                {'label': 'Enrolled courses', 'value': course_count, 'tone': 'student'},
            ],
            'nav_items': [
                {'label': 'Dashboard', 'to': '/student/dashboard'},
                {'label': 'Courses', 'to': '/student/courses'},
                {'label': 'Grades', 'to': '/student/grades'},
                {'label': 'Settings', 'to': '/student/settings'},
            ],
            'recent': recent,
        }
        DashboardSummarySerializer(data=payload).is_valid(raise_exception=True)
        return payload

    def _superadmin_summary(self, request):
        role_rows = {
            row['role']: row['total']
            for row in UserProfile.objects.values('role').annotate(total=Count('user_id'))
        }
        user_distribution = [
            {'name': 'Super Admins', 'value': role_rows.get(UserRole.SUPERADMIN, 0)},
            {'name': 'Admins', 'value': role_rows.get(UserRole.ADMIN, 0)},
            {'name': 'Faculty', 'value': role_rows.get(UserRole.FACULTY, 0)},
            {'name': 'Students', 'value': role_rows.get(UserRole.STUDENT, 0)},
        ]
        institution_trend = []
        cursor = timezone.localtime().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_starts = []
        for _ in range(6):
            month_starts.append(cursor)
            cursor = (cursor - timedelta(days=1)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for month in reversed(month_starts):
            nxt = (month.replace(day=28) + timedelta(days=4)).replace(day=1)
            institution_trend.append({
                'name': month.strftime('%b'),
                'institutions': Institution.objects.filter(created_at__gte=month, created_at__lt=nxt).count(),
                'users': UserProfile.objects.filter(created_at__gte=month, created_at__lt=nxt).count(),
            })
        role_names = {
            'superadmin': 'Superadmin',
            'admin': 'Admin',
            'faculty': 'Faculty',
            'student': 'Student',
        }
        recent_activity = []
        for log in AuditLog.objects.select_related('user').order_by('-timestamp')[:6]:
            user = log.user if log.user_id else None
            role_name = role_names.get(normalize_role(user.role), 'Unknown') if user else 'Unknown'
            recent_activity.append({
                'label': log.action_type,
                'value': (user.full_name or user.email) if user else 'Unknown user',
                'detail': role_name,
                'timestamp': log.timestamp.isoformat() if log.timestamp else '',
            })
        payload = {
            'role': 'superadmin',
            'title': 'Super Admin Dashboard',
            'subtitle': 'Role totals and the latest activity.',
            'cards': [
                {'label': 'Super Admins', 'value': role_rows.get(UserRole.SUPERADMIN, 0), 'tone': 'superadmin'},
                {'label': 'Admins', 'value': role_rows.get(UserRole.ADMIN, 0), 'tone': 'superadmin'},
                {'label': 'Faculty', 'value': role_rows.get(UserRole.FACULTY, 0), 'tone': 'superadmin'},
                {'label': 'Students', 'value': role_rows.get(UserRole.STUDENT, 0), 'tone': 'superadmin'},
                {'label': 'Courses', 'value': Course.objects.count(), 'tone': 'superadmin'},
                {'label': 'Assessments', 'value': Assessment.objects.count(), 'tone': 'superadmin'},
            ],
            'nav_items': [
                {'label': 'Dashboard', 'to': '/superadmin/dashboard'},
                {'label': 'Accounts', 'to': '/superadmin/account-management'},
                {'label': 'System Health', 'to': '/superadmin/system-management'},
                {'label': 'Audit Logs', 'to': '/superadmin/audit-logs'},
                {'label': 'Appearance', 'to': '/superadmin/appearance'},
            ],
            'recent': [],
            'user_distribution': user_distribution,
            'institution_trend': institution_trend,
            'activity_trend': activity_by_day(14),
            'recent_activity': recent_activity,
            'maintenance_update_count': MaintenanceUpdate.objects.count(),
            'maintenance_updates': [
                {
                    'summary': item.summary,
                    'started_at': item.started_at.isoformat() if item.started_at else None,
                    'ended_at': item.ended_at.isoformat() if item.ended_at else None,
                }
                for item in MaintenanceUpdate.objects.order_by('-recorded_at')[:8]
            ],
        }
        DashboardSummarySerializer(data=payload).is_valid(raise_exception=True)
        return payload


class AccountManagementView(APIView):
    def get(self, request):
        role = normalize_role(request.user.role)
        queryset = UserProfile.objects.select_related('institution').order_by('-created_at')
        if role == 'admin':
            queryset = queryset.filter(institution=request.user.institution)
        if role not in {'admin', 'superadmin'}:
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        return Response([UserAccountSerializer(user).data for user in queryset])


class InstitutionManagementView(APIView):
    """List and approve institution applications for the superadmin console."""

    def _require_superadmin(self, request):
        if normalize_role(request.user.role) != 'superadmin':
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        return None

    def get(self, request):
        denied = self._require_superadmin(request)
        if denied:
            return denied

        institutions = Institution.objects.annotate(user_count=Count('userprofile')).order_by('-created_at')
        rows = []
        for institution in institutions:
            admins = list(UserProfile.objects.filter(institution=institution, role=UserRole.ADMIN).order_by('created_at'))
            rows.append({
                'id': str(institution.institution_id),
                'institution': institution.name,
                'admin': ', '.join(admin.name for admin in admins) or 'Not assigned',
                'email': ', '.join(admin.email for admin in admins),
                'status': 'active' if institution.is_active else institution.application_status,
                'subscription_plan': institution.selected_plan or institution.plan_tier,
                'payment_status': institution.payment_status,
                'users': institution.user_count,
                'created_at': institution.created_at.isoformat(),
            })
        return Response(rows)

    def patch(self, request, institution_id):
        denied = self._require_superadmin(request)
        if denied:
            return denied

        institution = Institution.objects.filter(institution_id=institution_id).first()
        if not institution:
            return Response({'detail': 'Institution not found.'}, status=status.HTTP_404_NOT_FOUND)

        decision = request.data.get('decision')
        if decision == 'approve':
            institution.application_status = 'active'
            institution.subscription_status = 'trialing'
            institution.payment_status = 'unpaid'
            institution.is_active = True
            institution.reviewed_at = timezone.now()
        elif decision == 'reject':
            institution.application_status = 'rejected'
            institution.is_active = False
            institution.reviewed_at = timezone.now()
        elif decision not in {None, ''}:
            return Response({'detail': 'Decision must be approve or reject.'}, status=status.HTTP_400_BAD_REQUEST)

        if 'selected_plan' in request.data:
            institution.selected_plan = str(request.data['selected_plan']).strip()[:50]
        if 'name' in request.data:
            institution.name = str(request.data['name']).strip()[:255]
        if 'payment_status' in request.data and request.data['payment_status'] in {'unpaid', 'pending', 'paid'}:
            institution.payment_status = request.data['payment_status']
            # When a plan is selected and marked paid, activate the subscription so
            # users under this institution can access the dashboard based on the plan.
            if (
                request.data['payment_status'] == 'paid'
                and 'selected_plan' in request.data
                and str(request.data['selected_plan']).strip()
            ):
                institution.subscription_status = 'active'
                institution.subscription_ends_at = timezone.now() + timedelta(days=PAID_PLAN_DAYS)
        if 'is_active' in request.data:
            institution.is_active = bool(request.data['is_active'])
            institution.application_status = 'active' if institution.is_active else 'rejected'
            if not institution.is_active:
                # Deactivating the account revokes dashboard access.
                institution.subscription_status = 'canceled'

        institution.save(update_fields=['application_status', 'subscription_status', 'payment_status', 'is_active', 'reviewed_at', 'selected_plan', 'name', 'subscription_ends_at'])
        if 'is_active' in request.data:
            AuditLog.objects.create(
                user=request.user,
                action_type=("institution_reactivated" if institution.is_active else "institution_deactivated"),
                resource_type="Institution",
                resource_id=institution.institution_id,
                details={
                    "institution_name": institution.name,
                    "is_active": institution.is_active,
                    "application_status": institution.application_status,
                },
            )
        return Response({'id': str(institution.institution_id), 'status': institution.application_status})

    def delete(self, request, institution_id):
        """Superadmin hard-delete: removes the institution, all member
        accounts, and all academic data under it."""
        from .deletion import AccountDeletionError, delete_institution

        denied = self._require_superadmin(request)
        if denied:
            return denied

        institution = Institution.objects.filter(institution_id=institution_id).first()
        if not institution:
            return Response({'detail': 'Institution not found.'}, status=status.HTTP_404_NOT_FOUND)

        institution_name = institution.name
        institution_id_str = str(institution.institution_id)

        try:
            result = delete_institution(institution)
        except AccountDeletionError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_409_CONFLICT)
        AuditLog.objects.create(
            user=request.user,
            action_type="institution_deleted",
            resource_type="Institution",
            resource_id=institution_id_str,
            details={
                "deleted_institution_name": institution_name,
                "institution_id": institution_id_str,
            },
        )
        return Response(result, status=status.HTTP_200_OK)


class AccountDetailView(APIView):
    def _require_manager(self, request):
        role = normalize_role(request.user.role)
        if role not in {'admin', 'superadmin'}:
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        return None

    def _check_object_institution(self, request, target):
        """Tenant admins may only touch users of their own institution."""
        if normalize_role(request.user.role) == 'superadmin':
            return None
        if not target.institution_id or target.institution_id != request.user.institution_id:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return None

    def patch(self, request, user_id):
        denied = self._require_manager(request)
        if denied:
            return denied

        target = UserProfile.objects.select_related('institution').filter(user_id=user_id).first()
        if not target:
            return Response({'detail': 'Account not found.'}, status=status.HTTP_404_NOT_FOUND)

        denied = self._check_object_institution(request, target)
        if denied:
            return denied
        role = normalize_role(request.user.role)

        if 'role' in request.data:
            role_value = _to_database_role(request.data['role'])
            if role_value == UserRole.STUDENT or request.data.get('role') in {'student', UserRole.STUDENT}:
                return Response(
                    {'detail': 'Student accounts are not supported.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if role_value not in {UserRole.FACULTY, UserRole.ADMIN, UserRole.SUPERADMIN}:
                return Response({'detail': 'Invalid role.'}, status=status.HTTP_400_BAD_REQUEST)
            if role == 'admin' and role_value == UserRole.SUPERADMIN:
                return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
            target.role = role_value

        if 'is_active' in request.data:
            target.is_active = bool(request.data['is_active'])

        if 'full_name' in request.data:
            target.full_name = str(request.data['full_name'] or '').strip()

        if 'email' in request.data:
            target.email = request.data['email'].strip().lower()

        target.save()
        if 'is_active' in request.data:
            AuditLog.objects.create(
                user=request.user,
                action_type=("account_reactivated" if target.is_active else "account_deactivated"),
                resource_type="UserProfile",
                resource_id=target.user_id,
                details={
                    "account_email": target.email,
                    "account_name": target.full_name or '',
                    "role": target.role,
                    "is_active": target.is_active,
                    "institution_id": str(target.institution_id) if target.institution_id else None,
                },
            )
        return Response(UserAccountSerializer(target).data)

    def delete(self, request, user_id):
        """Delete one account. Deleting the last admin of an institution
        removes the whole institution and all of its data, so a re-used
        email starts from a clean first-time setup."""
        from .deletion import AccountDeletionError, delete_user_account

        denied = self._require_manager(request)
        if denied:
            return denied

        target = UserProfile.objects.select_related('institution').filter(user_id=user_id).first()
        if not target:
            return Response({'detail': 'Account not found.'}, status=status.HTTP_404_NOT_FOUND)

        denied = self._check_object_institution(request, target)
        if denied:
            return denied

        role = normalize_role(request.user.role)
        if role == 'admin' and normalize_role(target.role) == 'superadmin':
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        if target.pk == request.user.pk:
            return Response(
                {'detail': 'You cannot delete your own account while signed in.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_email = target.email
        target_name = target.full_name or ''
        target_role = target.role
        target_institution_id = str(target.institution_id) if target.institution_id else None

        try:
            result = delete_user_account(target)
        except AccountDeletionError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_409_CONFLICT)
        AuditLog.objects.create(
            user=request.user,
            action_type="account_deleted",
            resource_type="UserProfile",
            resource_id=user_id,
            details={
                "deleted_email": target_email,
                "deleted_name": target_name,
                "deleted_role": target_role,
                "institution_deleted": result.get('institution_deleted', False),
                "institution_id": target_institution_id,
            },
        )
        return Response(result, status=status.HTTP_200_OK)


class FacultyAssignmentsView(APIView):
    def _require_admin(self, request):
        role = normalize_role(request.user.role)
        if role not in {'admin', 'superadmin'}:
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        return None

    def get(self, request):
        denied = self._require_admin(request)
        if denied:
            return denied

        role = normalize_role(request.user.role)
        faculty_queryset = UserProfile.objects.select_related('institution').filter(role=UserRole.FACULTY)
        if role == 'admin':
            faculty_queryset = faculty_queryset.filter(institution=request.user.institution)

        assignments = CourseLoad.objects.select_related(
            'course', 'course__syllabus_owner', 'faculty', 'section',
        ).filter(
            faculty__in=faculty_queryset,
        ).order_by('faculty__email', 'course__course_code')
        sections = Section.objects.order_by('code')
        if role == 'admin':
            sections = sections.filter(
                Q(institution=request.user.institution)
                | Q(program__institution=request.user.institution)
            )

        course_queryset = Course.objects.order_by('course_code')
        if role == 'admin' and request.user.institution_id:
            course_queryset = course_queryset.filter(institution=request.user.institution)

        course_queryset = course_queryset.select_related('section', 'syllabus_owner')
        return Response({
            'faculty': [UserAccountSerializer(profile).data for profile in faculty_queryset.order_by('email')],
            'courses': [
                {
                    'course_id': str(course.course_id),
                    'course_code': course.course_code,
                    'course_title': course.course_title,
                    'section': course.section.code if course.section_id else '',
                    'category': course.category,
                    'syllabus_owner_id': str(course.syllabus_owner_id) if course.syllabus_owner_id else None,
                    'syllabus_owner_name': (
                        course.syllabus_owner.full_name or course.syllabus_owner.email
                        if course.syllabus_owner_id else ''
                    ),
                }
                for course in course_queryset
            ],
            'assignments': [
                {
                    'assignment_id': str(assignment.assignment_id),
                    'faculty_id': str(assignment.faculty_id),
                    'course_id': str(assignment.course_id),
                    'course_code': assignment.course.course_code,
                    'course_title': assignment.course.course_title,
                    'section_id': str(assignment.section_id) if assignment.section_id else None,
                    'section': assignment.section_name,
                    'syllabus_owner_id': (
                        str(assignment.course.syllabus_owner_id)
                        if assignment.course.syllabus_owner_id else None
                    ),
                }
                for assignment in assignments
            ],
            'sections': [
                {
                    'section_id': str(s.section_id),
                    'section_name': s.section_name,
                    'code': s.code,
                    'display_name': s.code,
                }
                for s in sections
            ],
        })

    def post(self, request):
        denied = self._require_admin(request)
        if denied:
            return denied

        faculty = UserProfile.objects.filter(
            user_id=request.data.get('faculty_id'),
            role=UserRole.FACULTY,
        ).first()
        if not faculty:
            return Response({'detail': 'Faculty account not found.'}, status=status.HTTP_404_NOT_FOUND)
        if normalize_role(request.user.role) == 'admin' and faculty.institution_id != request.user.institution_id:
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)

        section_id = str(request.data.get('section_id') or '').strip()
        section_name = str(request.data.get('section') or '').strip()[:50]
        if section_id:
            section = Section.objects.filter(section_id=section_id).first() if _is_uuid(section_id) else None
            if not section:
                return Response({'detail': 'Section not found.'}, status=status.HTTP_404_NOT_FOUND)
        elif section_name:
            section = Section.objects.annotate(
                display_label=Concat('program__code', Value(' '), 'code'),
            ).filter(
                Q(institution_id=faculty.institution_id) | Q(program__institution_id=faculty.institution_id),
                Q(code__iexact=section_name) | Q(display_label__iexact=section_name),
            ).first() or Section.objects.create(
                institution_id=faculty.institution_id, code=section_name,
            )
        else:
            return Response({'detail': 'Handled section is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Get or create course
        course_id = request.data.get('course_id')
        course = None
        if course_id:
            course = Course.objects.filter(course_id=course_id).first()
            if not course:
                return Response({'detail': 'Course not found.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            # Create new course
            course_code = (request.data.get('course_code') or '').strip().upper()
            course_title = (request.data.get('course_title') or '').strip()
            description = (request.data.get('description') or '').strip()

            if not course_code:
                return Response({'detail': 'Course code is required.'}, status=status.HTTP_400_BAD_REQUEST)
            if not course_title:
                return Response({'detail': 'Course title is required.'}, status=status.HTTP_400_BAD_REQUEST)

            institution = request.user.institution if normalize_role(request.user.role) == 'admin' else None
            if Course.objects.filter(course_code__iexact=course_code).exists():
                return Response(
                    {'detail': f"A course with code '{course_code}' already exists."},
                    status=status.HTTP_409_CONFLICT,
                )

            course = Course.objects.create(
                institution=institution,
                course_code=course_code,
                course_title=course_title,
                description=description or None,
            )
        # A section is handled by one faculty per course; the course itself is
        # shared between sections and between faculty who co-teach other blocks.
        conflict = CourseLoad.objects.select_related('faculty').filter(
            course=course, section=section,
        ).exclude(faculty=faculty).first()
        if conflict:
            holder = conflict.faculty.full_name or conflict.faculty.email
            return Response(
                {
                    'detail': (
                        f'{course.course_code} · {section.code} is already handled by {holder}. '
                        'A section can only be assigned to one faculty per course.'
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )

        # The syllabus has one author; everyone else on the course reads it.
        as_syllabus_owner = str(request.data.get('as_syllabus_owner')).lower() in ('1', 'true', 'yes', 'on')
        if as_syllabus_owner and course.syllabus_owner_id and course.syllabus_owner_id != faculty.user_id:
            holder = course.syllabus_owner
            holder_name = holder.full_name or holder.email
            return Response(
                {
                    'detail': (
                        f'The {course.course_code} syllabus is already maintained by {holder_name}. '
                        'Clear that assignment before assigning another faculty.'
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )

        seed_course_syllabi(course)

        # A handled section takes the course.
        section.taken_courses.add(course)
        assignment, created = CourseLoad.objects.get_or_create(
            course=course,
            faculty=faculty,
            section=section,
        )
        if as_syllabus_owner and course.syllabus_owner_id != faculty.user_id:
            course.syllabus_owner = faculty
            course.save(update_fields=['syllabus_owner'])
            AuditLog.objects.create(
                user=request.user,
                action_type="syllabus_owner_assigned",
                resource_type="Course",
                resource_id=course.course_id,
                details={
                    "faculty_id": str(faculty.user_id),
                    "faculty_email": faculty.email,
                    "course_code": course.course_code,
                },
            )
        AuditLog.objects.create(
            user=request.user,
            action_type="course_assigned",
            resource_type="CourseLoad",
            resource_id=assignment.assignment_id,
            details={
                "faculty_id": str(faculty.user_id),
                "faculty_email": faculty.email,
                "course_id": str(course.course_id),
                "course_code": course.course_code,
                "course_title": course.course_title,
                "section_id": str(section.section_id),
                "section": section.section_name,
            },
        )
        return Response({
            'assignment_id': str(assignment.assignment_id),
            'faculty_id': str(faculty.user_id),
            'course_id': str(course.course_id),
            'course_code': course.course_code,
            'course_title': course.course_title,
            'section_id': str(section.section_id),
            'section': section.section_name,
            'syllabus_owner_id': str(course.syllabus_owner_id) if course.syllabus_owner_id else None,
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def patch(self, request):
        """Set or clear the faculty member who authors this course's syllabus."""
        denied = self._require_admin(request)
        if denied:
            return denied

        course = Course.objects.filter(course_id=request.data.get('course_id')).first()
        if not course:
            return Response({'detail': 'Course not found.'}, status=status.HTTP_404_NOT_FOUND)
        if normalize_role(request.user.role) == 'admin' and course.institution_id != request.user.institution_id:
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)

        faculty_id = str(request.data.get('faculty_id') or '').strip()
        if not faculty_id:
            course.syllabus_owner = None
            course.save(update_fields=['syllabus_owner'])
            return Response({'success': True, 'course_id': str(course.course_id), 'syllabus_owner_id': None})

        faculty = UserProfile.objects.filter(user_id=faculty_id, role=UserRole.FACULTY).first()
        if not faculty:
            return Response({'detail': 'Faculty account not found.'}, status=status.HTTP_404_NOT_FOUND)
        if normalize_role(request.user.role) == 'admin' and faculty.institution_id != request.user.institution_id:
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        if not CourseLoad.objects.filter(course=course, faculty=faculty).exists():
            return Response(
                {'detail': 'Assign this faculty member to the course before making them its syllabus owner.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if course.syllabus_owner_id and course.syllabus_owner_id != faculty.user_id:
            holder = course.syllabus_owner
            holder_name = holder.full_name or holder.email
            return Response(
                {
                    'detail': (
                        f'The {course.course_code} syllabus is already maintained by {holder_name}. '
                        'Clear that assignment from that faculty first.'
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )

        course.syllabus_owner = faculty
        course.save(update_fields=['syllabus_owner'])
        AuditLog.objects.create(
            user=request.user,
            action_type="syllabus_owner_assigned",
            resource_type="Course",
            resource_id=course.course_id,
            details={
                "faculty_id": str(faculty.user_id),
                "faculty_email": faculty.email,
                "course_code": course.course_code,
            },
        )
        return Response({
            'success': True,
            'course_id': str(course.course_id),
            'syllabus_owner_id': str(faculty.user_id),
            'syllabus_owner_name': faculty.full_name or faculty.email,
        }, status=status.HTTP_200_OK)

    def delete(self, request):
        denied = self._require_admin(request)
        if denied:
            return denied

        raw_id = request.data.get('assignment_id')
        try:
            assignment_id = uuid.UUID(str(raw_id))
        except (AttributeError, TypeError, ValueError):
            return Response(
                {'detail': 'A valid assignment_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        assignment = CourseLoad.objects.select_related('faculty').filter(
            assignment_id=assignment_id,
        ).first()
        if not assignment:
            return Response({'detail': 'Assignment not found.'}, status=status.HTTP_404_NOT_FOUND)
        if (
            normalize_role(request.user.role) == 'admin'
            and assignment.faculty.institution_id != request.user.institution_id
        ):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)

        assignment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InstitutionCustomizationView(APIView):
    def _admin(self, request):
        return normalize_role(request.user.role) in {'admin', 'superadmin'}

    def get(self, request):
        if not self._admin(request) and normalize_role(request.user.role) != 'faculty':
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        institution = request.user.institution
        if not institution:
            return Response({
                'header_text': '',
                'footer_text': '',
                'syllabus_template_name': '',
                'syllabus_template_kind': '',
                'syllabus_template_url': '',
                'syllabus_sections': [],
                'syllabus_style_profile': {},
                'syllabus_field_map': {'sections': [], 'click_log': []},
                'syllabus_preview_blocks': [],
                'field_labels': {},
            })
        customization, _ = InstitutionCustomization.objects.get_or_create(institution=institution)
        # Every admin edits one shared format, even when their accounts
        # belong to different institutions. An empty institution takes that
        # format instead of starting a private copy.
        shared = canonical_syllabus_sections()
        if shared and customization.syllabus_sections != shared:
            customization.syllabus_sections = copy.deepcopy(shared)
            customization.save(update_fields=['syllabus_sections', 'updated_at'])
        elif not customization.syllabus_sections:
            customization.syllabus_sections = default_syllabus_sections()
            customization.save(update_fields=['syllabus_sections', 'updated_at'])
        has_file = bool(customization.syllabus_template)
        return Response({
            'header_image_url': customization.header_image_url,
            'footer_image_url': customization.footer_image_url,
            'header_text': customization.header_text,
            'footer_text': customization.footer_text,
            'syllabus_template_name': customization.syllabus_template_name,
            'syllabus_template_kind': customization.syllabus_template_kind or '',
            'syllabus_template_url': (
                '/api/users/institution-syllabus-template/file/' if has_file else ''
            ),
            'syllabus_sections': customization.syllabus_sections,
            'syllabus_style_profile': customization.syllabus_style_profile or {},
            'syllabus_field_map': customization.syllabus_field_map or {'sections': [], 'click_log': []},
            'syllabus_preview_blocks': customization.syllabus_preview_blocks or [],
            'field_labels': customization.field_labels,
        })

    def patch(self, request):
        # Any institution admin may fix or unfix fields and tables, and rename
        # sections. The saved format is then published to every institution.
        if normalize_role(request.user.role) != 'admin':
            return Response({'detail': 'Only institution admins can edit customization.'}, status=status.HTTP_403_FORBIDDEN)
        if not request.user.institution:
            return Response({'detail': 'Admin has no institution.'}, status=status.HTTP_400_BAD_REQUEST)
        customization, _ = InstitutionCustomization.objects.get_or_create(institution=request.user.institution)
        for field in (
            'header_image_url',
            'footer_image_url',
            'header_text',
            'footer_text',
            'syllabus_template_name',
            'syllabus_sections',
            'syllabus_style_profile',
            'syllabus_preview_blocks',
            'field_labels',
        ):
            if field in request.data:
                setattr(customization, field, request.data[field])
        if 'syllabus_field_map' in request.data:
            field_map = syllabus_template_doc.normalize_field_map(request.data.get('syllabus_field_map'))
            customization.syllabus_field_map = field_map
            # The syllabus format screen echoes the stored click map on every
            # save. Rebuilding sections from that map drops blueprint table
            # cells and fixed field content (Framework Mapping statements
            # vanish after Save table). Derive sections only when the client
            # is updating the map by itself.
            if 'syllabus_sections' not in request.data:
                customization.syllabus_sections = syllabus_template_doc.field_map_to_syllabus_sections(field_map)
        customization.save()
        publish_fixed_syllabus(customization.syllabus_sections)
        return self.get(request)


class SyllabusTemplatePreviewView(APIView):
    """
    Upload the exact syllabus sample (DOCX / PDF / Excel), store it as-is,
    and return native click targets for the real-document preview.
    """

    def post(self, request):
        if normalize_role(request.user.role) != 'admin':
            return Response({'detail': 'Only institution admins can upload a syllabus template.'}, status=status.HTTP_403_FORBIDDEN)
        if not request.user.institution:
            return Response({'detail': 'Admin has no institution.'}, status=status.HTTP_400_BAD_REQUEST)

        uploaded_file = request.FILES.get('file')
        if uploaded_file is None:
            return Response(
                {'detail': 'Choose a syllabus file (.docx, .pdf, or .xlsx).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_type = uploaded_file.name.rsplit('.', 1)[-1].lower()
        if file_type not in syllabus_template_doc.SUPPORTED_UPLOAD_TYPES:
            return Response(
                {'detail': 'Unsupported type. Upload a .docx, .pdf, or .xlsx syllabus sample.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        is_valid, error_message = DocumentProcessor.validate_file(uploaded_file, file_type)
        if not is_valid:
            return Response({'detail': error_message}, status=status.HTTP_400_BAD_REQUEST)

        try:
            uploaded_file.seek(0)
            built = syllabus_template_doc.build_exact_preview(uploaded_file, file_type)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception('Could not build syllabus preview for %s', uploaded_file.name)
            return Response(
                {'detail': 'Could not read that file. Try a .docx, .pdf, or .xlsx and upload again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        original_name = uploaded_file.name[:255]
        try:
            customization, _ = InstitutionCustomization.objects.get_or_create(institution=request.user.institution)
            customization.syllabus_template.save(original_name, ContentFile(built['original_bytes']), save=False)
            stem = original_name.rsplit('.', 1)[0][:200] or 'syllabus_template'
            customization.syllabus_working_docx.save(
                f'{stem}.docx',
                ContentFile(built['working_docx_bytes']),
                save=False,
            )
            customization.syllabus_template_name = original_name
            customization.syllabus_template_kind = built['kind']
            customization.syllabus_preview_blocks = built['blocks']
            customization.syllabus_field_map = {'sections': [], 'click_log': [], 'version': 1}
            customization.save(update_fields=[
                'syllabus_template', 'syllabus_working_docx', 'syllabus_template_name',
                'syllabus_template_kind', 'syllabus_preview_blocks', 'syllabus_field_map', 'updated_at',
            ])
        except Exception:
            logger.exception('Could not store syllabus template %s', uploaded_file.name)
            return Response(
                {'detail': 'Preview succeeded, but the file could not be stored. Try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        detail = (
            'Your exact file is shown on the left. Click any text to record a section, '
            'then click again to place where content should be written.'
        )
        return Response({
            'template_name': original_name,
            'file_type': built['kind'],
            'mime': built['mime'],
            'converted': False,
            'template_file_url': '/api/users/institution-syllabus-template/file/',
            'blocks': built['blocks'],
            'block_count': built['block_count'],
            'field_map': {'sections': [], 'click_log': [], 'version': 1},
            'detail': detail,
        })


class SyllabusTemplateFileView(APIView):
    """Serve the exact uploaded syllabus sample for the clickable preview."""

    def get(self, request):
        if normalize_role(request.user.role) not in {'admin', 'faculty'}:
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        if not request.user.institution:
            return Response({'detail': 'No institution.'}, status=status.HTTP_400_BAD_REQUEST)
        customization = InstitutionCustomization.objects.filter(institution=request.user.institution).first()
        if not customization or not customization.syllabus_template:
            return Response({'detail': 'No syllabus template uploaded.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            customization.syllabus_template.open('rb')
            data = customization.syllabus_template.read()
            customization.syllabus_template.close()
        except Exception:
            logger.exception('Could not read syllabus template file')
            return Response({'detail': 'Template file is missing.'}, status=status.HTTP_404_NOT_FOUND)

        kind = (customization.syllabus_template_kind or '').lower()
        if not kind and customization.syllabus_template_name:
            kind = customization.syllabus_template_name.rsplit('.', 1)[-1].lower()
        content_type = syllabus_template_doc.MIME_BY_KIND.get(kind, 'application/octet-stream')
        filename = customization.syllabus_template_name or f'template.{kind or "bin"}'
        response = HttpResponse(data, content_type=content_type)
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        response['Cache-Control'] = 'private, max-age=60'
        return response


class SyllabusTemplateAnalyzeView(APIView):
    """
    Legacy parser path (Docling/LiteParse). Prefer SyllabusTemplatePreviewView
    for the click-to-map DOCX editor.
    """

    def post(self, request):
        if normalize_role(request.user.role) != 'admin':
            return Response({'detail': 'Only institution admins can upload a syllabus template.'}, status=status.HTTP_403_FORBIDDEN)

        uploaded_file = request.FILES.get('file')
        if uploaded_file is None:
            return Response({'detail': 'Choose a PDF or DOCX file.'}, status=status.HTTP_400_BAD_REQUEST)

        file_type = uploaded_file.name.rsplit('.', 1)[-1].lower()
        is_valid, error_message = DocumentProcessor.validate_file(uploaded_file, file_type)
        if not is_valid:
            return Response({'detail': error_message}, status=status.HTTP_400_BAD_REQUEST)

        refine = request.data.get('refine', 'false')
        try:
            uploaded_file.seek(0)
            analysis = syllabus_pipeline.analyze_syllabus_template(
                uploaded_file, file_type, refine=refine,
            )
        except ValueError as exc:
            logger.warning('Syllabus template rejected %s: %s', uploaded_file.name, exc)
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.exception('Could not analyze syllabus template %s', uploaded_file.name)
            return Response(
                {'detail': f'The template could not be read ({exc.__class__.__name__}). Try a DOCX, or a smaller text-based PDF.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            uploaded_file.seek(0)
            customization, _ = InstitutionCustomization.objects.get_or_create(institution=request.user.institution)
            customization.syllabus_template.save(uploaded_file.name, uploaded_file, save=False)
            customization.syllabus_template_name = uploaded_file.name[:255]
            customization.syllabus_style_profile = analysis.get('style_profile') or {}
            branding = analysis.get('branding_suggestions') or {}
            if not customization.header_text and branding.get('header_text'):
                customization.header_text = str(branding['header_text'])[:500]
            if not customization.footer_text and branding.get('footer_text'):
                customization.footer_text = str(branding['footer_text'])[:500]
            if not customization.header_image_url and branding.get('header_image_url'):
                customization.header_image_url = branding['header_image_url']
            if not customization.footer_image_url and branding.get('footer_image_url'):
                customization.footer_image_url = branding['footer_image_url']
            customization.save(update_fields=[
                'syllabus_template', 'syllabus_template_name', 'syllabus_style_profile',
                'header_text', 'footer_text', 'header_image_url', 'footer_image_url', 'updated_at',
            ])
        except Exception:
            logger.exception('Could not store syllabus template %s', uploaded_file.name)
            return Response(
                {'detail': 'Template analysis succeeded, but the file could not be stored. Try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        branding = analysis.get('branding_suggestions') or {}
        payload = {
            'sections': analysis.get('sections') or [],
            'style_profile': analysis.get('style_profile') or {},
            'source': analysis.get('source'),
            'parser': analysis.get('parser'),
            'llm_provider': analysis.get('llm_provider'),
            'confidence': analysis.get('confidence') or {},
            'branding_suggestions': branding,
            'template_name': uploaded_file.name,
        }
        if analysis.get('detail'):
            payload['detail'] = analysis['detail']
        return Response(payload)


class EnrollCourseView(APIView):
    """Enroll the current student in a course by course_code."""

    def post(self, request):
        if normalize_role(request.user.role) != 'student':
            return Response({'detail': 'Only students can enroll in courses.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = EnrollCourseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        course_code = serializer.validated_data['course_code']

        course = Course.objects.filter(course_code__iexact=course_code).first()
        if not course:
            return Response({'detail': f'Course "{course_code}" not found.'}, status=status.HTTP_404_NOT_FOUND)

        student = request.user
        student_data, _ = StudentData.objects.get_or_create(user=student)
        courses = student_data.courses_enrolled or []

        already = any(c.get('course_id') == str(course.course_id) for c in courses)
        if already:
            return Response({
                'detail': f'Already enrolled in {course.course_code}.',
                'courses_enrolled': courses,
            })

        courses.append({
            'course_id': str(course.course_id),
            'course_code': course.course_code,
            'course_title': course.course_title,
        })

        student_data.courses_enrolled = courses
        student_data.save()

        return Response({
            'detail': f'Enrolled in {course.course_code} \u2014 {course.course_title}.',
            'courses_enrolled': courses,
        })


class UnenrollCourseView(APIView):
    """Unenroll the current student from a course."""

    def delete(self, request, course_id):
        if normalize_role(request.user.role) != 'student':
            return Response({'detail': 'Only students can unenroll from courses.'}, status=status.HTTP_403_FORBIDDEN)

        student = request.user
        student_data, _ = StudentData.objects.get_or_create(user=student)
        courses = student_data.courses_enrolled or []

        updated_courses = [c for c in courses if c.get('course_id') != course_id]

        if len(updated_courses) == len(courses):
            return Response({'detail': 'Not enrolled in this course.'}, status=status.HTTP_404_NOT_FOUND)

        student_data.courses_enrolled = updated_courses
        student_data.save()

        return Response({
            'detail': 'Unenrolled successfully.',
            'courses_enrolled': updated_courses,
        })


def _contact_client_ip(request):
    from apps.users.middleware import _client_ip
    return _client_ip(request)


def _contact_origin_allowed(request):
    """Accept a browser Origin for this site. A loopback Origin only counts from loopback."""
    from urllib.parse import urlparse

    origin = (request.META.get('HTTP_ORIGIN') or '').strip()
    peer = (request.META.get('REMOTE_ADDR') or '').strip()
    loopback_peer = peer in {'127.0.0.1', '::1'}
    if not origin:
        return loopback_peer
    host = (urlparse(origin).hostname or '').lower()
    if not host:
        return False
    if host in {'localhost', '127.0.0.1', '::1'}:
        return loopback_peer
    allowed = set()
    for item in getattr(settings, 'CORS_ALLOWED_ORIGINS', []) or []:
        allowed.add((urlparse(str(item)).hostname or '').lower())
    for item in getattr(settings, 'ALLOWED_HOSTS', []) or []:
        item = str(item).strip().lower()
        if item and item != '*':
            allowed.add(item.split(':')[0])
    allowed.discard('localhost')
    allowed.discard('127.0.0.1')
    allowed.discard('::1')
    return host in allowed


def _reserve_contact_mail(ip, email):
    """Fail closed. Caps one address, one IP, and the whole inbox."""
    from django.core.cache import cache

    checks = (
        (f'atlas:contact-mail:ip:{ip}', 5, 3600),
        (f'atlas:contact-mail:addr:{email}', 3, 86400),
        ('atlas:contact-mail:global', 30, 3600),
    )
    try:
        for key, limit, window in checks:
            if cache.add(key, 1, timeout=window):
                continue
            try:
                count = cache.incr(key)
            except ValueError:
                cache.set(key, 1, timeout=window)
                continue
            if count > limit:
                return False
        return True
    except Exception:
        logger.exception('Contact mail limit unavailable; refusing the send.')
        return False


class ContactFormView(APIView):
    """Public endpoint for the landing-page contact form.

    Validates the submission, emails the ATLAS inbox, and sends an automatic
    reply to the address on the form. The endpoint is unauthenticated.
    """

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        from django.utils import timezone as tz
        from .email_service import send_contact_confirmation, send_contact_notification

        content_type = (request.content_type or '').split(';', 1)[0].strip().lower()
        if content_type != 'application/json':
            return Response({'detail': 'Unsupported content type.'}, status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)

        if not _contact_origin_allowed(request):
            return Response(
                {'detail': 'This form cannot be submitted from that site.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ContactFormSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Same response as a real submit so the field is not useful as a probe.
        if data.get('leave_blank'):
            return Response(
                {'detail': 'Message received. Our team will get back to you within 24 hours.'},
                status=status.HTTP_201_CREATED,
            )

        if not _reserve_contact_mail(_contact_client_ip(request), data['email']):
            return Response(
                {'detail': 'Too many attempts. Please wait and try again.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        submitted_at = tz.now().strftime('%B %d, %Y at %I:%M %p UTC')

        try:
            notified = send_contact_notification(
                name=data['name'],
                email=data['email'],
                institution=data['institution'],
                message=data['message'],
                submitted_at=submitted_at,
            )
        except Exception:
            logger.exception('Failed to send contact notification for %s', data['email'])
            notified = False
        if not notified:
            return Response(
                {'detail': 'Could not send your message. Please try again or email us directly.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            send_contact_confirmation(name=data['name'], email=data['email'])
        except Exception:
            logger.exception('Failed to send contact confirmation to %s', data['email'])

        return Response(
            {
                'detail': 'Message received. Our team will get back to you within 24 hours.',
                'contact': {
                    'name': data['name'],
                    'email': data['email'],
                    'institution': data['institution'],
                    'submitted_at': submitted_at,
                },
            },
            status=status.HTTP_201_CREATED,
        )
