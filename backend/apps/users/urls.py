from django.urls import path

from .views import (
    AuthTokenRefreshView,
    AuthTokenView,
    AccountDetailView,
    AccountManagementView,
    DashboardSummaryView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    PasswordResetVerifyView,
    RegisterView,
    GoogleAuthView,
    DebugGoogleClientIdView,
)

urlpatterns = [
    path('token/', AuthTokenView.as_view(), name='auth_token'),
    path('token/refresh/', AuthTokenRefreshView.as_view(), name='auth_token_refresh'),
    path('me/', MeView.as_view(), name='auth_me'),
    path('register/', RegisterView.as_view(), name='auth_register'),
    path('dashboard/summary/', DashboardSummaryView.as_view(), name='dashboard_summary'),
    path('accounts/', AccountManagementView.as_view(), name='account_management'),
    path('accounts/<uuid:user_id>/', AccountDetailView.as_view(), name='account_detail'),
    path('password-reset/request/', PasswordResetRequestView.as_view(), name='password_reset_request'),
    path('password-reset/verify/', PasswordResetVerifyView.as_view(), name='password_reset_verify'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    path('google/', GoogleAuthView.as_view(), name='auth_google'),
    path('debug/google-client-id/', DebugGoogleClientIdView.as_view(), name='debug_google_client_id'),
]
