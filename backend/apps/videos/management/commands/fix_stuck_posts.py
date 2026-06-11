from django.core.management.base import BaseCommand
from apps.social.models import ScheduledPost

class Command(BaseCommand):
    def handle(self, *args, **kwargs):
        count = ScheduledPost.objects.filter(status='publishing').update(status='scheduled')
        self.stdout.write(f'Reset {count} stuck posts to scheduled')