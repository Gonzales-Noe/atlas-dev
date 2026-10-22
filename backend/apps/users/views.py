import base64
import hashlib
import hmac
import json
import logging
import secrets
import uuid
from datetime import timedelta

import requests

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core import signing
from django.core.cache import cache
from django.db import transaction

from django.db.models import Count, Q, Value
from django.db.models.functions import Concat
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.integrations import syllabus_structure
from apps.integrations.document_processor import DocumentProcessor
from apps.integrations.models import Assessment, Course, CourseLoad, Institution, InstitutionCustomization, Section, StudentData, UserProfile, UserRole
from apps.integrations.trial import (
    PAID_PLAN_DAYS,
    TRIAL_FACULTY_LIMIT,
    TRIAL_SYLLABUS_GENERATION_LIMIT,
    institution_access_is_active,
    trial_is_active,
)

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


def _generate_otp():
    return f'{secrets.randbelow(10000):04d}'


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
        otp = None
        if profile:
            otp = _generate_otp()
            cache.set(_otp_cache_key(email), otp, timeout=600)
            # Send the branded OTP email through the shared email service so the
            # structure, logo and footer stay consistent with the rest of ATLAS.
            from .email_service import send_password_reset_otp
            send_password_reset_otp(
                email=email,
                otp=otp,
                user_name=profile.name or '',
            )

        response_payload = {'detail': 'If the account exists, a reset code has been generated.'}
        if settings.DEBUG and otp is not None:
            response_payload['debug_otp'] = otp
        return Response(response_payload)


class PasswordResetVerifyView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        otp = serializer.validated_data['otp']

        cached_otp = cache.get(_otp_cache_key(email))
        if not cached_otp or cached_otp != otp:
            return Response({'detail': 'Invalid or expired OTP.'}, status=status.HTTP_400_BAD_REQUEST)

        reset_token = signing.dumps({'email': email}, salt=PASSWORD_RESET_SALT)
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
        profile = UserProfile.objects.filter(email__iexact=email, is_active=True).first()
        if not profile:
            return Response({'detail': 'Account not found.'}, status=status.HTTP_404_NOT_FOUND)

        profile.password_hash = make_password(serializer.validated_data['new_password'])
        profile.save(update_fields=['password_hash'])
        cache.delete(_otp_cache_key(email))
        return Response({'detail': 'Password updated successfully.'})


