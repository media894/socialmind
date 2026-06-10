from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from datetime import timedelta

from django.utils import timezone

from .models import User, APIKeyConfig, SocialAccount


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)
    otp_channel = serializers.ChoiceField(choices=['email'], write_only=True, required=False, default='email')

    class Meta:
        model = User
        fields = ('email', 'phone_number', 'username', 'first_name', 'last_name', 'password', 'password_confirm', 'otp_channel')

    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        email = str(data.get('email', '')).strip().lower()
        if email and User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError({'email': 'An account with this email address already exists.'})
        data['email'] = email
        return data

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        validated_data.pop('otp_channel', None)
        return User.objects.create_user(**validated_data)


class UserProfileSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=False, min_length=8)
    password_confirm = serializers.CharField(write_only=True, required=False, allow_blank=False, min_length=8)
    quota_remaining = serializers.ReadOnlyField()
    effective_monthly_video_quota = serializers.ReadOnlyField()
    social_accounts_count = serializers.SerializerMethodField()
    can_cancel_subscription = serializers.SerializerMethodField()
    subscription_cancellation_deadline = serializers.SerializerMethodField()
    subscription_expires_at = serializers.ReadOnlyField()
    is_subscription_expired = serializers.ReadOnlyField()

    class Meta:
        model = User
        fields = ('id', 'email', 'username', 'first_name', 'last_name', 'avatar',
                  'password', 'password_confirm',
                  'phone_number', 'email_verified', 'phone_verified',
                  'bio', 'subscription_plan', 'monthly_video_quota',
                  'subscription_status', 'paypal_subscription_id',
                  'videos_generated_this_month', 'quota_remaining', 'effective_monthly_video_quota',
                  'social_accounts_count', 'created_at', 'subscription_started_at',
                  'can_cancel_subscription', 'subscription_cancellation_deadline',
                  'subscription_expires_at', 'is_subscription_expired')
        read_only_fields = ('id', 'email', 'subscription_plan', 'monthly_video_quota',
                           'subscription_status', 'paypal_subscription_id',
                           'videos_generated_this_month', 'created_at', 'email_verified', 'phone_verified',
                           'effective_monthly_video_quota', 'subscription_started_at',
                           'can_cancel_subscription', 'subscription_cancellation_deadline',
                           'subscription_expires_at', 'is_subscription_expired')

    def get_social_accounts_count(self, obj):
        return obj.social_accounts.filter(is_active=True).count()

    def get_can_cancel_subscription(self, obj):
        if obj.subscription_plan == 'free' or not obj.subscription_started_at:
            return False
        return timezone.now() < obj.subscription_started_at + timedelta(days=7)

    def get_subscription_cancellation_deadline(self, obj):
        if obj.subscription_plan == 'free' or not obj.subscription_started_at:
            return None
        return obj.subscription_started_at + timedelta(days=7)

    def validate(self, attrs):
        password = attrs.get('password')
        password_confirm = attrs.get('password_confirm')

        if password or password_confirm:
            if not password or not password_confirm:
                raise serializers.ValidationError({'password_confirm': 'Please confirm the new password.'})
            if password != password_confirm:
                raise serializers.ValidationError({'password_confirm': 'Passwords do not match.'})

        return attrs

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        validated_data.pop('password_confirm', None)
        instance = super().update(instance, validated_data)

        if password:
            instance.set_password(password)
            instance.save(update_fields=['password'])

        return instance


class APIKeySerializer(serializers.ModelSerializer):
    raw_key = serializers.CharField(write_only=True, required=False)
    key_preview = serializers.SerializerMethodField()

    class Meta:
        model = APIKeyConfig
        fields = ('id', 'service', 'label', 'is_active', 'raw_key', 'key_preview',
                  'created_at', 'last_used')
        read_only_fields = ('id', 'created_at', 'last_used')

    def get_key_preview(self, obj):
        try:
            key = obj.get_key()
            return f"{'*' * (len(key) - 8)}{key[-4:]}" if len(key) > 8 else '****'
        except Exception:
            return '****'

    def create(self, validated_data):
        raw_key = validated_data.pop('raw_key', None)
        instance = APIKeyConfig(**validated_data, user=self.context['request'].user)
        if raw_key:
            instance.set_key(raw_key)
        instance.save()
        return instance

    def update(self, instance, validated_data):
        raw_key = validated_data.pop('raw_key', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if raw_key:
            instance.set_key(raw_key)
        instance.save()
        return instance


class SocialAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = SocialAccount
        fields = ('id', 'platform', 'platform_user_id', 'platform_username', 'platform_name',
                  'avatar_url', 'is_active', 'page_id', 'connected_at', 'token_expires_at')
        read_only_fields = ('id', 'connected_at')


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = 'email'

    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserProfileSerializer(self.user).data
        return data
