"""
PayPal Webhook Handler for SocialMind AI
-----------------------------------------
Handles these PayPal events automatically:
  - BILLING.SUBSCRIPTION.ACTIVATED   → upgrade user to paid plan
  - BILLING.SUBSCRIPTION.CANCELLED   → downgrade user to free
  - BILLING.SUBSCRIPTION.SUSPENDED   → suspend user (payment failed)
  - BILLING.SUBSCRIPTION.EXPIRED     → downgrade user to free
  - PAYMENT.SALE.COMPLETED           → log successful payment
  - PAYMENT.SALE.DENIED              → handle failed payment
"""

import hashlib
import hmac
import json
import logging

import requests
from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from apps.users.models import User, UserActivityLog
from apps.users.access_control import block_user_scheduled_content, unblock_user_scheduled_content

logger = logging.getLogger(__name__)

# ─── Plan quota mapping ───────────────────────────────────────────────────────

PLAN_QUOTA = {
    getattr(settings, 'PAYPAL_PRO_PLAN_ID', '').strip(): {
        'subscription_plan': 'pro',
        'monthly_video_quota': 50,
    },
    getattr(settings, 'PAYPAL_ENTERPRISE_PLAN_ID', '').strip(): {
        'subscription_plan': 'enterprise',
        'monthly_video_quota': 1_000_000,
    },
}

FREE_PLAN = {
    'subscription_plan': 'free',
    'monthly_video_quota': 5,
    'subscription_status': '',
    'paypal_subscription_id': '',
    'paypal_plan_id': '',
    'subscription_started_at': None,
}


def _log_activity(user, action, detail='', metadata=None):
    try:
        UserActivityLog.objects.create(
            user=user,
            user_email=user.email,
            action=action,
            detail=detail,
            metadata=metadata or {},
        )
    except Exception as exc:
        logger.warning('Failed to write user activity log: %s', exc)


# ─── PayPal signature verification ───────────────────────────────────────────

def _verify_paypal_webhook(request):
    """
    Verify the webhook actually came from PayPal using their verification API.
    Returns True if valid, False otherwise.
    """
    webhook_id = getattr(settings, 'PAYPAL_WEBHOOK_ID', '')
    if not webhook_id:
        # If no webhook ID configured, skip verification (not recommended for production)
        logger.warning('PAYPAL_WEBHOOK_ID not set — skipping signature verification!')
        return True

    try:
        # Get access token
        token_res = requests.post(
            f"{settings.PAYPAL_API_BASE_URL}/v1/oauth2/token",
            data='grant_type=client_credentials',
            auth=(settings.PAYPAL_CLIENT_ID, settings.PAYPAL_CLIENT_SECRET),
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            timeout=10,
        )
        token_res.raise_for_status()
        access_token = token_res.json()['access_token']

        # Verify webhook signature
        verify_res = requests.post(
            f"{settings.PAYPAL_API_BASE_URL}/v1/notifications/verify-webhook-signature",
            json={
                'auth_algo': request.headers.get('PAYPAL-AUTH-ALGO', ''),
                'cert_url': request.headers.get('PAYPAL-CERT-URL', ''),
                'transmission_id': request.headers.get('PAYPAL-TRANSMISSION-ID', ''),
                'transmission_sig': request.headers.get('PAYPAL-TRANSMISSION-SIG', ''),
                'transmission_time': request.headers.get('PAYPAL-TRANSMISSION-TIME', ''),
                'webhook_id': webhook_id,
                'webhook_event': json.loads(request.body),
            },
            headers={'Authorization': f'Bearer {access_token}'},
            timeout=10,
        )
        verify_res.raise_for_status()
        result = verify_res.json().get('verification_status', '')
        return result == 'SUCCESS'

    except Exception as exc:
        logger.error('PayPal webhook verification failed: %s', exc)
        return False


# ─── User helpers ─────────────────────────────────────────────────────────────

def _get_user_by_subscription(subscription_id):
    try:
        return User.objects.get(paypal_subscription_id=subscription_id)
    except User.DoesNotExist:
        return None


def _upgrade_user(user, plan_id, subscription_id, status='active'):
    plan = PLAN_QUOTA.get(plan_id.strip())
    if not plan:
        logger.warning('Unknown plan_id in webhook: %s', plan_id)
        return
    user.subscription_plan = plan['subscription_plan']
    user.monthly_video_quota = plan['monthly_video_quota']
    user.subscription_status = status
    user.paypal_subscription_id = subscription_id
    user.paypal_plan_id = plan_id
    if not user.subscription_started_at:
        user.subscription_started_at = timezone.now()
    user.save(update_fields=[
        'subscription_plan', 'monthly_video_quota',
        'subscription_status', 'paypal_subscription_id', 'paypal_plan_id',
        'subscription_started_at',
    ])
    unblock_user_scheduled_content(user)
    logger.info('User %s upgraded to %s', user.email, plan['subscription_plan'])
    _log_activity(
        user,
        'subscription_activated',
        detail=f'Subscription activated via PayPal webhook: {plan["subscription_plan"]} plan',
        metadata={'plan_id': plan_id, 'subscription_id': subscription_id, 'status': status},
    )


