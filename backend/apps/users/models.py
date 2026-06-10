from django.contrib.auth.models import AbstractUser
from django.db import models
from cryptography.fernet import Fernet
from django.conf import settings
import base64
from django.utils import timezone
from datetime import timedelta


def get_cipher():
    key = settings.ENCRYPTION_KEY
    if isinstance(key, str):
        key = key.encode()
    # Ensure proper Fernet key format
    try:
        return Fernet(key)
    except Exception:
        # Generate a valid key from the provided string
        import hashlib
        hashed = hashlib.sha256(key).digest()
        return Fernet(base64.urlsafe_b64encode(hashed))


class User(AbstractUser):
    email = models.EmailField(unique=True)
    phone_number = models.CharField(max_length=30, blank=True)
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    bio = models.TextField(blank=True)
    email_verified = models.BooleanField(default=False)
    phone_verified = models.BooleanField(default=False)
    subscription_plan = models.CharField(
        max_length=20,
        choices=[('free', 'Free'), ('pro', 'Pro'), ('enterprise', 'Enterprise')],
        default='free'
    )
    subscription_status = models.CharField(max_length=40, blank=True)
    paypal_subscription_id = models.CharField(max_length=128, blank=True)
    paypal_plan_id = models.CharField(max_length=128, blank=True)
    paypal_last_payment_id = models.CharField(max_length=128, blank=True)
    paypal_last_payment_currency = models.CharField(max_length=10, blank=True, default='USD')
    monthly_video_quota = models.IntegerField(default=5)
    videos_generated_this_month = models.IntegerField(default=0)
    posts_scheduled_since_subscription = models.IntegerField(
        default=0,
        help_text='Posts scheduled during the current subscription period.',
    )
    posts_published_since_subscription = models.IntegerField(
        default=0,
        help_text='Posts published during the current subscription period.',
    )
    subscription_started_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    class Meta:
        db_table = 'users'

    def __str__(self):
        return self.email

    @property
    def effective_monthly_video_quota(self):
        if self.subscription_plan == 'free':
            return 5
        return self.monthly_video_quota or 50

    @property
    def quota_remaining(self):
        return max(0, self.effective_monthly_video_quota - self.videos_generated_this_month)

    @property
    def subscription_expires_at(self):
        if self.subscription_plan == 'free' or not self.subscription_started_at:
            return None
        return self.subscription_started_at + timedelta(days=30)

    @property
    def is_subscription_expired(self):
        expires_at = self.subscription_expires_at
        return bool(expires_at and timezone.now() >= expires_at)


class VerificationOTP(models.Model):
    PURPOSE_CHOICES = [
        ('register', 'Register'),
        ('login', 'Login'),
        ('profile_contact', 'Profile Contact'),
        ('password_reset', 'Password Reset'),
    ]
    CHANNEL_CHOICES = [
        ('email', 'Email'),
        ('phone', 'Phone'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='otp_challenges')
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES)
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES)
    contact_value = models.CharField(max_length=255)
    code = models.CharField(max_length=6)
    challenge_token = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'verification_otps'
        ordering = ['-created_at']

    @property
    def is_expired(self):
        return timezone.now() >= self.expires_at

    @property
    def is_active(self):
        return self.used_at is None and not self.is_expired


