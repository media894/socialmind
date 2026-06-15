import logging
import os
import secrets
import smtplib
from email.utils import parseaddr
from datetime import timedelta
import httpx
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.models import update_last_login
from django.core.cache import cache
from django.core.mail import send_mail
from django.db.models import F
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.views import APIView
from .models import APIKeyConfig, SocialAccount, UserActivityLog, VerificationOTP
from .serializers import (
    APIKeySerializer,
    SocialAccountSerializer,
    UserProfileSerializer,
    UserRegistrationSerializer,
)
from .access_control import (
    block_user_scheduled_content,
    expire_user_subscription_if_needed,
    unblock_user_scheduled_content,
)

User = get_user_model()
logger = logging.getLogger(__name__)

LOGIN_IP_LIMIT = 1000
LOGIN_IP_WINDOW_SECONDS = 1 * 60
ENTERPRISE_MONTHLY_VIDEO_QUOTA = 1000000
PLAN_PRICES = {
    'pro': 29.00,
    'enterprise': 99.00,
}


class PayPalConfigurationError(Exception):
    pass


def _paypal_plan_settings():
    return {
        'pro': {
            'paypal_plan_id': getattr(settings, 'PAYPAL_PRO_PLAN_ID', ''),
            'subscription_plan': 'pro',
            'monthly_video_quota': 50,
        },
        'enterprise': {
            'paypal_plan_id': getattr(settings, 'PAYPAL_ENTERPRISE_PLAN_ID', ''),
            'subscription_plan': 'enterprise',
            'monthly_video_quota': ENTERPRISE_MONTHLY_VIDEO_QUOTA,
        },
    }


def _paypal_access_token():
    client_id = getattr(settings, 'PAYPAL_CLIENT_ID', '')
    client_secret = getattr(settings, 'PAYPAL_CLIENT_SECRET', '')
    if not client_id or not client_secret:
        raise PayPalConfigurationError('PayPal server credentials are not configured.')

    response = httpx.post(
        f"{settings.PAYPAL_API_BASE_URL}/v1/oauth2/token",
        data={'grant_type': 'client_credentials'},
        headers={'Accept': 'application/json', 'Accept-Language': 'en_US'},
        auth=(client_id, client_secret),
        timeout=15,
    )
    response.raise_for_status()
    token = response.json().get('access_token')
    if not token:
        raise PayPalConfigurationError('PayPal did not return an access token.')
    return token


