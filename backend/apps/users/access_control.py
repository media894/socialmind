from django.db.models import Q
from django.utils import timezone
from datetime import timedelta

SUBSCRIPTION_ACTIVE_DAYS = 30
FREE_SCHEDULE_LIMIT = 20
ACTIVE_SUBSCRIPTION_VIDEO_QUOTA = 50
ADMIN_EMAIL = 'demo@socialmind.dev'


def expire_user_subscription_if_needed(user):
    if not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'subscription_plan', 'free') == 'free':
        return False
    if getattr(user, 'subscription_status', '') == 'expired':
        return True
    # If the user has an active PayPal subscription ID, never auto-expire —
    # PayPal manages the renewal cycle; expiry is handled via webhook only.
    if getattr(user, 'paypal_subscription_id', ''):
        return False
    started_at = getattr(user, 'subscription_started_at', None)
    if not started_at:
        return False
    if timezone.now() < started_at + timedelta(days=SUBSCRIPTION_ACTIVE_DAYS):
        return False

    from apps.users.models import UserActivityLog

    plan_key = user.subscription_plan
    user.subscription_plan = 'free'
    user.monthly_video_quota = 5
    user.subscription_status = 'expired'
    user.paypal_subscription_id = ''
    user.paypal_plan_id = ''
    user.save(update_fields=[
        'subscription_plan',
        'monthly_video_quota',
        'subscription_status',
        'paypal_subscription_id',
        'paypal_plan_id',
        'updated_at',
    ])
    blocked = block_user_scheduled_content(user, reason='subscription_expired')
    try:
        UserActivityLog.objects.create(
            user=user,
            user_email=user.email,
            action='subscription_expired',
            detail=f'{plan_key.title()} subscription expired after {SUBSCRIPTION_ACTIVE_DAYS} days.',
            metadata={
                'previous_plan': plan_key,
                'subscription_started_at': started_at.isoformat(),
                'blocked_scheduled_posts': blocked['posts'],
                'blocked_projects': blocked['projects'],
            },
        )
    except Exception:
        pass
    return True


def user_has_video_access(user):
    if not getattr(user, 'is_authenticated', False):
        return False
    if expire_user_subscription_if_needed(user):
        return False
    if getattr(user, 'subscription_status', '') == 'expired':
        return False
    if user_has_active_subscription(user):
        return getattr(user, 'videos_generated_this_month', 0) < active_video_quota(user)
    return getattr(user, 'quota_remaining', 0) > 0


def active_video_quota(user):
    quota = getattr(user, 'effective_monthly_video_quota', None)
    if quota is None:
        quota = getattr(user, 'monthly_video_quota', 0)
    return max(int(quota or 0), ACTIVE_SUBSCRIPTION_VIDEO_QUOTA)


def access_denied_response_payload(user):
    has_active_subscription = user_has_active_subscription(user)
    quota = active_video_quota(user) if has_active_subscription else getattr(user, 'effective_monthly_video_quota', 5)
    used = getattr(user, 'videos_generated_this_month', 0)
    plan = getattr(user, 'subscription_plan', 'free')
    if getattr(user, 'subscription_status', '') == 'expired':
        detail = 'Your subscription has expired after 30 days. Renew your plan to create or schedule videos.'
    elif plan == 'free' and not has_active_subscription:
        detail = 'Free video limit reached. Subscribe to unlock scheduled pages and create up to 50 videos.'
    else:
        detail = 'Monthly video quota reached. Scheduled pages are blocked until your quota renews or your plan is upgraded.'
    return {
        'detail': detail,
        'plan': plan,
        'videos_created': used,
        'monthly_video_quota': quota,
    }


def user_has_active_subscription(user):
    if not getattr(user, 'is_authenticated', False):
        return False
    if str(getattr(user, 'email', '')).strip().lower() == ADMIN_EMAIL:
        return True
    status = str(getattr(user, 'subscription_status', '') or '').strip().lower()
    if status == 'expired':
        return False
    # If the user has an active PayPal subscription ID, they are subscribed.
    # Do not run the local expiry check in this case — PayPal webhooks handle it.
    if getattr(user, 'paypal_subscription_id', ''):
        return True
    if status in {'active', 'approved'} and active_video_quota(user) >= ACTIVE_SUBSCRIPTION_VIDEO_QUOTA:
        return True
    if expire_user_subscription_if_needed(user):
        return False
    plan = getattr(user, 'subscription_plan', 'free')
    return plan != 'free'


def scheduled_posts_this_month(user):
    from apps.social.models import ScheduledPost

    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return ScheduledPost.objects.filter(
        user=user,
        created_at__gte=month_start,
    ).exclude(status='cancelled').count()


def schedule_access_denied_response_payload(user, requested_count=1):
    used = scheduled_posts_this_month(user)
    return {
        'detail': 'Free schedule limit reached. Subscribe to schedule more than 20 videos this month.',
        'plan': getattr(user, 'subscription_plan', 'free'),
        'scheduled_this_month': used,
        'monthly_schedule_quota': FREE_SCHEDULE_LIMIT,
        'requested_schedules': requested_count,
    }


def enforce_schedule_access(user, requested_count=1):
    if user_has_active_subscription(user):
        return True, None
    used = scheduled_posts_this_month(user)
    if used + max(1, int(requested_count or 1)) <= FREE_SCHEDULE_LIMIT:
        return True, None
    return False, schedule_access_denied_response_payload(user, requested_count)


def enforce_analytics_access(user):
    if user_has_active_subscription(user):
        return True, None
    return False, {
        'detail': 'Analytics are available with an active subscription.',
        'plan': getattr(user, 'subscription_plan', 'free'),
    }


def block_user_scheduled_content(user, reason='quota_limit'):
    from apps.social.models import ScheduledPost
    from apps.videos.models import VideoProject

    now = timezone.now()
    posts = ScheduledPost.objects.filter(
        user=user,
        status='scheduled',
    )
    for post in posts:
        if post.celery_task_id:
            try:
                from config.celery import app
                app.control.revoke(post.celery_task_id, terminate=True)
            except Exception:
                pass

    blocked_posts = posts.update(
        status='blocked',
        error_message='Blocked because account access is inactive or the video quota is exhausted.',
        updated_at=now,
    )
    blocked_projects = VideoProject.objects.filter(
        user=user,
        status='scheduled',
        scheduled_posts__status='blocked',
    ).distinct().update(status='blocked', updated_at=now)
    return {'posts': blocked_posts, 'projects': blocked_projects, 'reason': reason}


def unblock_user_scheduled_content(user):
    from apps.social.models import ScheduledPost
    from apps.videos.models import VideoProject
    from apps.social.views import ScheduledPostViewSet

    now = timezone.now()
    posts = list(ScheduledPost.objects.filter(
        user=user,
        status='blocked',
        scheduled_at__gt=now,
    ).select_related('project', 'social_account'))

    for post in posts:
        post.status = 'scheduled'
        post.error_message = ''
        post.save(update_fields=['status', 'error_message', 'updated_at'])
        try:
            ScheduledPostViewSet()._queue_scheduled_post(post)
        except Exception:
            pass

    projects = VideoProject.objects.filter(
        Q(status='blocked'),
        user=user,
        scheduled_posts__status='scheduled',
    ).distinct().update(status='scheduled', updated_at=now)
    return {'posts': len(posts), 'projects': projects}


def enforce_video_access(user):
    if user_has_video_access(user):
        return True, None
    reason = 'subscription_expired' if getattr(user, 'subscription_status', '') == 'expired' else 'quota_limit'
    block_user_scheduled_content(user, reason=reason)
    return False, access_denied_response_payload(user)
