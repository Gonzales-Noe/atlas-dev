import re

from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.core import signing
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken

from apps.integrations.models import (
    Course,
    CourseLoad,
    Institution,
    PaymentStatusEnum,
    Section,
    SubscriptionStatusEnum,
    UserProfile,
    UserRole,
)
from apps.integrations.fixed_syllabus import attach_shared_syllabus_format, seed_course_syllabi
from apps.users.otp import OTP_ALPHABET, OTP_LENGTH, normalize_otp
from apps.integrations.trial import (
    TRIAL_FACULTY_LIMIT,
    institution_access_is_active,
    trial_expiry,
    trial_is_active,
)


ROLE_DASHBOARD_MAP = {
    UserRole.FACULTY: '/faculty/dashboard',
    UserRole.ADMIN: '/admin/dashboard',
    UserRole.SUPERADMIN: '/superadmin/dashboard',
}

PASSWORD_RESET_SALT = 'atlas.password-reset'
PASSWORD_RESET_CACHE_PREFIX = 'atlas:password-reset:'


def enforce_password_strength(password, *, email='', full_name=''):
    """Apply Django's password validators to ATLAS's custom password_hash field."""

    class _SimilarityUser:
        def __init__(self):
            self.email = email or ''
            self.username = email or ''
            self.first_name = full_name or ''
            self.last_name = ''

    try:
        validate_password(password, user=_SimilarityUser())
    except DjangoValidationError as exc:
        raise serializers.ValidationError(list(exc.messages)) from exc


def normalize_role(role):
    if role in {UserRole.SUPERADMIN, 'super_admin', 'superadmin'}:
        return 'superadmin'
    if role == UserRole.ADMIN:
        return 'admin'
    if role == UserRole.STUDENT:
        return 'student'
    return 'faculty'


class UserProfileSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    role_code = serializers.CharField(source='role', read_only=True)
    name = serializers.CharField(read_only=True)
    institution_name = serializers.CharField(source='institution.name', read_only=True, allow_null=True)
    dashboard_path = serializers.SerializerMethodField()
    institution_application_status = serializers.CharField(source='institution.application_status', read_only=True, allow_null=True)
    institution_payment_status = serializers.CharField(source='institution.payment_status', read_only=True, allow_null=True)
    institution_subscription_status = serializers.CharField(source='institution.subscription_status', read_only=True, allow_null=True)
    institution_trial_started_at = serializers.DateTimeField(source='institution.trial_started_at', read_only=True, allow_null=True)
    institution_trial_ends_at = serializers.DateTimeField(source='institution.trial_ends_at', read_only=True, allow_null=True)
    institution_subscription_ends_at = serializers.DateTimeField(source='institution.subscription_ends_at', read_only=True, allow_null=True)
    institution_access_active = serializers.SerializerMethodField()
    setup_completed = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = [
            'user_id',
            'email',
            'full_name',
            'name',
            'role',
            'role_code',
            'institution_name',
            'dashboard_path',
            'institution_application_status',
            'institution_payment_status',
            'institution_subscription_status',
            'institution_trial_started_at',
            'institution_trial_ends_at',
            'institution_subscription_ends_at',
            'institution_access_active',
            'trial_generation_count',
            'setup_completed',
            'is_active',
            'created_at',
            'picture_url',
        ]

    def get_setup_completed(self, obj):
        return bool(obj.institution_id and obj.institution.setup_completed)

    def get_institution_access_active(self, obj):
        return institution_access_is_active(obj.institution, timezone.now())

    def get_role(self, obj):
        return normalize_role(obj.role)

    def get_dashboard_path(self, obj):
        return ROLE_DASHBOARD_MAP.get(obj.role, ROLE_DASHBOARD_MAP[UserRole.FACULTY])


class UserProfileTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = 'email'
    email = serializers.EmailField(write_only=True)
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        email = attrs.get('email', '').strip().lower()
        password = attrs.get('password', '')

        profile = UserProfile.objects.select_related('institution').filter(email__iexact=email, is_active=True).first()
        if not profile or not check_password(password, profile.password_hash):
            raise serializers.ValidationError({'detail': 'Invalid email or password.'})
        if profile.role == UserRole.STUDENT:
            raise serializers.ValidationError({
                'detail': 'Student accounts are no longer supported. ATLAS is for faculty and administrators.',
            })

        return tokens_for_profile(profile)


def tokens_for_profile(profile):
    refresh = RefreshToken.for_user(profile)
    refresh['role'] = normalize_role(profile.role)
    refresh['email'] = profile.email
    if profile.institution_id:
        refresh['institution_id'] = str(profile.institution_id)

    return {
        'refresh': str(refresh),
        'access': str(refresh.access_token),
        'user': UserProfileSerializer(profile).data,
        'user_exists': True,
    }


class UserProfileTokenRefreshSerializer(TokenRefreshSerializer):
    """Refresh tokens issued for UserProfile (not Django's auth.User)."""

    def validate(self, attrs):
        refresh = self.token_class(attrs['refresh'])

        user_id = refresh.payload.get(api_settings.USER_ID_CLAIM, None)
        if user_id is not None:
            try:
                profile = UserProfile.objects.get(user_id=user_id)
            except UserProfile.DoesNotExist as exc:
                raise AuthenticationFailed(
                    'No active account found with the given credentials.',
                    'no_active_account',
                ) from exc

            if not profile.is_active:
                raise AuthenticationFailed(
                    'No active account found with the given credentials.',
                    'no_active_account',
                )

        data = {'access': str(refresh.access_token)}

        if api_settings.ROTATE_REFRESH_TOKENS:
            if api_settings.BLACKLIST_AFTER_ROTATION:
                try:
                    refresh.blacklist()
                except AttributeError:
                    pass

            refresh.set_jti()
            refresh.set_exp()
            refresh.set_iat()
            refresh.outstand()

            data['refresh'] = str(refresh)

        return data


class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255, allow_blank=True, required=False)
    email = serializers.EmailField()
    institution_name = serializers.CharField(max_length=255)
    selected_plan = serializers.CharField(max_length=50, required=False, allow_blank=True)
    password = serializers.CharField(min_length=8, write_only=True, trim_whitespace=False)
    role = serializers.CharField(required=False, default=UserRole.FACULTY)

    def validate_email(self, value):
        normalized = value.strip().lower()
        if UserProfile.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return normalized

    def validate_institution_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError('Institution name is required.')
        # Never attach a new signup to a school that already exists.
        if Institution.objects.filter(name__iexact=name).exists():
            raise serializers.ValidationError(
                'An institution with this name already exists. Ask your administrator for an account.'
            )
        return name

    def validate(self, attrs):
        try:
            enforce_password_strength(
                attrs.get('password', ''),
                email=attrs.get('email', ''),
                full_name=attrs.get('full_name', ''),
            )
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({'password': exc.detail}) from exc
        return attrs

    def validate_role(self, value):
        if value in {UserRole.STUDENT, 'student'}:
            raise serializers.ValidationError(
                'Student accounts are not supported. Register as faculty.'
            )
        # Public signup creates the institution's first administrator.
        return UserRole.ADMIN

    def validate_selected_plan(self, value):
        selected_plan = value.strip()
        if selected_plan and selected_plan not in {'Starter', 'Professional'}:
            raise serializers.ValidationError('Choose a currently available plan.')
        return selected_plan

    @transaction.atomic
    def create(self, validated_data):
        institution_name = validated_data.pop('institution_name').strip()
        selected_plan = validated_data.pop('selected_plan', '').strip()
        role = validated_data.pop('role', UserRole.ADMIN)
        password = validated_data.pop('password')
        full_name = validated_data.pop('full_name', '').strip()
        trial_started_at, trial_ends_at = trial_expiry()

        if Institution.objects.filter(name__iexact=institution_name).exists():
            raise serializers.ValidationError({
                'institution_name': (
                    'An institution with this name already exists. '
                    'Ask your administrator for an account.'
                ),
            })

        institution = Institution.objects.create(
            name=institution_name,
            plan_tier='free',
            subscription_status=SubscriptionStatusEnum.TRIALING,
            application_status='active',
            payment_status=PaymentStatusEnum.UNPAID,
            selected_plan=selected_plan,
            is_active=True,
            trial_started_at=trial_started_at,
            trial_ends_at=trial_ends_at,
        )

        attach_shared_syllabus_format(institution)

        return UserProfile.objects.create(
            institution=institution,
            email=validated_data['email'],
            full_name=full_name,
            password_hash=make_password(password),
            role=role,
            is_active=True,
        )


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class PasswordResetVerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField(max_length=16)

    def validate_email(self, value):
        return value.strip().lower()

    def validate_otp(self, value):
        normalized = normalize_otp(value)
        if len(normalized) != OTP_LENGTH or any(char not in OTP_ALPHABET for char in normalized):
            raise serializers.ValidationError('Enter the 8-character code from the email.')
        return normalized