def _downgrade_user(user):
    for field, value in FREE_PLAN.items():
        setattr(user, field, value)
    user.save(update_fields=list(FREE_PLAN.keys()))
    block_user_scheduled_content(user, reason='subscription_inactive')
    logger.info('User %s downgraded to free plan', user.email)
    _log_activity(user, 'subscription_cancelled', detail='Subscription downgraded to free via PayPal webhook')


def _suspend_user(user):
    user.subscription_status = 'suspended'
    user.save(update_fields=['subscription_status'])
    block_user_scheduled_content(user, reason='subscription_suspended')
    logger.info('User %s subscription suspended', user.email)
    _log_activity(user, 'subscription_suspended', detail='Subscription suspended via PayPal webhook')


# ─── Event handlers ───────────────────────────────────────────────────────────

def _handle_subscription_activated(resource):
    subscription_id = resource.get('id', '')
    plan_id = resource.get('plan_id', '')
    user = _get_user_by_subscription(subscription_id)
    if user:
        _upgrade_user(user, plan_id, subscription_id, status='active')
    else:
        logger.warning('No user found for subscription %s', subscription_id)


def _handle_subscription_cancelled(resource):
    subscription_id = resource.get('id', '')
    user = _get_user_by_subscription(subscription_id)
    if user:
        _downgrade_user(user)
    else:
        logger.warning('No user found for cancelled subscription %s', subscription_id)


def _handle_subscription_suspended(resource):
    subscription_id = resource.get('id', '')
    user = _get_user_by_subscription(subscription_id)
    if user:
        _suspend_user(user)
    else:
        logger.warning('No user found for suspended subscription %s', subscription_id)


def _handle_subscription_expired(resource):
    subscription_id = resource.get('id', '')
    user = _get_user_by_subscription(subscription_id)
    if user:
        _downgrade_user(user)
    else:
        logger.warning('No user found for expired subscription %s', subscription_id)


def _handle_payment_completed(resource):
    subscription_id = resource.get('billing_agreement_id', '')
    amount = resource.get('amount', {}).get('total', '?')
    currency = resource.get('amount', {}).get('currency', '')
    payment_id = resource.get('id', '')
    user = _get_user_by_subscription(subscription_id)
    if user:
        user.paypal_last_payment_id = payment_id
        user.paypal_last_payment_currency = currency or 'USD'
        update_fields = ['paypal_last_payment_id', 'paypal_last_payment_currency']
        if user.subscription_status != 'active':
            user.subscription_status = 'active'
            update_fields.append('subscription_status')
        user.save(update_fields=update_fields)
        logger.info('Payment completed for user %s: %s %s', user.email, amount, currency)
        _log_activity(
            user,
            'payment_completed',
            detail=f'PayPal payment completed: {amount} {currency}',
            metadata={'amount': amount, 'currency': currency, 'subscription_id': subscription_id, 'payment_id': payment_id},
        )
    else:
        logger.warning('Payment completed but no user for subscription %s', subscription_id)


def _handle_payment_denied(resource):
    subscription_id = resource.get('billing_agreement_id', '')
    user = _get_user_by_subscription(subscription_id)
    if user:
        _suspend_user(user)
        logger.warning('Payment denied for user %s', user.email)
        _log_activity(user, 'payment_failed', detail='PayPal payment denied', metadata={'subscription_id': subscription_id})


# ─── Main webhook view ────────────────────────────────────────────────────────

EVENT_HANDLERS = {
    'BILLING.SUBSCRIPTION.ACTIVATED': _handle_subscription_activated,
    'BILLING.SUBSCRIPTION.CANCELLED': _handle_subscription_cancelled,
    'BILLING.SUBSCRIPTION.SUSPENDED': _handle_subscription_suspended,
    'BILLING.SUBSCRIPTION.EXPIRED':   _handle_subscription_expired,
    'PAYMENT.SALE.COMPLETED':         _handle_payment_completed,
    'PAYMENT.SALE.DENIED':            _handle_payment_denied,
}


@csrf_exempt
@require_POST
def paypal_webhook(request):
    # 1. Verify it's really from PayPal
    if not _verify_paypal_webhook(request):
        logger.warning('PayPal webhook signature verification failed')
        return HttpResponse(status=400)

    # 2. Parse the event
    try:
        payload = json.loads(request.body)
    except json.JSONDecodeError:
        return HttpResponse(status=400)

    event_type = payload.get('event_type', '')
    resource = payload.get('resource', {})

    logger.info('PayPal webhook received: %s', event_type)

    # 3. Handle the event
    handler = EVENT_HANDLERS.get(event_type)
    if handler:
        try:
            handler(resource)
        except Exception as exc:
            logger.exception('Error handling PayPal event %s: %s', event_type, exc)
            return HttpResponse(status=500)
    else:
        logger.info('Unhandled PayPal event type: %s', event_type)

    # Always return 200 so PayPal doesn't keep retrying
    return HttpResponse(status=200)
