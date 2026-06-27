from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse

def health_check(request):
    return JsonResponse({'status': 'ok'})

urlpatterns = [
    path('health/', health_check),
    path('admin/', admin.site.urls),
    path('api/v1/auth/', include('apps.users.urls')),
    path('api/v1/videos/', include('apps.videos.urls')),
    path('api/v1/social/', include('apps.social.urls')),
    path('api/v1/tasks/', include('apps.tasks.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