class DashboardSummaryView(APIView):
    def get(self, request):
        role = normalize_role(request.user.role)
        if role == 'admin':
            return Response(self._admin_summary(request))
        if role == 'superadmin':
            return Response(self._superadmin_summary(request))
        if role == 'student':
            return Response(self._student_summary(request))
        return Response(self._faculty_summary(request))

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
        institution_count = Institution.objects.count()
        active_institutions = Institution.objects.filter(is_active=True).count()
        user_count = UserProfile.objects.count()
        pending_applications = Institution.objects.filter(application_status='pending_review').count()
        unpaid_institutions = Institution.objects.filter(payment_status__in=['unpaid', 'pending']).count()
        user_distribution = [
            {'name': 'Admins', 'value': UserProfile.objects.filter(role=UserRole.ADMIN).count()},
            {'name': 'Faculty', 'value': UserProfile.objects.filter(role=UserRole.FACULTY).count()},
            {'name': 'Super Admins', 'value': UserProfile.objects.filter(role=UserRole.SUPERADMIN).count()},
        ]
        institution_trend = [
            {'name': institution.created_at.strftime('%b'), 'institutions': index + 1, 'users': UserProfile.objects.filter(institution=institution).count()}
            for index, institution in enumerate(Institution.objects.order_by('created_at')[:12])
        ]
        payload = {
            'role': 'superadmin',
            'title': 'Super Admin Dashboard',
            'subtitle': 'Monitor the platform, institutions, and access policy.',
            'cards': [
                {'label': 'Institutions', 'value': institution_count, 'tone': 'superadmin'},
                {'label': 'Active institutions', 'value': active_institutions, 'tone': 'superadmin'},
                {'label': 'Users', 'value': user_count, 'tone': 'superadmin'},
                {'label': 'Pending applications', 'value': pending_applications, 'tone': 'superadmin'},
                {'label': 'Unpaid institutions', 'value': unpaid_institutions, 'tone': 'superadmin'},
            ],
            'nav_items': [
                {'label': 'Dashboard', 'to': '/superadmin/dashboard'},
                {'label': 'Accounts', 'to': '/superadmin/account-management'},
                {'label': 'Audit Logs', 'to': '/superadmin/audit-logs'},
            ],
            'recent': [
                {'label': institution.name, 'value': institution.plan_tier, 'detail': 'Institution'}
                for institution in Institution.objects.order_by('-created_at')[:5]
            ],
            'user_distribution': user_distribution,
            'institution_trend': institution_trend,
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
        if 'is_active' in request.data:
            institution.is_active = bool(request.data['is_active'])
            institution.application_status = 'active' if institution.is_active else 'rejected'

        institution.save(update_fields=['application_status', 'subscription_status', 'payment_status', 'is_active', 'reviewed_at', 'selected_plan', 'name'])
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

        try:
            result = delete_institution(institution)
        except AccountDeletionError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_409_CONFLICT)
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

        if 'email' in request.data:
            target.email = request.data['email'].strip().lower()

        target.save()
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

        try:
            result = delete_user_account(target)
        except AccountDeletionError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_409_CONFLICT)
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

        assignments = CourseLoad.objects.select_related('course', 'faculty', 'section').filter(
            faculty__in=faculty_queryset,
        ).order_by('faculty__email', 'course__course_code')
        sections = Section.objects.order_by('code')
        if role == 'admin':
            sections = sections.filter(
                Q(institution=request.user.institution)
                | Q(program__institution=request.user.institution)
                | Q(institution__isnull=True, program__isnull=True)
            )

        course_queryset = Course.objects.order_by('course_code')
        if role == 'admin' and request.user.institution_id:
            course_queryset = course_queryset.filter(institution=request.user.institution)

        course_queryset = course_queryset.select_related('section')
        return Response({
            'faculty': [UserAccountSerializer(profile).data for profile in faculty_queryset.order_by('email')],
            'courses': [
                {
                    'course_id': str(course.course_id),
                    'course_code': course.course_code,
                    'course_title': course.course_title,
                    'section': course.section.code if course.section_id else '',
                    'category': course.category,
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

        # A handled section takes the course.
        section.taken_courses.add(course)
        assignment, created = CourseLoad.objects.get_or_create(
            course=course,
            faculty=faculty,
            section=section,
        )
        return Response({
            'assignment_id': str(assignment.assignment_id),
            'faculty_id': str(faculty.user_id),
            'course_id': str(course.course_id),
            'course_code': course.course_code,
            'course_title': course.course_title,
            'section_id': str(section.section_id),
            'section': section.section_name,
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

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
                'syllabus_sections': [],
                'field_labels': {},
            })
        customization, _ = InstitutionCustomization.objects.get_or_create(institution=institution)
        return Response({
            'header_image_url': customization.header_image_url,
            'footer_image_url': customization.footer_image_url,
            'header_text': customization.header_text,
            'footer_text': customization.footer_text,
            'syllabus_template_name': customization.syllabus_template_name,
            'syllabus_sections': customization.syllabus_sections,
            'field_labels': customization.field_labels,
        })

    def patch(self, request):
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
            'field_labels',
        ):
            if field in request.data:
                setattr(customization, field, request.data[field])
        customization.save()
        return self.get(request)


class SyllabusTemplateAnalyzeView(APIView):
    """
    Derive the syllabus form structure (sections, subsections and table
    columns) from a PDF or DOCX syllabus template for the admin to review.
    Pass refine=false to skip the LLM cleanup and use the heading outline only.
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

        try:
            markdown = syllabus_structure.markdown_from_upload(uploaded_file, file_type)
        except Exception:
            logger.exception('Could not extract text from syllabus template %s', uploaded_file.name)
            return Response({'detail': 'The template could not be read. Try another PDF or DOCX file.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            uploaded_file.seek(0)
            customization, _ = InstitutionCustomization.objects.get_or_create(institution=request.user.institution)
            customization.syllabus_template.save(uploaded_file.name, uploaded_file, save=False)
            customization.syllabus_template_name = uploaded_file.name[:255]
            customization.save(update_fields=['syllabus_template', 'syllabus_template_name', 'updated_at'])
        except Exception:
            logger.exception('Could not store syllabus template %s', uploaded_file.name)
            return Response(
                {'detail': 'Template analysis succeeded, but the file could not be stored. Try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        refine = str(request.data.get('refine', 'true')).lower() not in {'0', 'false', 'no'}
        sections, source = syllabus_structure.extract_syllabus_structure(markdown, refine=refine)

        if not sections:
            return Response({
                'detail': 'No section headings were detected. Add the syllabus sections manually.',
                'sections': [],
                'source': source,
                'template_name': uploaded_file.name,
            })

        return Response({
            'sections': sections,
            'source': source,
            'template_name': uploaded_file.name,
        })


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


class ContactFormView(APIView):
    """Public endpoint for the landing-page contact form.

    Validates the submission, emails a branded notification to the ATLAS
    support team, and sends a branded confirmation back to the user. The
    endpoint is intentionally unauthenticated — anyone can reach out.
    """

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        from django.utils import timezone as tz
        from .email_service import send_contact_confirmation, send_contact_notification

        serializer = ContactFormSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        submitted_at = tz.now().strftime('%B %d, %Y at %I:%M %p UTC')

        # Notify the ATLAS team (best-effort; never fail the submission).
        try:
            send_contact_notification(
                name=data['name'],
                email=data['email'],
                institution=data['institution'],
                message=data['message'],
                submitted_at=submitted_at,
            )
        except Exception:
            logger.exception('Failed to send contact notification for %s', data['email'])

        # Send a confirmation back to the user (best-effort).
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
