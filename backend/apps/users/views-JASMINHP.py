import secrets

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core import signing
from django.core.cache import cache
from django.db import transaction
from django.core.mail import send_mail
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.integrations.models import Assessment, Course, CourseLoad, Institution, UserProfile, UserRole

from .serializers import (
    PASSWORD_RESET_CACHE_PREFIX,
    PASSWORD_RESET_SALT,
    DashboardSummarySerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    PasswordResetVerifySerializer,
    RegisterSerializer,
    UserAccountSerializer,
    UserProfileSerializer,
    UserProfileTokenObtainPairSerializer,
    normalize_role,
)


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
    return role_value


class AuthTokenView(TokenObtainPairView):
    permission_classes = [permissions.AllowAny]
    serializer_class = UserProfileTokenObtainPairSerializer


class AuthTokenRefreshView(TokenRefreshView):
    permission_classes = [permissions.AllowAny]


class MeView(APIView):
    def get(self, request):
        return Response(UserProfileSerializer(request.user).data)


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
                'user': UserProfileSerializer(profile).data,
            },
            status=status.HTTP_201_CREATED,
        )


class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        profile = UserProfile.objects.filter(email__iexact=email, is_active=True).first()
        if profile:
            otp = _generate_otp()
            cache.set(_otp_cache_key(email), otp, timeout=600)
            send_mail(
                subject='ATLAS password reset code',
                message=(
                    f'Your ATLAS password reset code is {otp}.\n\n'
                    'This code expires in 10 minutes.'
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=False,
            )
        else:
            otp = None

        response_payload = {'detail': 'If the account exists, a reset code has been generated.'}
        if settings.DEBUG and otp is not None:
            response_payload['debug_otp'] = otp
        return Response(response_payload)


class PasswordResetVerifyView(APIView):
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
        return Response(self._faculty_summary(request))

    def _faculty_summary(self, request):
        faculty = request.user
        assignments = CourseLoad.objects.select_related('course').filter(faculty=faculty)
        course_count = assignments.count()
        course_ids = assignments.values_list('course_id', flat=True)
        assessment_count = Assessment.objects.filter(course_id__in=course_ids).count()
        courses = [
            {
                'course_id': str(assignment.course.course_id),
                'course_code': assignment.course.course_code,
                'course_title': assignment.course.course_title,
            }
            for assignment in assignments[:5]
        ]
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

    def _superadmin_summary(self, request):
        institution_count = Institution.objects.count()
        active_institutions = Institution.objects.filter(is_active=True).count()
        user_count = UserProfile.objects.count()
        payload = {
            'role': 'superadmin',
            'title': 'Super Admin Dashboard',
            'subtitle': 'Monitor the platform, institutions, and access policy.',
            'cards': [
                {'label': 'Institutions', 'value': institution_count, 'tone': 'superadmin'},
                {'label': 'Active institutions', 'value': active_institutions, 'tone': 'superadmin'},
                {'label': 'Users', 'value': user_count, 'tone': 'superadmin'},
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


class AccountDetailView(APIView):
    def patch(self, request, user_id):
        role = normalize_role(request.user.role)
        if role not in {'admin', 'superadmin'}:
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)

        target = UserProfile.objects.select_related('institution').filter(user_id=user_id).first()
        if not target:
            return Response({'detail': 'Account not found.'}, status=status.HTTP_404_NOT_FOUND)

        if role == 'admin' and target.institution_id != getattr(request.user, 'institution_id', None):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)

        if 'role' in request.data:
            role_value = _to_database_role(request.data['role'])
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