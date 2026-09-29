from django.contrib.auth.hashers import check_password, make_password
from django.core import signing
from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken

from apps.integrations.models import Institution, UserProfile, UserRole


ROLE_DASHBOARD_MAP = {
    UserRole.FACULTY: '/faculty/dashboard',
    UserRole.ADMIN: '/admin/dashboard',
    UserRole.SUPERADMIN: '/superadmin/dashboard',
}

PASSWORD_RESET_SALT = 'atlas.password-reset'
PASSWORD_RESET_CACHE_PREFIX = 'atlas:password-reset:'


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

    class Meta:
        model = UserProfile
        fields = [
            'user_id',
            'email',
            'name',
            'role',
            'role_code',
            'institution_name',
            'dashboard_path',
            'institution_application_status',
            'institution_payment_status',
            'is_active',
            'created_at',
            'picture_url',
        ]

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
                    self.error_messages['no_active_account'],
                    'no_active_account',
                ) from exc

            if not profile.is_active:
                raise AuthenticationFailed(
                    self.error_messages['no_active_account'],
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

    def validate_role(self, value):
        if value in {UserRole.STUDENT, 'student'}:
            raise serializers.ValidationError(
                'Student accounts are not supported. Register as faculty.'
            )
        # Public signup creates the institution's first administrator.
        return UserRole.ADMIN

    @transaction.atomic
    def create(self, validated_data):
        institution_name = validated_data.pop('institution_name').strip()
        selected_plan = validated_data.pop('selected_plan', '').strip()
        role = validated_data.pop('role', UserRole.ADMIN)
        password = validated_data.pop('password')
        validated_data.pop('full_name', None)

        institution, _ = Institution.objects.get_or_create(
            name=institution_name,
            defaults={
                'plan_tier': 'free',
                'subscription_status': 'trialing',
                'application_status': 'pending_review',
                'payment_status': 'unpaid',
                'selected_plan': selected_plan,
                'is_active': False,
            },
        )

        if not institution.application_status == 'active':
            if selected_plan:
                institution.selected_plan = selected_plan
            institution.application_status = 'pending_review'
            institution.payment_status = 'unpaid'
            institution.is_active = False
            update_fields = ['application_status', 'payment_status', 'is_active']
            if selected_plan:
                update_fields.append('selected_plan')
            institution.save(update_fields=update_fields)

        return UserProfile.objects.create(
            institution=institution,
            email=validated_data['email'],
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
    otp = serializers.CharField(min_length=4, max_length=4)

    def validate_email(self, value):
        return value.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    reset_token = serializers.CharField()
    new_password = serializers.CharField(min_length=8, write_only=True, trim_whitespace=False)


class UserAccountSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    institution_name = serializers.CharField(source='institution.name', read_only=True, allow_null=True)
    dashboard_path = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = [
            'user_id',
            'email',
            'role',
            'role_code',
            'institution_name',
            'dashboard_path',
            'is_active',
            'created_at',
        ]
        read_only_fields = ['user_id', 'created_at']

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
    full_name = serializers.CharField(max_length=255, allow_blank=True, required=False)
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8, write_only=True, trim_whitespace=False)

    def validate_email(self, value):
        normalized = value.strip().lower()
        if UserProfile.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return normalized

    @transaction.atomic
    def create(self, validated_data):
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError('Authentication required.')

        admin_user = request.user
        institution = admin_user.institution
        if not institution:
            raise serializers.ValidationError('Admin user has no associated institution.')

        password = validated_data.pop('password')
        validated_data.pop('full_name', None)

        return UserProfile.objects.create(
            institution=institution,
            email=validated_data['email'],
            password_hash=make_password(password),
            role=UserRole.FACULTY,
            is_active=True,
        )


class StudentDetailsUpdateSerializer(serializers.Serializer):
    courses_enrolled = serializers.JSONField(required=False)