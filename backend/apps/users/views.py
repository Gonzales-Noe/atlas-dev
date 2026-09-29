import secrets
import uuid

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core import signing
from django.core.cache import cache
from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from django.core.mail import send_mail
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.integrations.models import Assessment, College, Course, CourseLoad, Institution, InstitutionCustomization, StudentData, UserProfile, UserRole

from .serializers import (
    PASSWORD_RESET_CACHE_PREFIX,
    PASSWORD_RESET_SALT,
    DashboardSummarySerializer,
    EnrollCourseSerializer,
    FacultyCreateSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    PasswordResetVerifySerializer,
    RegisterSerializer,
    StudentDetailsUpdateSerializer,
    UserAccountSerializer,
    UserProfileSerializer,
    UserProfileTokenObtainPairSerializer,
    UserProfileTokenRefreshSerializer,
    normalize_role,
    tokens_for_profile,
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
        serializer = StudentDetailsUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        if 'courses_enrolled' in serializer.validated_data:
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
        if profile:
            otp = _generate_otp()
            cache.set(_otp_cache_key(email), otp, timeout=600)
            try:
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
            except Exception:
                pass
        else:
            otp = None

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


class AccountDetailView(APIView):
    def patch(self, request, user_id):
        role = normalize_role(request.user.role)
        if role not in {'admin', 'superadmin'}:
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)

        target = UserProfile.objects.select_related('institution', 'college').filter(user_id=user_id).first()
        if not target:
            return Response({'detail': 'Account not found.'}, status=status.HTTP_404_NOT_FOUND)

        if role == 'admin' and target.institution_id != getattr(request.user, 'institution_id', None):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)

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

        if 'college_id' in request.data:
            college_id = request.data['college_id']
            if college_id:
                college = College.objects.filter(college_id=college_id, institution=target.institution).first()
                if not college:
                    return Response({'detail': 'College not found in your institution.'}, status=status.HTTP_400_BAD_REQUEST)
                target.college = college
            else:
                target.college = None

        target.save()
        return Response(UserAccountSerializer(target).data)


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
        faculty_queryset = UserProfile.objects.select_related('institution', 'college').filter(role=UserRole.FACULTY)
        if role == 'admin':
            faculty_queryset = faculty_queryset.filter(institution=request.user.institution)

        assignments = CourseLoad.objects.select_related('course', 'faculty').filter(
            faculty__in=faculty_queryset,
        ).order_by('faculty__email', 'course__course_code')

        # Get colleges for the institution
        college_queryset = College.objects.none()
        if role == 'admin' and request.user.institution_id:
            college_queryset = College.objects.filter(institution=request.user.institution, is_active=True).order_by('name')
        elif role == 'superadmin':
            college_queryset = College.objects.filter(is_active=True).order_by('institution__name', 'name')

        course_queryset = Course.objects.order_by('course_code')
        if role == 'admin' and request.user.institution_id:
            course_queryset = course_queryset.filter(institution=request.user.institution)

        # Optional college filtering for courses
        college_id = request.query_params.get('college_id')
        if college_id:
            course_queryset = course_queryset.filter(program__college_id=college_id)

        course_queryset = course_queryset.select_related('program', 'program__college', 'section')
        return Response({
            'faculty': [UserAccountSerializer(profile).data for profile in faculty_queryset.order_by('email')],
            'colleges': [
                {
                    'college_id': str(college.college_id),
                    'code': college.code,
                    'name': college.name,
                    'institution_name': college.institution.name if college.institution_id else '',
                }
                for college in college_queryset
            ],
            'courses': [
                {
                    'course_id': str(course.course_id),
                    'course_code': course.course_code,
                    'course_title': course.course_title,
                    'program_name': course.program.name if course.program_id else '',
                    'college_name': course.program.college.name if course.program_id and course.program.college_id else '',
                    'college_code': course.program.college.code if course.program_id and course.program.college_id else '',
                    'section': (
                        f'{course.program.code} {course.section.code}'
                        if course.program_id and course.section_id else ''
                    ),
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
                    'section': assignment.section,
                }
                for assignment in assignments
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

        section = str(request.data.get('section') or '').strip()
        if not section:
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

        assignment, created = CourseLoad.objects.update_or_create(
            course=course,
            faculty=faculty,
            section=section,
            defaults={'section': section},
        )
        return Response({
            'assignment_id': str(assignment.assignment_id),
            'faculty_id': str(faculty.user_id),
            'course_id': str(course.course_id),
            'course_code': course.course_code,
            'course_title': course.course_title,
            'section': assignment.section,
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
        if not self._admin(request):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        institution = request.user.institution
        if not institution:
            return Response({'header_text': '', 'footer_text': '', 'syllabus_sections': [], 'field_labels': {}})
        customization, _ = InstitutionCustomization.objects.get_or_create(institution=institution)
        return Response({
            'header_image_url': customization.header_image_url,
            'footer_image_url': customization.footer_image_url,
            'header_text': customization.header_text,
            'footer_text': customization.footer_text,
            'syllabus_sections': customization.syllabus_sections,
            'field_labels': customization.field_labels,
        })

    def patch(self, request):
        if normalize_role(request.user.role) != 'admin':
            return Response({'detail': 'Only institution admins can edit customization.'}, status=status.HTTP_403_FORBIDDEN)
        if not request.user.institution:
            return Response({'detail': 'Admin has no institution.'}, status=status.HTTP_400_BAD_REQUEST)
        customization, _ = InstitutionCustomization.objects.get_or_create(institution=request.user.institution)
        for field in ('header_image_url', 'footer_image_url', 'header_text', 'footer_text', 'syllabus_sections', 'field_labels'):
            if field in request.data:
                setattr(customization, field, request.data[field])
        customization.save()
        return self.get(request)


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
