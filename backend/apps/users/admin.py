from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.utils import timezone
from django.utils.html import format_html
from datetime import timedelta

from .models import APIKeyConfig, SocialAccount, User, UserActivityLog, VerificationOTP


class UserActivityInline(admin.TabularInline):
    model = UserActivityLog
    extra = 0
    can_delete = False
    fields = ('created_at', 'action', 'detail', 'metadata', 'ip_address')
    readonly_fields = fields
    ordering = ('-created_at',)

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = (
        'email',
        'username',
        'subscription_plan',
        'subscription_status',
        'monthly_video_quota',
        'paypal_subscription_id',
        'videos_generated_this_month',
        'quota_remaining_display',
        'scheduled_posts_count',
        'blocked_posts_count',
        'can_cancel_display',
        'subscription_started_at',
        'is_active',
    )
    list_filter = (
        'subscription_plan',
        'subscription_status',
        'is_active',
        'email_verified',
        'created_at',
    )
    search_fields = ('email', 'username', 'first_name', 'last_name', 'paypal_subscription_id')
    ordering = ('-created_at',)
    readonly_fields = (
        'created_at',
        'updated_at',
        'last_login',
        'date_joined',
        'quota_remaining_display',
        'scheduled_posts_count',
        'blocked_posts_count',
        'published_posts_count',
        'activity_count',
        'can_cancel_display',
    )
    inlines = (UserActivityInline,)

    fieldsets = DjangoUserAdmin.fieldsets + (
        ('Profile', {
            'fields': ('phone_number', 'avatar', 'bio', 'email_verified', 'phone_verified'),
        }),
        ('Subscription and Usage', {
            'fields': (
                'subscription_plan',
                'subscription_status',
                'monthly_video_quota',
                'videos_generated_this_month',
                'quota_remaining_display',
                'subscription_started_at',
                'paypal_subscription_id',
                'paypal_plan_id',
                'paypal_last_payment_id',
                'paypal_last_payment_currency',
                'can_cancel_display',
            ),
        }),
        ('Activity Overview', {
            'fields': (
                'scheduled_posts_count',
                'blocked_posts_count',
                'published_posts_count',
                'activity_count',
            ),
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
        }),
    )

    @admin.display(description='Quota remaining')
    def quota_remaining_display(self, obj):
        return obj.quota_remaining

    @admin.display(description='Scheduled')
    def scheduled_posts_count(self, obj):
        return obj.scheduled_posts.filter(status='scheduled').count()

    @admin.display(description='Blocked')
    def blocked_posts_count(self, obj):
        return obj.scheduled_posts.filter(status='blocked').count()

    @admin.display(description='Published')
    def published_posts_count(self, obj):
        return obj.scheduled_posts.filter(status='published').count()

    @admin.display(description='Activities')
    def activity_count(self, obj):
        return UserActivityLog.objects.filter(user=obj).count()

    @admin.display(description='Cancel available')
    def can_cancel_display(self, obj):
        if obj.subscription_plan == 'free' or not obj.subscription_started_at:
            return format_html('<span style="color:#999;">No subscription</span>')
        window_ends = obj.subscription_started_at + timedelta(days=7)
        if timezone.now() >= window_ends:
            return format_html('<span style="color:#ef4444;font-weight:600;">Disabled - 7 days complete</span>')
        return format_html('<span style="color:#22c55e;font-weight:600;">Enabled until {}</span>', window_ends.strftime('%Y-%m-%d %H:%M'))
    add_fieldsets = DjangoUserAdmin.add_fieldsets + (
        (None, {
            'fields': ('email', 'first_name', 'last_name'),
        }),
    )


@admin.register(UserActivityLog)
class UserActivityLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'user_email', 'action', 'detail', 'ip_address')
    list_filter = ('action', 'created_at')
    search_fields = ('user_email', 'detail')
    readonly_fields = ('user', 'user_email', 'action', 'detail', 'metadata', 'ip_address', 'created_at')
    ordering = ('-created_at',)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(APIKeyConfig)
class APIKeyConfigAdmin(admin.ModelAdmin):
    list_display = ('user', 'service', 'label', 'is_active', 'created_at', 'last_used')
    list_filter = ('service', 'is_active', 'created_at')
    search_fields = ('user__email', 'service', 'label')


@admin.register(SocialAccount)
class SocialAccountAdmin(admin.ModelAdmin):
    list_display = ('user', 'platform', 'platform_username', 'platform_name', 'is_active', 'connected_at')
    list_filter = ('platform', 'is_active', 'connected_at')
    search_fields = ('user__email', 'platform_username', 'platform_name')


@admin.register(VerificationOTP)
class VerificationOTPAdmin(admin.ModelAdmin):
    list_display = ('user', 'purpose', 'channel', 'contact_value', 'used_at', 'expires_at', 'created_at')
    list_filter = ('purpose', 'channel', 'created_at')
    search_fields = ('user__email', 'contact_value')
    readonly_fields = ('code', 'challenge_token', 'created_at')
