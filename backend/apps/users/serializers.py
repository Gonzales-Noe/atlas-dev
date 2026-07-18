from django.contrib.auth.hashers import check_password, make_password
from django.core import signing
from django.db import transaction
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from apps.integrations.models import Institution, UserProfile, UserRole


ROLE_DASHBOARD_MAP = {
    UserRole.FACULTY: '/faculty/dashboard',
    UserRole.ADMIN: '/admin/dashboard',
    UserRole.SUPERADMIN: '/superadmin/dashboard',
    UserRole.STUDENT: '/student/dashboard',
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
            'section',
            'student_details',
            'is_active',
            'created_at',
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

        refresh = RefreshToken.for_user(profile)
        refresh['role'] = normalize_role(profile.role)
        refresh['email'] = profile.email
        if profile.institution_id:
            refresh['institution_id'] = str(profile.institution_id)

        return {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': UserProfileSerializer(profile).data,
        }


class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255, allow_blank=True, required=False)
    email = serializers.EmailField()
    institution_name = serializers.CharField(max_length=255)
    password = serializers.CharField(min_length=8, write_only=True, trim_whitespace=False)
    role = serializers.CharField(required=False, default=UserRole.FACULTY)

    def validate_email(self, value):
        normalized = value.strip().lower()
        if UserProfile.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return normalized

    def validate_role(self, value):
        if value in {'superadmin', 'super_admin'}:
            return UserRole.SUPERADMIN
        if value == 'admin':
            return UserRole.ADMIN
        if value == 'student':
            return UserRole.STUDENT
        if value in {UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.FACULTY, UserRole.STUDENT}:
            return value
        raise serializers.ValidationError('Invalid role.')

    @transaction.atomic
    def create(self, validated_data):
        institution_name = validated_data.pop('institution_name').strip()
        role = validated_data.pop('role', UserRole.FACULTY)
        password = validated_data.pop('password')
        validated_data.pop('full_name', None)

        institution, _ = Institution.objects.get_or_create(
            name=institution_name,
            defaults={
                'plan_tier': 'free',
                'subscription_status': 'active',
                'is_active': True,
            },
        )

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


class StudentDetailsUpdateSerializer(serializers.Serializer):
    student_details = serializers.JSONField()
    section = serializers.CharField(max_length=50, required=False, allow_blank=True)