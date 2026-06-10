from django.db import models
from django.conf import settings
import uuid


class VideoProject(models.Model):
    """Main video project container"""
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('generating', 'Generating'),
        ('review', 'Ready for Review'),
        ('approved', 'Approved'),
        ('scheduled', 'Scheduled'),
        ('publishing', 'Publishing'),
        ('published', 'Published'),
        ('failed', 'Failed'),
        ('blocked', 'Blocked'),
    ]

    CONTENT_TYPES = [
        ('promotional', 'Promotional'),
        ('educational', 'Educational'),
        ('entertainment', 'Entertainment'),
        ('announcement', 'Announcement'),
        ('testimonial', 'Testimonial'),
        ('tutorial', 'Tutorial'),
        ('story', 'Story'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='video_projects')
    title = models.CharField(max_length=255)
    is_demo_seed = models.BooleanField(default=False)
    description = models.TextField(blank=True)
    content_type = models.CharField(max_length=30, choices=CONTENT_TYPES, default='promotional')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')

    # AI Generation inputs
    topic = models.TextField(help_text='What the video should be about')
    target_audience = models.CharField(max_length=255, blank=True)
    tone = models.CharField(max_length=50, blank=True,
                           help_text='professional, casual, energetic, calm, etc.')
    duration_seconds = models.IntegerField(default=30)
    ai_service = models.CharField(max_length=30, default='openai',
                                  help_text='Which AI service to use for generation')

    # Generated content
    ai_script = models.TextField(blank=True)
    ai_caption = models.TextField(blank=True)
    ai_hashtags = models.JSONField(default=list)
    ai_keywords = models.JSONField(default=list)

    # Video file
    video_file = models.FileField(upload_to='videos/generated/', null=True, blank=True)
    thumbnail = models.ImageField(upload_to='thumbnails/', null=True, blank=True)
    video_url = models.URLField(blank=True)  # S3 URL
    thumbnail_url = models.URLField(blank=True)

    # Video metadata
    duration_actual = models.FloatField(null=True, blank=True)
    file_size = models.BigIntegerField(null=True, blank=True)
    resolution = models.CharField(max_length=20, blank=True)
    format = models.CharField(max_length=10, blank=True, default='mp4')

    # User edits
    edited_caption = models.TextField(blank=True)
    edited_hashtags = models.JSONField(default=list)
    platform_captions = models.JSONField(default=dict)
    platform_hashtags = models.JSONField(default=dict)
    platform_titles = models.JSONField(default=dict)
    platform_video_paths = models.JSONField(default=dict)
    user_notes = models.TextField(blank=True)

    # Celery task tracking
    generation_task_id = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'video_projects'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} ({self.status})"

    @property
    def final_caption(self):
        return self.edited_caption or self.ai_caption

    @property
    def final_hashtags(self):
        return self.edited_hashtags or self.ai_hashtags


class VideoTemplate(models.Model):
    """Reusable video templates"""
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    content_type = models.CharField(max_length=30)
    template_data = models.JSONField(default=dict,
                                     help_text='Template config: colors, fonts, transitions, etc.')
    preview_url = models.URLField(blank=True)
    is_public = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'video_templates'

    def __str__(self):
        return self.name


class VideoAsset(models.Model):
    """Media assets attached to a video project"""
    ASSET_TYPES = [
        ('background', 'Background Video/Image'),
        ('logo', 'Logo/Watermark'),
        ('music', 'Background Music'),
        ('voiceover', 'Voiceover Audio'),
        ('font', 'Custom Font'),
        ('overlay', 'Overlay Image'),
    ]

    project = models.ForeignKey(VideoProject, on_delete=models.CASCADE, related_name='assets')
    asset_type = models.CharField(max_length=30, choices=ASSET_TYPES)
    file = models.FileField(upload_to='assets/')
    file_url = models.URLField(blank=True)
    original_filename = models.CharField(max_length=255)
    file_size = models.BigIntegerField(null=True)
    mime_type = models.CharField(max_length=100, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'video_assets'


class GenerationLog(models.Model):
    """Log of AI generation attempts"""
    project = models.ForeignKey(VideoProject, on_delete=models.CASCADE, related_name='generation_logs')
    ai_service = models.CharField(max_length=30)
    prompt_used = models.TextField()
    response_data = models.JSONField(default=dict)
    tokens_used = models.IntegerField(null=True)
    cost_estimate = models.DecimalField(max_digits=10, decimal_places=6, null=True)
    success = models.BooleanField(default=False)
    error_message = models.TextField(blank=True)
    duration_seconds = models.FloatField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'generation_logs'
        ordering = ['-created_at']
