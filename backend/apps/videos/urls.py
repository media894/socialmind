from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VideoProjectViewSet, VideoTemplateViewSet, PublicVideoView, groq_proxy, groq_tts_proxy

router = DefaultRouter()
router.register('projects', VideoProjectViewSet, basename='video-projects')
router.register('templates', VideoTemplateViewSet, basename='video-templates')

urlpatterns = [
    path('', include(router.urls)),
    path('groq-proxy/', groq_proxy, name='groq-proxy'),
    path('groq-tts-proxy/', groq_tts_proxy, name='groq-tts-proxy'),
    path('public/<uuid:pk>/', PublicVideoView.as_view({'get': 'retrieve'}), name='public-video'),
]
