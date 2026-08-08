from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponseRedirect
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    path('', lambda request: HttpResponseRedirect('http://localhost:5174/')),
    path('admin/', admin.site.urls),
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/', include('apps.users.urls')),
    path('api/users/', include('apps.users.urls')),
    path('api/curriculum/', include('apps.curriculum.urls')),
    path('api/assessment/', include('apps.assessment.urls')),
    path('api/analytics/', include('apps.analytics.urls')),
    path('api/integrations/', include('apps.integrations.urls')),
    path('api/grading/omr/', include('apps.grading.urls')),
    path('api/grading/', include('apps.grading.urls_grading')),
]

if settings.DEBUG:
    try:
        urlpatterns += [path('__debug__/', include('debug_toolbar.urls'))]
    except ImportError:
        pass
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)