class APIKeyConfig(models.Model):
    """Stores encrypted API keys for AI services"""
    AI_SERVICES = [
        ('openai', 'OpenAI / ChatGPT'),
        ('deepseek', 'DeepSeek'),
        ('groq', 'Groq (xAI)'),
        ('elevenlabs', 'ElevenLabs (TTS)'),
        ('pexels', 'Pexels (Video Footage)'),
        ('stability', 'Stability AI'),
        ('runway', 'Runway ML'),
        ('anthropic', 'Anthropic (Claude)'),
        ('mistral', 'Mistral AI'),
        ('cohere', 'Cohere'),
        ('others', 'Others (Custom API)'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='api_keys')
    service = models.CharField(max_length=50, choices=AI_SERVICES)
    encrypted_key = models.BinaryField()
    is_active = models.BooleanField(default=True)
    label = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'api_key_configs'
        unique_together = ('user', 'service')

    def set_key(self, raw_key: str):
        cipher = get_cipher()
        self.encrypted_key = cipher.encrypt(raw_key.encode())

    def get_key(self) -> str:
        cipher = get_cipher()
        return cipher.decrypt(bytes(self.encrypted_key)).decode()

    def __str__(self):
        return f"{self.user.email} - {self.service}"


class SocialAccount(models.Model):
    """Connected social media accounts"""
    PLATFORMS = [
        ('instagram', 'Instagram'),
        ('facebook', 'Facebook'),
        ('linkedin', 'LinkedIn'),
        ('youtube', 'YouTube Shorts'),
        ('twitter', 'Twitter/X'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='social_accounts')
    platform = models.CharField(max_length=30, choices=PLATFORMS)
    platform_user_id = models.CharField(max_length=255)
    platform_username = models.CharField(max_length=255)
    platform_name = models.CharField(max_length=255, blank=True)
    avatar_url = models.URLField(blank=True)
    encrypted_access_token = models.BinaryField()
    encrypted_refresh_token = models.BinaryField(null=True, blank=True)
    token_expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    page_id = models.CharField(max_length=255, blank=True)  # For Facebook pages
    connected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'social_accounts'
        unique_together = ('user', 'platform', 'platform_user_id')

    def set_access_token(self, token: str):
        cipher = get_cipher()
        self.encrypted_access_token = cipher.encrypt(token.encode())

    def get_access_token(self) -> str:
        cipher = get_cipher()
        return cipher.decrypt(bytes(self.encrypted_access_token)).decode()

    def set_refresh_token(self, token: str):
        cipher = get_cipher()
        self.encrypted_refresh_token = cipher.encrypt(token.encode())

    def get_refresh_token(self) -> str:
        if not self.encrypted_refresh_token:
            return None
        cipher = get_cipher()
        return cipher.decrypt(bytes(self.encrypted_refresh_token)).decode()

    def __str__(self):
        return f"{self.user.email} - {self.platform} (@{self.platform_username})"


class SubscriptionUsageSnapshot(models.Model):
    id = models.BigAutoField(auto_created=True, primary_key=True, serialize=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='subscription_snapshots',
    )
    subscription_plan = models.CharField(max_length=20)
    paypal_subscription_id = models.CharField(max_length=128, blank=True)
    paypal_plan_id = models.CharField(max_length=128, blank=True)
    plan_price_usd = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    monthly_video_quota = models.IntegerField(default=0)
    baseline_videos_generated = models.IntegerField(default=0)
    baseline_posts_scheduled = models.IntegerField(default=0)
    baseline_posts_published = models.IntegerField(default=0)
    subscription_started_at = models.DateTimeField()
    created_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True, blank=True)
    end_reason = models.CharField(
        max_length=40,
        blank=True,
        choices=[
            ('cancelled_7day', 'Cancelled within 7 days'),
            ('expired', 'Expired'),
            ('suspended', 'Suspended'),
            ('admin', 'Admin action'),
        ],
    )
    videos_used_during_period = models.IntegerField(null=True, blank=True)
    posts_scheduled_during_period = models.IntegerField(null=True, blank=True)
    posts_published_during_period = models.IntegerField(null=True, blank=True)
    usage_charge_usd = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    refund_amount_usd = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    paypal_refund_id = models.CharField(max_length=128, blank=True)

    class Meta:
        db_table = 'subscription_usage_snapshots'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.email} - {self.subscription_plan} snapshot"


class UserActivityLog(models.Model):
    ACTION_CHOICES = [
        ('register', 'Register'),
        ('login', 'Login'),
        ('logout', 'Logout'),
        ('password_reset', 'Password Reset'),
        ('email_verified', 'Email Verified'),
        ('profile_updated', 'Profile Updated'),
        ('email_changed', 'Email Changed'),
        ('subscription_activated', 'Subscription Activated'),
        ('subscription_cancelled', 'Subscription Cancelled'),
        ('subscription_suspended', 'Subscription Suspended'),
        ('subscription_expired', 'Subscription Expired'),
        ('subscription_refunded', 'Subscription Refunded'),
        ('payment_completed', 'Payment Completed'),
        ('payment_failed', 'Payment Failed'),
        ('video_quota_consumed', 'Video Quota Consumed'),
        ('post_scheduled', 'Post Scheduled'),
        ('post_publish_started', 'Post Publish Started'),
        ('post_published', 'Post Published'),
        ('post_cancelled', 'Post Cancelled'),
        ('account_deleted', 'Account Deleted'),
    ]

    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    user_email = models.EmailField()
    action = models.CharField(max_length=40, choices=ACTION_CHOICES)
    detail = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'user_activity_logs'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user_email} - {self.action}"