class PasswordResetConfirmSerializer(serializers.Serializer):
    reset_token = serializers.CharField()
    new_password = serializers.CharField(min_length=8, write_only=True, trim_whitespace=False)

    def validate_new_password(self, value):
        enforce_password_strength(value)
        return value


class UserAccountSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    institution_name = serializers.CharField(source='institution.name', read_only=True, allow_null=True)
    dashboard_path = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = [
            'user_id',
            'email',
            'full_name',
            'role',
            'role_code',
            'institution_name',
            'dashboard_path',
            'is_active',
            'created_at',
        ]
        read_only_fields = ['user_id', 'full_name', 'created_at']

    role_code = serializers.CharField(source='role', read_only=True)

    def get_role(self, obj):
        return normalize_role(obj.role)

    def get_dashboard_path(self, obj):
        return ROLE_DASHBOARD_MAP.get(obj.role, ROLE_DASHBOARD_MAP[UserRole.FACULTY])

    def update(self, instance, validated_data):
        role = validated_data.get('role')
        if role:
            instance.role = role
        if 'email' in validated_data:
            instance.email = validated_data['email']
        if 'is_active' in validated_data:
            instance.is_active = validated_data['is_active']
        institution = validated_data.get('institution')
        if institution is not None:
            instance.institution = institution
        instance.save()
        return instance


class DashboardSummarySerializer(serializers.Serializer):
    role = serializers.CharField()
    title = serializers.CharField()
    subtitle = serializers.CharField()
    cards = serializers.ListField(child=serializers.DictField())
    nav_items = serializers.ListField(child=serializers.DictField())
    recent = serializers.ListField(child=serializers.DictField())


class EnrollCourseSerializer(serializers.Serializer):
    course_code = serializers.CharField(max_length=100)

    def validate_course_code(self, value):
        return value.strip().upper()


class FacultyCreateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8, write_only=True, trim_whitespace=False)
    assignments = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        default=list,
        write_only=True,
    )

    def validate_email(self, value):
        normalized = value.strip().lower()
        if UserProfile.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return normalized

    def validate(self, attrs):
        try:
            enforce_password_strength(
                attrs.get('password', ''),
                email=attrs.get('email', ''),
                full_name=attrs.get('full_name', ''),
            )
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({'password': exc.detail}) from exc
        return super().validate(attrs)

    @staticmethod
    def _get_assignment_section(institution, section_code):
        section = Section.objects.filter(
            institution=institution,
            code__iexact=section_code,
        ).first()
        if section is None:
            section = Section.objects.create(
                institution=institution,
                code=section_code,
            )
        return section

    def validate_assignments(self, assignments):
        request = self.context.get('request')
        institution = getattr(getattr(request, 'user', None), 'institution', None)
        if institution is None:
            raise serializers.ValidationError('Admin user has no associated institution.')

        validated = []
        for index, assignment in enumerate(assignments):
            section = str(assignment.get('section') or '').strip()
            raw_courses = assignment.get('courses')
            if raw_courses is None:
                raw_courses = []
            if not isinstance(raw_courses, list):
                raise serializers.ValidationError({index: {'courses': 'Courses must be a list.'}})

            normalized_courses = []
            for course_index, course_data in enumerate(raw_courses):
                course_id = course_data.get('course_id')
                code = str(course_data.get('course_code') or '').strip().upper()
                title = str(course_data.get('course_title') or '').strip()
                description = str(course_data.get('description') or '').strip()

                if not course_id and not code and not title:
                    continue

                if course_id:
                    course = Course.objects.filter(
                        course_id=course_id,
                        institution=institution,
                    ).first()
                    if course is None:
                        raise serializers.ValidationError({
                            index: {'courses': {course_index: 'Course not found in your institution.'}},
                        })
                    normalized_courses.append({'course_id': course.course_id})
                    continue

                if not code or not title:
                    raise serializers.ValidationError({
                        index: {'courses': {course_index: 'Course code and title are required.'}},
                    })
                normalized_courses.append({
                    'course_code': code,
                    'course_title': title,
                    'description': description,
                })

            if normalized_courses and not section:
                raise serializers.ValidationError({
                    index: {'section': 'Section is required when adding courses.'},
                })
            if not section or not normalized_courses:
                # Sections and courses are optional: a faculty member can be
                # created first and assigned later.
                continue

            validated.append({'section': section, 'courses': normalized_courses})
        return validated

    @transaction.atomic
    def create(self, validated_data):
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError('Authentication required.')

        admin_user = request.user
        institution = admin_user.institution
        if not institution:
            raise serializers.ValidationError('Admin user has no associated institution.')
        if institution.subscription_status == SubscriptionStatusEnum.TRIALING:
            institution = Institution.objects.select_for_update().get(pk=institution.pk)
            if not trial_is_active(institution):
                raise serializers.ValidationError(
                    'The free trial has ended. Choose a paid plan before adding faculty.'
                )
            faculty_count = UserProfile.objects.filter(
                institution=institution,
                role=UserRole.FACULTY,
                is_active=True,
            ).count()
            if faculty_count >= TRIAL_FACULTY_LIMIT:
                raise serializers.ValidationError(
                    f'The free trial includes up to {TRIAL_FACULTY_LIMIT} faculty accounts.'
                )

        password = validated_data.pop('password')
        full_name = validated_data.pop('full_name', '').strip()
        assignments = validated_data.pop('assignments', [])

        profile = UserProfile.objects.create(
            institution=institution,
            email=validated_data['email'],
            full_name=full_name,
            password_hash=make_password(password),
            role=UserRole.FACULTY,
            is_active=True,
        )
        for assignment in assignments:
            section = self._get_assignment_section(institution, assignment['section'])
            for course_data in assignment['courses']:
                if 'course_id' in course_data:
                    course = Course.objects.get(
                        course_id=course_data['course_id'],
                        institution=institution,
                    )
                else:
                    course = Course.objects.filter(
                        institution=institution,
                        course_code__iexact=course_data['course_code'],
                    ).first()
                    if course is None:
                        course = Course.objects.create(
                            institution=institution,
                            course_code=course_data['course_code'],
                            course_title=course_data['course_title'],
                            description=course_data['description'] or None,
                        )
                    if course.course_title != course_data['course_title']:
                        raise serializers.ValidationError(
                            {'assignments': f"Course code {course.course_code} already exists with a different title."}
                        )
                CourseLoad.objects.get_or_create(
                    course=course,
                    faculty=profile,
                    section=section,
                )
                seed_course_syllabi(course)
        return profile