def _paypal_subscription_details(subscription_id):
    token = _paypal_access_token()
    response = httpx.get(
        f"{settings.PAYPAL_API_BASE_URL}/v1/billing/subscriptions/{subscription_id}",
        headers={
            'Authorization': f'Bearer {token}',
            'Accept': 'application/json',
        },
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def _otp_response_payload(challenge):
    payload = {
        'otp_required': True,
        'challenge_token': challenge.challenge_token,
        'channel': challenge.channel,
        'contact': challenge.contact_value,
        'expires_in': max(0, int((challenge.expires_at - timezone.now()).total_seconds())),
        'delivery_notice': _otp_delivery_notice(challenge.channel),
    }
    return payload


def _issue_tokens_for_user(user):
    expire_user_subscription_if_needed(user)
    refresh = RefreshToken.for_user(user)
    return {
        'user': UserProfileSerializer(user).data,
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    }


def log_activity(user, action, detail='', metadata=None, ip_address=None):
    try:
        UserActivityLog.objects.create(
            user=user if getattr(user, 'pk', None) else None,
            user_email=getattr(user, 'email', '') or '',
            action=action,
            detail=detail,
            metadata=metadata or {},
            ip_address=ip_address,
        )
    except Exception as exc:
        logger.warning('Failed to write user activity log: %s', exc)


def _mask_contact(channel, value):
    if not value:
        return ''
    if channel == 'phone':
        return f"{'*' * max(0, len(value) - 4)}{value[-4:]}"
    if '@' in value:
        local, domain = value.split('@', 1)
        return f"{local[:2]}{'*' * max(0, len(local) - 2)}@{domain}"
    return value


def _otp_delivery_notice(channel):
    email_backend = getattr(settings, 'EMAIL_BACKEND', '')
    email_ready = bool(
        getattr(settings, 'EMAIL_HOST', '') and
        getattr(settings, 'EMAIL_HOST_USER', '') and
        getattr(settings, 'EMAIL_HOST_PASSWORD', '') and
        'console.EmailBackend' not in email_backend
    )

    if channel == 'email' and not email_ready:
        return 'Mail delivery is not configured. The OTP may only appear in backend logs until SMTP is set up.'
    return ''


def _send_otp(user, purpose, channel):
    if channel != 'email':
        raise ValueError('Email OTP is the only supported verification method.')

    contact_value = user.email
    if not contact_value:
        raise ValueError('No contact value available for OTP delivery.')

    VerificationOTP.objects.filter(
        user=user,
        purpose=purpose,
        channel=channel,
        used_at__isnull=True,
    ).update(used_at=timezone.now())

    code = get_random_string(6, allowed_chars='0123456789')
    challenge = VerificationOTP.objects.create(
        user=user,
        purpose=purpose,
        channel=channel,
        contact_value=contact_value,
        code=code,
        challenge_token=secrets.token_urlsafe(24),
        expires_at=timezone.now() + timedelta(minutes=10),
    )

    if channel == 'email':
        send_mail(
            subject='Your SocialMind verification code',
            message=f'Your SocialMind verification code is {code}. It expires in 10 minutes.',
            from_email=getattr(settings, 'EMAIL_HOST_USER', '') or getattr(settings, 'DEFAULT_FROM_EMAIL', '') or 'no-reply@socialmind.local',
            recipient_list=[contact_value],
        )

    return challenge


def _send_profile_contact_otp(user, contact_input):
    contact_value = str(contact_input or '').strip().lower()
    if '@' not in contact_value:
        raise ValueError('Enter a valid email address.')
    channel = 'email'

    VerificationOTP.objects.filter(
        user=user,
        purpose='profile_contact',
        channel=channel,
        used_at__isnull=True,
    ).update(used_at=timezone.now())

    code = get_random_string(6, allowed_chars='0123456789')
    challenge = VerificationOTP.objects.create(
        user=user,
        purpose='profile_contact',
        channel=channel,
        contact_value=contact_value,
        code=code,
        challenge_token=secrets.token_urlsafe(24),
        expires_at=timezone.now() + timedelta(minutes=10),
    )

    if channel == 'email':
        send_mail(
            subject='Your SocialMind verification code',
            message=f'Your SocialMind verification code is {code}. It expires in 10 minutes.',
            from_email=getattr(settings, 'EMAIL_HOST_USER', '') or getattr(settings, 'DEFAULT_FROM_EMAIL', '') or 'no-reply@socialmind.local',
            recipient_list=[contact_value],
        )

    return challenge


def _build_unique_username(base_value):
    base = ''.join(ch for ch in str(base_value or '').strip().lower() if ch.isalnum() or ch in {'_', '.'})
    base = base.strip('._')
    if not base:
        base = 'user'

    candidate = base
    suffix = 0
    while User.objects.filter(username=candidate).exists():
        suffix += 1
        candidate = f'{base}_{suffix}'
    return candidate


def _get_or_create_workspace_account(email, source_user=None):
    normalized_email = str(email or '').strip().lower()
    if not normalized_email:
        raise ValueError('Email address is required.')

    existing = User.objects.filter(email__iexact=normalized_email).first()
    if existing:
        if not existing.is_active:
            existing.is_active = True
            existing.save(update_fields=['is_active'])
        if not existing.email_verified:
            existing.email_verified = True
            existing.save(update_fields=['email_verified'])
        return existing

    local_part = normalized_email.split('@', 1)[0]
    username = _build_unique_username(local_part)
    user = User.objects.create_user(
        email=normalized_email,
        username=username,
        password=None,
        first_name='',
        last_name='',
    )
    user.is_active = True
    user.email_verified = True
    user.phone_verified = False
    user.save(update_fields=['is_active', 'email_verified', 'phone_verified'])
    return user


def _get_valid_challenge(challenge_token, purpose):
    challenge = VerificationOTP.objects.filter(
        challenge_token=challenge_token,
        purpose=purpose,
    ).select_related('user').first()

    if not challenge:
        return None, Response({'detail': 'Invalid verification session.'}, status=status.HTTP_400_BAD_REQUEST)
    if challenge.used_at:
        return None, Response({'detail': 'This verification code has already been used.'}, status=status.HTTP_400_BAD_REQUEST)
    if challenge.is_expired:
        return None, Response({'detail': 'This verification code has expired. Please request a new one.'}, status=status.HTTP_400_BAD_REQUEST)
    return challenge, None


def _get_client_ip(request):
    forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded_for:
      return forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', 'unknown')


def _login_rate_limit_key(ip_address):
    return f'sm:login-attempts:{ip_address}'


def _register_login_attempt(ip_address):
    key = _login_rate_limit_key(ip_address)
    attempts = cache.get(key, 0)
    if attempts >= LOGIN_IP_LIMIT:
        return False, attempts
    cache.set(key, attempts + 1, LOGIN_IP_WINDOW_SECONDS)
    return True, attempts + 1


def _clear_login_attempts(ip_address):
    cache.delete(_login_rate_limit_key(ip_address))


def _is_numeric_id(value):
    return bool(value) and str(value).isdigit()


def _normalize_linkedin_member_id(value):
    if not value:
        return ''

    value = str(value).strip()
    if value.startswith('urn:li:person:'):
        return value.split(':')[-1]
    return value


def _normalize_linkedin_organization(value):
    if not value:
        return ''

    value = str(value).strip()
    if value.startswith('urn:li:organization:'):
        return value
    if value.isdigit():
        return f'urn:li:organization:{value}'
    return value


def _social_account_warnings(platform, platform_user_id, page_id, token):
    warnings = []

    if not token:
        warnings.append('Missing access token')

    if platform == 'instagram':
        if not _is_numeric_id(page_id):
            warnings.append('Instagram publishing needs a numeric Facebook Page ID')
        if not _is_numeric_id(platform_user_id):
            warnings.append('Instagram publishing needs a numeric Instagram Business Account ID')
    elif platform == 'facebook':
        publish_target = page_id or platform_user_id
        if not _is_numeric_id(publish_target):
            warnings.append('Facebook publishing needs a numeric Facebook Page ID')
    elif platform == 'linkedin':
        normalized_member = _normalize_linkedin_member_id(platform_user_id)
        normalized_org = _normalize_linkedin_organization(page_id)
        if not normalized_member and not normalized_org:
            warnings.append('LinkedIn publishing needs a member ID or organization URN/ID')
        elif '@' in normalized_member:
            warnings.append('LinkedIn publishing needs a member ID or organization URN, not an email address')
        elif 'linkedin.com/' in normalized_member or 'linkedin.com/' in normalized_org:
            warnings.append('LinkedIn publishing needs a numeric member ID or an organization URN/ID, not a profile URL')
    elif platform == 'youtube':
        if not str(platform_user_id or '').strip():
            warnings.append('YouTube Shorts publishing needs a channel ID or channel handle')
    elif platform == 'twitter':
        if not str(platform_user_id or '').strip():
            warnings.append('Twitter/X publishing needs a user ID or handle')

    return warnings


def _meta_app_credentials():
    return (
        os.environ.get('FACEBOOK_APP_ID')
        or os.environ.get('INSTAGRAM_APP_ID')
        or getattr(settings, 'FACEBOOK_APP_ID', '')
        or getattr(settings, 'INSTAGRAM_APP_ID', ''),
        os.environ.get('FACEBOOK_APP_SECRET')
        or os.environ.get('INSTAGRAM_APP_SECRET')
        or getattr(settings, 'FACEBOOK_APP_SECRET', '')
        or getattr(settings, 'INSTAGRAM_APP_SECRET', ''),
    )


def _meta_live_publish_warnings(platform, platform_user_id, page_id, token):
    platform = (platform or '').lower()
    if platform not in {'instagram', 'facebook'} or not token:
        return []

    target_id = platform_user_id if platform == 'instagram' else (page_id or platform_user_id)
    if not target_id:
        return []

    warnings = []
    try:
        with httpx.Client(timeout=10) as client:
            probe = client.get(
                f'https://graph.facebook.com/v18.0/{target_id}',
                params={'fields': 'id', 'access_token': token},
            )
            if probe.status_code >= 400:
                payload = probe.json()
                error = payload.get('error') if isinstance(payload, dict) else {}
                code = int((error or {}).get('code') or 0)
                message = str((error or {}).get('message') or 'Meta rejected this token.')
                if code == 190 or 'expired' in message.lower() or 'access token' in message.lower():
                    return ['Meta access token is expired or invalid. Reconnect Facebook / Instagram from Settings using Meta OAuth.']
                return [f'Meta token check failed: {message}']

            app_id, app_secret = _meta_app_credentials()
            if not app_id or not app_secret:
                return warnings

            debug = client.get(
                'https://graph.facebook.com/debug_token',
                params={
                    'input_token': token,
                    'access_token': f'{app_id}|{app_secret}',
                },
            )
            if debug.status_code >= 400:
                return warnings

            data = (debug.json() or {}).get('data') or {}
            if data.get('is_valid') is False:
                warnings.append('Meta access token is not valid. Reconnect Facebook / Instagram from Settings using Meta OAuth.')

            scopes = set(data.get('scopes') or [])
            for granular in data.get('granular_scopes') or []:
                scope = granular.get('scope')
                if scope:
                    scopes.add(scope)

            required = {'pages_manage_posts'}
            if platform == 'instagram':
                required.update({'instagram_content_publish', 'instagram_basic'})
            missing = sorted(scope for scope in required if scope not in scopes)
            if scopes and missing:
                warnings.append(
                    'Meta token is missing required publish permission(s): '
                    + ', '.join(missing)
                    + '. Reconnect with Meta OAuth and approve all requested permissions.'
                )
    except Exception as exc:
        logger.info('Meta live token check skipped: %s', exc)

    return warnings


def _domain_has_mx(domain: str) -> bool:
    """Return True if the domain has at least one MX record."""
    try:
        import dns.resolver
        dns.resolver.resolve(domain, 'MX', lifetime=5)
        return True
    except Exception:
        pass
    # Fallback: A-record check (catches completely non-existent domains)
    try:
        import socket
        socket.getaddrinfo(domain, None)
        return True
    except Exception:
        return False


def _smtp_validate_email(email: str):
    """
    Best-effort SMTP deliverability validation.
    Returns (is_deliverable, reason).
    """
    address = str(email or '').strip().lower()
    if not address or '@' not in address:
        return False, 'Enter a valid email address.'

    _display_name, parsed_email = parseaddr(address)
    candidate = parsed_email.strip().lower() if parsed_email else address
    if not candidate or '@' not in candidate:
        return False, 'Enter a valid email address.'

    local_part, domain = candidate.split('@', 1)
    if not local_part or not domain:
        return False, 'Enter a valid email address.'

    if not _domain_has_mx(domain):
        return False, 'This email address does not appear to be deliverable. Please use a valid email.'

    email_host = getattr(settings, 'EMAIL_HOST', '')
    if not email_host:
        return True, ''

    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', '') or getattr(settings, 'EMAIL_HOST_USER', '') or 'no-reply@socialmind.local'
    try:
        with smtplib.SMTP(email_host, getattr(settings, 'EMAIL_PORT', 587), timeout=10) as smtp:
            if getattr(settings, 'EMAIL_USE_TLS', False):
                smtp.starttls()

            username = getattr(settings, 'EMAIL_HOST_USER', '')
            password = getattr(settings, 'EMAIL_HOST_PASSWORD', '')
            if username and password:
                smtp.login(username, password)

            smtp.ehlo_or_helo_if_needed()
            smtp.mail(from_email)
            code, _ = smtp.rcpt(candidate)
            if code not in (250, 251):
                return False, 'This email address does not appear to be deliverable. Please use a valid email.'
    except Exception as exc:
        logger.warning('SMTP deliverability check failed for %s: %s', candidate, exc)
        return True, ''

    return True, ''


def _check_email_mx(email: str):
    """Fast check: format validation + MX record only (no SMTP handshake)."""
    address = str(email or '').strip().lower()
    if not address or '@' not in address:
        return False, 'Enter a valid email address.'
    _display_name, parsed_email = parseaddr(address)
    candidate = (parsed_email.strip().lower() if parsed_email else address)
    if not candidate or '@' not in candidate:
        return False, 'Enter a valid email address.'
    local_part, domain = candidate.split('@', 1)
    if not local_part or not domain:
        return False, 'Enter a valid email address.'
    if not _domain_has_mx(domain):
        return False, 'This email domain does not appear to be valid. Please use a real email address.'
    return True, ''


class CheckEmailView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        email = str(request.data.get('email', '')).strip().lower()
        if not email or '@' not in email:
            return Response({'exists': False, 'valid': False, 'deliverable': False, 'reason': 'Enter a valid email address.'})
        exists = User.objects.filter(email__iexact=email).exists()
        return Response({'exists': exists, 'valid': True, 'deliverable': True, 'reason': ''})


class PasswordResetStartView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        email = str(request.data.get('email', '')).strip().lower()
        if not email or '@' not in email:
            return Response({'detail': 'Enter a valid email address.'}, status=status.HTTP_400_BAD_REQUEST)
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if not user:
            return Response({'detail': 'No account found for this email address.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            challenge = _send_otp(user, purpose='password_reset', channel='email')
        except Exception as exc:
            import logging
            logging.getLogger(__name__).error('Password reset OTP send failed: %s', exc, exc_info=True)
            return Response(
                {'detail': 'Failed to send reset code. Please try again or contact support.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response({
            'message': 'Password reset code sent to your email.',
            **_otp_response_payload(challenge),
        }, status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        challenge_token = str(request.data.get('challenge_token', '')).strip()
        otp_code = str(request.data.get('otp', '')).strip()
        new_password = str(request.data.get('new_password', '')).strip()

        if not new_password or len(new_password) < 8:
            return Response({'detail': 'Password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)

        challenge, error_response = _get_valid_challenge(challenge_token, purpose='password_reset')
        if error_response:
            return error_response

        if challenge.code != otp_code:
            return Response({'detail': 'Incorrect verification code.'}, status=status.HTTP_400_BAD_REQUEST)

        challenge.used_at = timezone.now()
        challenge.save(update_fields=['used_at'])

        user = challenge.user
        user.set_password(new_password)
        user.save(update_fields=['password'])

        return Response(_issue_tokens_for_user(user), status=status.HTTP_200_OK)


class EmailOtpStartView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        email = str(request.data.get('email', '')).strip().lower()
        flow = str(request.data.get('flow', 'login')).strip().lower()

        if flow not in {'login', 'register'}:
            return Response({'detail': 'Invalid auth flow.'}, status=status.HTTP_400_BAD_REQUEST)

        if not email or '@' not in email:
            return Response({'detail': 'Enter a valid email address.'}, status=status.HTTP_400_BAD_REQUEST)

        deliverable, reason = _smtp_validate_email(email)
        if not deliverable:
            return Response({'detail': reason}, status=status.HTTP_400_BAD_REQUEST)

        existing_user = User.objects.filter(email__iexact=email).first()

        if flow == 'login':
            if not existing_user:
                return Response({'detail': 'No account found for this email address.'}, status=status.HTTP_404_NOT_FOUND)
            user = existing_user
            purpose = 'login'
        else:
            if existing_user:
                return Response({'detail': 'An account already exists for this email address.'}, status=status.HTTP_409_CONFLICT)

            local_part = email.split('@', 1)[0]
            username = _build_unique_username(local_part)
            user = User.objects.create_user(
                email=email,
                username=username,
                password=None,
                first_name='',
                last_name='',
            )
            user.set_unusable_password()
            user.is_active = False
            user.email_verified = False
            user.phone_verified = False
            user.save(update_fields=['password', 'is_active', 'email_verified', 'phone_verified'])
            purpose = 'register'

        challenge = _send_otp(user, purpose=purpose, channel='email')
        return Response({
            'message': 'OTP has been sent to your email',
            **_otp_response_payload(challenge),
        }, status=status.HTTP_200_OK)


class CheckUsernameView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        username = str(request.data.get('username', '')).strip()
        if not username:
            return Response({'taken': False})
        # Check ALL users (case-insensitive) to match the DB unique constraint
        taken = User.objects.filter(username__iexact=username).exists()
        return Response({'taken': taken})

class CleanupStuckAccountView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        email = str(request.data.get('email', '')).strip().lower()
        deleted, _ = User.objects.filter(email__iexact=email).delete()
        return Response({'deleted': deleted})
    

class RegisterView(generics.CreateAPIView):
    serializer_class = UserRegistrationSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        email = str(request.data.get('email', '')).strip().lower()

        if not email:
            return Response({'email': ['Email is required.']}, status=status.HTTP_400_BAD_REQUEST)

        # If email already exists and is active, tell user to login
        existing = User.objects.filter(email__iexact=email, is_active=True).first()
        if existing:
            return Response(
                {'email': ['An account with this email already exists. Please log in.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Clean up stale unverified registrations
        username = str(request.data.get('username', '')).strip()
        # Clean up stale unverified registrations
        User.objects.filter(email__iexact=email, is_active=False).delete()
        if username:
            User.objects.filter(username__iexact=username, is_active=False).delete()

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Activate immediately â€” no OTP needed
        user.is_active = True
        user.email_verified = True
        user.save(update_fields=['is_active', 'email_verified'])

        log_activity(user, 'register', detail=f'New account registered ({user.email})')
        return Response(_issue_tokens_for_user(user), status=status.HTTP_201_CREATED)


class RegisterVerifyOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        challenge_token = request.data.get('challenge_token', '').strip()
        otp_code = request.data.get('otp', '').strip()
        challenge, error_response = _get_valid_challenge(challenge_token, purpose='register')
        if error_response:
            return error_response
        if challenge.code != otp_code:
            return Response({'detail': 'Incorrect verification code.'}, status=status.HTTP_400_BAD_REQUEST)

        challenge.used_at = timezone.now()
        challenge.save(update_fields=['used_at'])

        user = challenge.user
        update_fields = ['is_active']
        username = str(request.data.get('username', '')).strip()
        password = str(request.data.get('password', '')).strip()

        if username and username.lower() != str(user.username or '').lower():
            if User.objects.filter(username__iexact=username).exclude(pk=user.pk).exists():
                return Response({'detail': 'This username is already taken. Try a new one.'}, status=status.HTTP_400_BAD_REQUEST)
            user.username = username
            update_fields.append('username')

        if password:
            if len(password) < 8:
                return Response({'detail': 'Password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)
            user.set_password(password)
            update_fields.append('password')

        user.is_active = True
        if challenge.channel == 'email':
            user.email_verified = True
            update_fields.append('email_verified')
        else:
            user.phone_verified = True
            update_fields.append('phone_verified')
        user.save(update_fields=update_fields)
        log_activity(user, 'register', detail=f'New account registered via email OTP ({user.email})')

        return Response(_issue_tokens_for_user(user), status=status.HTTP_200_OK)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        client_ip = _get_client_ip(request)
        allowed, attempts = _register_login_attempt(client_ip)
        if not allowed:
            return Response(
                {'detail': 'Too many login attempts from this IP. Try again later.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        identifier = request.data.get('email', '').strip()
        identifier_lookup = identifier.lower()
        password = request.data.get('password', '')

        user = authenticate(request, username=identifier_lookup, password=password)
        if not user:
            fallback_user = (
                User.objects.filter(email__iexact=identifier_lookup).first()
                or User.objects.filter(username__iexact=identifier).first()
            )
            if fallback_user and fallback_user.check_password(password):
                user = fallback_user
            else:
                return Response({'detail': 'Wrong username/email or password'}, status=status.HTTP_401_UNAUTHORIZED)

        if not user:
            return Response({'detail': 'Wrong username/email or password'}, status=status.HTTP_401_UNAUTHORIZED)

        if not user.is_active:
            user.is_active = True
            user.save(update_fields=['is_active'])

        _clear_login_attempts(client_ip)
        update_last_login(None, user)
        log_activity(user, 'login', detail='Logged in with password', ip_address=client_ip)
        return Response(_issue_tokens_for_user(user), status=status.HTTP_200_OK)


class LoginVerifyOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        challenge_token = request.data.get('challenge_token', '').strip()
        otp_code = request.data.get('otp', '').strip()
        challenge, error_response = _get_valid_challenge(challenge_token, purpose='login')
        if error_response:
            return error_response
        if challenge.code != otp_code:
            return Response({'detail': 'Incorrect verification code.'}, status=status.HTTP_400_BAD_REQUEST)

        challenge.used_at = timezone.now()
        challenge.save(update_fields=['used_at'])

        user = challenge.user
        if challenge.channel == 'email' and not user.email_verified:
            user.email_verified = True
            user.save(update_fields=['email_verified'])

        update_last_login(None, user)
        log_activity(user, 'login', detail='Logged in via email OTP')
        return Response(_issue_tokens_for_user(user), status=status.HTTP_200_OK)


class ProfileEmailOTPRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        contact = str(request.data.get('contact', '')).strip()
        if not contact:
            return Response({'detail': 'Email address is required.'}, status=status.HTTP_400_BAD_REQUEST)

        challenge = _send_profile_contact_otp(request.user, contact)
        return Response({
            'message': f'Verification code sent to {_mask_contact(challenge.channel, challenge.contact_value)}.',
            **_otp_response_payload(challenge),
        }, status=status.HTTP_200_OK)


class ProfileEmailOTPVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        challenge_token = request.data.get('challenge_token', '').strip()
        otp_code = request.data.get('otp', '').strip()
        challenge, error_response = _get_valid_challenge(challenge_token, purpose='profile_contact')
        if error_response:
            return error_response
        if challenge.user_id != request.user.id:
            return Response({'detail': 'Invalid verification session.'}, status=status.HTTP_400_BAD_REQUEST)
        if challenge.code != otp_code:
            return Response({'detail': 'Incorrect verification code.'}, status=status.HTTP_400_BAD_REQUEST)

        challenge.used_at = timezone.now()
        challenge.save(update_fields=['used_at'])

        current_user = challenge.user
        target_email = challenge.contact_value

        if target_email == str(current_user.email).strip().lower():
            current_user.email_verified = True
            current_user.is_active = True
            current_user.save(update_fields=['email_verified', 'is_active'])
            return Response(_issue_tokens_for_user(current_user), status=status.HTTP_200_OK)

        new_user = _get_or_create_workspace_account(target_email, source_user=current_user)
        if new_user.id == current_user.id:
            return Response(_issue_tokens_for_user(new_user), status=status.HTTP_200_OK)

        return Response(_issue_tokens_for_user(new_user), status=status.HTTP_200_OK)


class ProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        expire_user_subscription_if_needed(self.request.user)
        return self.request.user

    def perform_update(self, serializer):
        user = self.request.user
        old_email = user.email
        instance = serializer.save()
        changed_fields = [f for f in serializer.validated_data if f not in ('password', 'password_confirm')]
        detail = f'Profile updated: {", ".join(changed_fields)}' if changed_fields else 'Profile updated'
        action = 'email_changed' if instance.email != old_email else 'profile_updated'
        log_activity(instance, action, detail=detail, ip_address=_get_client_ip(self.request))


class DeleteAccountView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, *args, **kwargs):
        user = request.user
        user_id = user.id
        log_activity(user, 'account_deleted', detail=f'Account deleted for {user.email}', ip_address=_get_client_ip(request))
        user.delete()
        return Response(
            {'detail': 'Account deleted successfully.', 'id': user_id},
            status=status.HTTP_200_OK,
        )


class ConsumeVideoQuotaView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        user = request.user
        if user.quota_remaining <= 0:
            return Response(
                {'detail': 'Monthly quota exceeded. Upgrade your plan.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        User.objects.filter(pk=user.pk).update(
            videos_generated_this_month=F('videos_generated_this_month') + 1
        )
        user.refresh_from_db(fields=['videos_generated_this_month'])
        log_activity(
            user,
            'video_quota_consumed',
            detail=f'Video generated ({user.videos_generated_this_month}/{user.effective_monthly_video_quota})',
            metadata={
                'videos_generated_this_month': user.videos_generated_this_month,
                'monthly_video_quota': user.effective_monthly_video_quota,
            },
            ip_address=_get_client_ip(request),
        )

        return Response(UserProfileSerializer(user).data, status=status.HTTP_200_OK)


class PayPalConfigView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        plans = _paypal_plan_settings()
        return Response({
            'environment': getattr(settings, 'PAYPAL_ENVIRONMENT', 'sandbox'),
            'client_id': getattr(settings, 'PAYPAL_CLIENT_ID', ''),
            'plan_ids': {
                'pro': plans['pro']['paypal_plan_id'],
                'enterprise': plans['enterprise']['paypal_plan_id'],
            },
            'ready': bool(getattr(settings, 'PAYPAL_CLIENT_ID', '')),
        })


class PayPalSubscriptionApproveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        plan_key = str(request.data.get('plan_key', '')).strip().lower()
        subscription_id = str(request.data.get('subscription_id', '')).strip()

        plans = _paypal_plan_settings()
        plan = plans.get(plan_key)
        if not plan:
            return Response({'detail': 'Unknown subscription plan.'}, status=status.HTTP_400_BAD_REQUEST)
        if not plan['paypal_plan_id']:
            return Response({'detail': f'PayPal plan ID is not configured for {plan_key}.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if not subscription_id:
            return Response({'detail': 'PayPal subscription ID is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            details = _paypal_subscription_details(subscription_id)
        except PayPalConfigurationError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except httpx.HTTPStatusError as exc:
            logger.warning('PayPal subscription verification failed: %s', exc)
            return Response({'detail': 'PayPal could not verify this subscription.'}, status=status.HTTP_400_BAD_REQUEST)
        except httpx.HTTPError as exc:
            logger.warning('PayPal verification request failed: %s', exc)
            return Response({'detail': 'PayPal verification is temporarily unavailable.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        paypal_plan_id = str(details.get('plan_id') or '')
        if paypal_plan_id != plan['paypal_plan_id']:
            return Response({'detail': 'PayPal plan did not match the selected SocialMind plan.'}, status=status.HTTP_400_BAD_REQUEST)

        paypal_status = str(details.get('status') or '').upper()
        if paypal_status not in {'ACTIVE', 'APPROVED'}:
            return Response({'detail': f'PayPal subscription is {paypal_status or "not active"}.'}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        user.subscription_plan = plan['subscription_plan']
        user.monthly_video_quota = plan['monthly_video_quota']
        user.subscription_status = paypal_status.lower()
        user.paypal_subscription_id = subscription_id
        user.paypal_plan_id = paypal_plan_id
        user.subscription_started_at = timezone.now()
        user.save(update_fields=[
            'subscription_plan',
            'monthly_video_quota',
            'subscription_status',
            'paypal_subscription_id',
            'paypal_plan_id',
            'subscription_started_at',
            'updated_at',
        ])
        unblock_user_scheduled_content(user)
        log_activity(
            user,
            'subscription_activated',
            detail=f'Subscribed to {plan_key} plan via PayPal',
            metadata={'plan_key': plan_key, 'subscription_id': subscription_id, 'paypal_plan_id': paypal_plan_id},
            ip_address=_get_client_ip(request),
        )

        return Response({
            'user': UserProfileSerializer(user).data,
            'subscription': {
                'id': subscription_id,
                'status': paypal_status,
                'plan_key': plan_key,
            },
        }, status=status.HTTP_200_OK)


class LocalSubscriptionActivateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        if not settings.DEBUG:
            return Response({'detail': 'Local subscription activation is disabled.'}, status=status.HTTP_403_FORBIDDEN)

        raw_plan = str(request.data.get('plan') or request.data.get('plan_key') or 'pro').strip().lower()
        plan_key = 'enterprise' if 'enterprise' in raw_plan else 'pro'
        plans = _paypal_plan_settings()
        plan = plans[plan_key]

        user = request.user
        user.subscription_plan = plan['subscription_plan']
        user.monthly_video_quota = plan['monthly_video_quota']
        user.subscription_status = 'active'
        if not user.subscription_started_at:
            user.subscription_started_at = timezone.now()
        user.save(update_fields=[
            'subscription_plan',
            'monthly_video_quota',
            'subscription_status',
            'subscription_started_at',
            'updated_at',
        ])
        unblock_user_scheduled_content(user)
        log_activity(
            user,
            'subscription_activated',
            detail=f'Local subscription activated: {plan_key} plan',
            metadata={'plan_key': plan_key, 'source': 'local_checkout'},
            ip_address=_get_client_ip(request),
        )
        return Response({'user': UserProfileSerializer(user).data}, status=status.HTTP_200_OK)


class CancelSubscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        user = request.user

        if user.subscription_plan == 'free':
            return Response({'detail': 'You do not have an active subscription to cancel.'}, status=status.HTTP_400_BAD_REQUEST)
        if not user.subscription_started_at:
            return Response({'detail': 'Subscription start date is not recorded. Please contact support.'}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        if now >= user.subscription_started_at + timedelta(days=7):
            return Response({
                'detail': 'The 7-day cancellation window has expired. Cancellation is no longer available.',
                'popup_message': 'You can cancel only within 7 days of activation. That period has ended, so cancellation is disabled.',
                'can_cancel_subscription': False,
            }, status=status.HTTP_403_FORBIDDEN)

        plan_key = user.subscription_plan.lower()
        plan_price = PLAN_PRICES.get(plan_key, 0.0)
        monthly_quota = user.effective_monthly_video_quota or 1
        videos_used = user.videos_generated_this_month or 0
        cost_per_video = plan_price / monthly_quota if monthly_quota > 0 else 0
        usage_charge = round(cost_per_video * videos_used, 2)
        refund_amount = round(max(0.0, plan_price - usage_charge), 2)

        paypal_cancelled = False
        paypal_refunded = False
        refund_id = ''
        if user.paypal_subscription_id:
            try:
                token = _paypal_access_token()
                cancel_response = httpx.post(
                    f"{settings.PAYPAL_API_BASE_URL}/v1/billing/subscriptions/{user.paypal_subscription_id}/cancel",
                    json={'reason': 'Customer requested cancellation within 7-day window.'},
                    headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
                    timeout=15,
                )
                paypal_cancelled = cancel_response.status_code in (200, 204)
            except Exception as exc:
                logger.warning('PayPal subscription cancel API call failed: %s', exc)

        if refund_amount > 0 and user.paypal_last_payment_id:
            try:
                token = _paypal_access_token()
                refund_response = httpx.post(
                    f"{settings.PAYPAL_API_BASE_URL}/v1/payments/sale/{user.paypal_last_payment_id}/refund",
                    json={
                        'amount': {
                            'total': f'{refund_amount:.2f}',
                            'currency': user.paypal_last_payment_currency or 'USD',
                        },
                    },
                    headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
                    timeout=15,
                )
                paypal_refunded = refund_response.status_code in (200, 201)
                refund_id = str(refund_response.json().get('id', '')) if paypal_refunded else ''
            except Exception as exc:
                logger.warning('PayPal refund API call failed: %s', exc)

        user.subscription_plan = 'free'
        user.monthly_video_quota = 5
        user.subscription_status = 'cancelled'
        user.paypal_subscription_id = ''
        user.paypal_plan_id = ''
        user.subscription_started_at = None
        user.save(update_fields=[
            'subscription_plan',
            'monthly_video_quota',
            'subscription_status',
            'paypal_subscription_id',
            'paypal_plan_id',
            'subscription_started_at',
            'updated_at',
        ])
        blocked = block_user_scheduled_content(user, reason='subscription_cancelled')

        log_activity(
            user,
            'subscription_cancelled',
            detail=(
                f'Subscription cancelled within 7-day window. Videos used: {videos_used}, '
                f'Usage charge: ${usage_charge:.2f}, Refund: ${refund_amount:.2f}'
            ),
            metadata={
                'plan_key': plan_key,
                'plan_price': plan_price,
                'videos_used': videos_used,
                'subscription_plan': plan_key,
                'usage_charge': usage_charge,
                'refund_amount': refund_amount,
                'paypal_cancelled': paypal_cancelled,
                'paypal_refunded': paypal_refunded,
                'refund_id': refund_id,
                'blocked_scheduled_posts': blocked['posts'],
            },
            ip_address=_get_client_ip(request),
        )
        if refund_amount > 0:
            log_activity(
                user,
                'subscription_refunded',
                detail=f'Refund {"processed" if paypal_refunded else "calculated"}: ${refund_amount:.2f}',
                metadata={'refund_amount': refund_amount, 'refund_id': refund_id, 'paypal_refunded': paypal_refunded},
                ip_address=_get_client_ip(request),
            )

        return Response({
            'detail': 'Subscription cancelled successfully.',
            'user': UserProfileSerializer(user).data,
            'refund': {
                'subscription_plan': plan_key,
                'plan_price': plan_price,
                'monthly_video_quota': monthly_quota,
                'cost_per_video': round(cost_per_video, 2),
                'videos_used': videos_used,
                'usage_charge': usage_charge,
                'refund_amount': refund_amount,
                'currency': 'USD',
                'explanation': (
                    f'{plan_key.title()} plan price ${plan_price:.2f} minus '
                    f'${usage_charge:.2f} for {videos_used} created video(s) '
                    f'equals a refund of ${refund_amount:.2f}.'
                ),
            },
            'blocked_scheduled': blocked,
            'paypal_cancelled': paypal_cancelled,
            'paypal_refunded': paypal_refunded,
            'refund_id': refund_id,
        }, status=status.HTTP_200_OK)


class UserActivityLogView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user
        target_user_id = request.query_params.get('user_id')
        if target_user_id and user.is_staff:
            logs = UserActivityLog.objects.filter(user_id=target_user_id)
        else:
            logs = UserActivityLog.objects.filter(user=user)

        limit = min(int(request.query_params.get('limit', 100) or 100), 500)
        return Response([
            {
                'id': log.id,
                'user_id': log.user_id,
                'user_email': log.user_email,
                'action': log.action,
                'detail': log.detail,
                'metadata': log.metadata,
                'ip_address': log.ip_address,
                'created_at': log.created_at,
            }
            for log in logs[:limit]
        ], status=status.HTTP_200_OK)


class APIKeyViewSet(viewsets.ModelViewSet):
    serializer_class = APIKeySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return APIKeyConfig.objects.filter(user=self.request.user)

    @action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        """Test if an API key is valid"""
        api_key_config = self.get_object()
        service = api_key_config.service
        try:
            key = api_key_config.get_key()
            # Basic validation - in production, make a test API call
            if len(key) > 10:
                return Response({'valid': True, 'message': f'{service} API key appears valid'})
            return Response({'valid': False, 'message': 'Key too short'}, status=400)
        except Exception as e:
            return Response({'valid': False, 'message': str(e)}, status=400)


class SocialAccountViewSet(viewsets.ModelViewSet):
    serializer_class = SocialAccountSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return SocialAccount.objects.filter(user=self.request.user)

    @action(detail=False, methods=['get'])
    def by_platform(self, request):
        platform = request.query_params.get('platform')
        if platform:
            accounts = self.get_queryset().filter(platform=platform, is_active=True)
        else:
            accounts = self.get_queryset().filter(is_active=True)
        return Response(SocialAccountSerializer(accounts, many=True).data)

    @action(detail=True, methods=['post'])
    def disconnect(self, request, pk=None):
        account = self.get_object()
        account.is_active = False
        account.save()
        return Response({'message': f'{account.platform} account disconnected'})

    @action(detail=True, methods=['get'])
    def publish_status(self, request, pk=None):
        account = self.get_object()
        platform = account.platform

        try:
            token = account.get_access_token()
        except Exception:
            token = ''

        warnings = _social_account_warnings(
            platform=platform,
            platform_user_id=account.platform_user_id,
            page_id=account.page_id,
            token=token,
        )
        warnings.extend(_meta_live_publish_warnings(
            platform=platform,
            platform_user_id=account.platform_user_id,
            page_id=account.page_id,
            token=token,
        ))

        return Response({
            'platform': platform,
            'ready': len(warnings) == 0,
            'warnings': warnings,
        })

    @action(detail=False, methods=['post'])
    def connect_oauth(self, request):
        """Handle OAuth callback and store tokens"""
        platform = request.data.get('platform')
        access_token = request.data.get('access_token')
        platform_user_id = request.data.get('user_id')
        platform_username = request.data.get('username')
        platform_name = request.data.get('name', '')
        page_id = request.data.get('page_id', '')

        if platform == 'linkedin':
            platform_user_id = _normalize_linkedin_member_id(platform_user_id)
            page_id = _normalize_linkedin_organization(page_id)
            if not platform_user_id and page_id:
                platform_user_id = page_id
            if not platform_username:
                platform_username = platform_name or str(platform_user_id).split(':')[-1]
        elif platform == 'youtube':
            platform_user_id = str(platform_user_id or '').strip()
            if not platform_username:
                platform_username = platform_name or platform_user_id.split(':')[-1]

        if not platform or not access_token or not platform_user_id:
            return Response({'error': 'Missing required fields'}, status=400)

        warnings = _social_account_warnings(
            platform=platform,
            platform_user_id=platform_user_id,
            page_id=page_id,
            token=access_token,
        )
        warnings.extend(_meta_live_publish_warnings(
            platform=platform,
            platform_user_id=platform_user_id,
            page_id=page_id,
            token=access_token,
        ))
        if warnings:
            return Response({
                'error': 'Account is not publish-ready',
                'warnings': warnings,
            }, status=400)

        account, created = SocialAccount.objects.update_or_create(
            user=request.user,
            platform=platform,
            platform_user_id=platform_user_id,
            defaults={
                'platform_username': platform_username,
                'platform_name': platform_name,
                'is_active': True,
                'page_id': page_id,
            }
        )
        account.set_access_token(access_token)
        if request.data.get('refresh_token'):
            account.set_refresh_token(request.data['refresh_token'])
        if page_id:
            account.page_id = page_id
        account.save()

        return Response(SocialAccountSerializer(account).data, status=201 if created else 200)
