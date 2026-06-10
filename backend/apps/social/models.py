from django.db import models
from django.conf import settings
from apps.videos.models import VideoProject
from apps.users.models import SocialAccount
import uuid


class ScheduledPost(models.Model):
    """A post scheduled to go out to a specific platform"""
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('scheduled', 'Scheduled'),
        ('publishing', 'Publishing'),
        ('published', 'Published'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
        ('blocked', 'Blocked'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='scheduled_posts')
    project = models.ForeignKey(VideoProject, on_delete=models.CASCADE, related_name='scheduled_posts')
    social_account = models.ForeignKey(SocialAccount, on_delete=models.CASCADE, related_name='scheduled_posts')

    # Override caption/hashtags per platform
    custom_caption = models.TextField(blank=True)
    custom_hashtags = models.JSONField(default=list)

    # Platform subtype (e.g. 'shorts' for YouTube Shorts, 'reels' for Instagram Reels)
    platform_subtype = models.CharField(max_length=20, blank=True, default='')

    # Scheduling
    scheduled_at = models.DateTimeField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='scheduled')

    # Results
    published_at = models.DateTimeField(null=True, blank=True)
    platform_post_id = models.CharField(max_length=255, blank=True)
    platform_url = models.URLField(blank=True)
    error_message = models.TextField(blank=True)
    celery_task_id = models.CharField(max_length=255, blank=True)

    # Analytics
    likes_count = models.IntegerField(default=0)
    comments_count = models.IntegerField(default=0)
    shares_count = models.IntegerField(default=0)
    views_count = models.IntegerField(default=0)
    reach = models.IntegerField(default=0)
    analytics_updated_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'scheduled_posts'
        ordering = ['-scheduled_at']

    def __str__(self):
        return f"{self.project.title} -> {self.social_account.platform} @ {self.scheduled_at}"

    @property
    def final_caption(self):
        return self.custom_caption or self.project.final_caption

    @property
    def final_hashtags(self):
        return self.custom_hashtags or self.project.final_hashtags

    @property
    def platform(self):
        return self.social_account.platform


class PublishLog(models.Model):
    """Audit log of all publish attempts"""
    scheduled_post = models.ForeignKey(ScheduledPost, on_delete=models.CASCADE, related_name='publish_logs')
    success = models.BooleanField()
    response_data = models.JSONField(default=dict)
    error_message = models.TextField(blank=True)
    attempt_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'publish_logs'
        ordering = ['-attempt_at']


class PostAnalytics(models.Model):
    """Detailed analytics snapshots for published posts"""
    scheduled_post = models.ForeignKey(ScheduledPost, on_delete=models.CASCADE, related_name='analytics')
    snapshot_at = models.DateTimeField(auto_now_add=True)
    likes = models.IntegerField(default=0)
    comments = models.IntegerField(default=0)
    shares = models.IntegerField(default=0)
    views = models.IntegerField(default=0)
    reach = models.IntegerField(default=0)
    engagement_rate = models.FloatField(default=0)
    raw_data = models.JSONField(default=dict)

    class Meta:
        db_table = 'post_analytics'
        ordering = ['-snapshot_at']


class PostActivityEvent(models.Model):
    """Manual activity events recorded by the app, such as in-app shares."""
    EVENT_CHOICES = [
        ('share', 'Share'),
    ]

    scheduled_post = models.ForeignKey(ScheduledPost, on_delete=models.CASCADE, related_name='activity_events')
    event_type = models.CharField(max_length=20, choices=EVENT_CHOICES)
    platform = models.CharField(max_length=30, blank=True)
    actor_name = models.CharField(max_length=255, blank=True)
    actor_id = models.CharField(max_length=255, blank=True)
    detail = models.CharField(max_length=255, blank=True)
    target_url = models.URLField(blank=True)
    analytics_target = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'post_activity_events'
        ordering = ['-created_at']