class StudentDetailsUpdateSerializer(serializers.Serializer):
    courses_enrolled = serializers.JSONField(required=False)


_CONTACT_TAG = re.compile(r'<[^>]*>')
_CONTACT_CONTROL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')


def _contact_single_line(value, max_len, label):
    value = _CONTACT_TAG.sub('', value or '')
    value = _CONTACT_CONTROL.sub('', value).replace('\r', ' ').replace('\n', ' ')
    value = re.sub(r'\s+', ' ', value).strip()
    if not value:
        raise serializers.ValidationError(f'{label} is required.')
    if len(value) > max_len:
        raise serializers.ValidationError(f'{label} is too long.')
    return value


class ContactFormSerializer(serializers.Serializer):
    """Validates the public contact form submitted from the landing page."""
    name = serializers.CharField(max_length=120)
    email = serializers.EmailField(max_length=254)
    institution = serializers.CharField(max_length=200)
    message = serializers.CharField(max_length=2000)
    # Honeypot. Browsers leave it empty; a filled value is discarded before mail is sent.
    leave_blank = serializers.CharField(required=False, allow_blank=True, max_length=200)

    def validate_name(self, value):
        return _contact_single_line(value, 120, 'Name')

    def validate_institution(self, value):
        return _contact_single_line(value, 200, 'Institution')

    def validate_email(self, value):
        value = (value or '').strip().lower()
        if any(char in value for char in '\r\n\x00'):
            raise serializers.ValidationError('Enter a valid email address.')
        return value

    def validate_message(self, value):
        value = _CONTACT_TAG.sub('', value or '')
        value = _CONTACT_CONTROL.sub('', value).replace('\r\n', '\n').replace('\r', '\n').strip()
        value = re.sub(r'\n{4,}', '\n\n\n', value)
        if not value:
            raise serializers.ValidationError('Message is required.')
        if len(value) > 2000:
            raise serializers.ValidationError('Message is too long.')
        if len(re.findall(r'https?://', value, flags=re.IGNORECASE)) > 5:
            raise serializers.ValidationError('Message has too many links.')
        return value

    def validate_leave_blank(self, value):
        return (value or '').strip()[:200]


class ProfileSettingsUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255, required=False, allow_blank=False)
    picture_url = serializers.URLField(max_length=500, required=False, allow_blank=True, allow_null=True)
    current_password = serializers.CharField(required=False, write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(required=False, write_only=True, min_length=8, trim_whitespace=False)

    def validate_full_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Display name cannot be blank.')
        return value

    def validate(self, attrs):
        has_current_password = 'current_password' in attrs
        has_new_password = 'new_password' in attrs
        if has_current_password != has_new_password:
            raise serializers.ValidationError({
                'new_password': 'Enter both your current and new password to change your password.',
            })

        if has_new_password:
            user = self.instance
            if not check_password(attrs['current_password'], user.password_hash):
                raise serializers.ValidationError({
                    'current_password': 'Current password is incorrect.',
                })
            try:
                enforce_password_strength(
                    attrs['new_password'],
                    email=getattr(user, 'email', ''),
                    full_name=getattr(user, 'full_name', ''),
                )
            except serializers.ValidationError as exc:
                raise serializers.ValidationError({'new_password': exc.detail}) from exc

        return attrs

    def update(self, instance, validated_data):
        update_fields = []
        if 'full_name' in validated_data:
            instance.full_name = validated_data['full_name']
            update_fields.append('full_name')
        if 'picture_url' in validated_data:
            instance.picture_url = validated_data['picture_url'] or None
            update_fields.append('picture_url')
        if 'new_password' in validated_data:
            instance.password_hash = make_password(validated_data['new_password'])
            update_fields.append('password_hash')
        if update_fields:
            instance.save(update_fields=update_fields)
        return instance