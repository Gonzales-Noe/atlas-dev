from django.core.exceptions import ValidationError
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.settings import api_settings

from apps.integrations.models import UserProfile


class UserProfileJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user_id = validated_token.get(api_settings.USER_ID_CLAIM)

        if user_id is None:
            raise InvalidToken('Token contained no recognizable user identification')

        try:
            return UserProfile.objects.select_related('institution').get(user_id=user_id, is_active=True)
        except (UserProfile.DoesNotExist, ValidationError, ValueError) as exc:
            # A bad id must stay a 401. Django's ValidationError is not an
            # API exception, so leaving it uncaught becomes an HTTP 500 page
            # and the sign-in screen reports that auth is unavailable.
            raise AuthenticationFailed('User not found or inactive.') from exc