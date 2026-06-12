from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from . import views
from . import oauth_views
from .webhook_views import paypal_webhook
from apps.users.views import CleanupStuckAccountView 

router = DefaultRouter()
router.register('api-keys', views.APIKeyViewSet, basename='api-keys')
router.register('social-accounts', views.SocialAccountViewSet, basename='social-accounts')

urlpatterns = [
    path('check-email/', views.CheckEmailView.as_view(), name='check-email'),
    path('check-username/', views.CheckUsernameView.as_view(), name='check-username'),
    path('password-reset/start/', views.PasswordResetStartView.as_view(), name='password-reset-start'),
    path('password-reset/confirm/', views.PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
    path('email-otp/start/', views.EmailOtpStartView.as_view(), name='email-otp-start'),
    path('register/', views.RegisterView.as_view(), name='register'),
    path('register/verify-otp/', views.RegisterVerifyOTPView.as_view(), name='register-verify-otp'),
    path('login/', views.LoginView.as_view(), name='login'),
    path('login/verify-otp/', views.LoginVerifyOTPView.as_view(), name='login-verify-otp'),
    path('profile/email/request-otp/', views.ProfileEmailOTPRequestView.as_view(), name='profile-email-request-otp'),
    path('profile/email/verify-otp/', views.ProfileEmailOTPVerifyView.as_view(), name='profile-email-verify-otp'),
    path('profile/consume-video-quota/', views.ConsumeVideoQuotaView.as_view(), name='profile-consume-video-quota'),
    path('paypal/config/', views.PayPalConfigView.as_view(), name='paypal-config'),
    path('paypal/subscription/approve/', views.PayPalSubscriptionApproveView.as_view(), name='paypal-subscription-approve'),
    path('subscription/local-activate/', views.LocalSubscriptionActivateView.as_view(), name='subscription-local-activate'),
    path('paypal/subscription/cancel/', views.CancelSubscriptionView.as_view(), name='paypal-subscription-cancel'),
    path('activity/', views.UserActivityLogView.as_view(), name='user-activity-log'),
    path('paypal/webhook/', paypal_webhook, name='paypal-webhook'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('profile/', views.ProfileView.as_view(), name='profile'),
    path('account/', views.DeleteAccountView.as_view(), name='delete-account'),
    path('api/cleanup/', views.CleanupStuckAccountView.as_view()),
    # OAuth flows
    path('oauth/instagram/', oauth_views.instagram_oauth_start, name='instagram-oauth-start'),
    path('oauth/instagram/callback/', oauth_views.instagram_oauth_callback, name='instagram-oauth-callback'),
    path('oauth/linkedin/', oauth_views.linkedin_oauth_start, name='linkedin-oauth-start'),
    path('oauth/linkedin/callback/', oauth_views.linkedin_oauth_callback, name='linkedin-oauth-callback'),
    path('oauth/google/', oauth_views.google_login_start, name='google-login-start'),
    path('oauth/google/callback/', oauth_views.google_login_callback, name='google-login-callback'),
    path('oauth/youtube/', oauth_views.youtube_oauth_start, name='youtube-oauth-start'),
    path('oauth/youtube/callback/', oauth_views.youtube_oauth_callback, name='youtube-oauth-callback'),
    path('oauth/linkedin/start/', oauth_views.linkedin_oauth_start, name='linkedin-oauth-start'),
    path('oauth/linkedin/callback/', oauth_views.linkedin_oauth_callback, name='linkedin-oauth-callback'), 
    path('oauth/twitter/', oauth_views.twitter_oauth_start, name='twitter-oauth-start'),
    path('oauth/twitter/callback/', oauth_views.twitter_oauth_callback, name='twitter-oauth-callback'),
    path('oauth/facebook-login/', oauth_views.facebook_login_start, name='facebook-login-start'),
    path('oauth/facebook-login/callback/', oauth_views.facebook_login_callback, name='facebook-login-callback'),
    path('', include(router.urls)),
]

