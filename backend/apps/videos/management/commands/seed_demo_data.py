from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = 'Seed the database with demo data'

    def handle(self, *args, **kwargs):
        from django.contrib.auth import get_user_model
        from apps.videos.models import VideoProject, VideoTemplate

        User = get_user_model()

        # Create demo user
        user = User.objects.filter(email='demo@socialmind.dev').first()
        if not user:
            user = User.objects.filter(username='demo_user').first()

        created = False
        if not user:
            user = User.objects.create_user(
                email='demo@socialmind.dev',
                username='demo_user',
                first_name='Demo',
                last_name='User',
                subscription_plan='enterprise',
                monthly_video_quota=1000000,
                password='demo1234',
            )
            created = True
            self.stdout.write(self.style.SUCCESS('Created demo user: demo@socialmind.dev / demo1234'))
        else:
            updated = False
            if user.first_name != 'Demo':
                user.first_name = 'Demo'
                updated = True
            if user.last_name != 'User':
                user.last_name = 'User'
                updated = True
            if user.subscription_plan != 'enterprise':
                user.subscription_plan = 'enterprise'
                updated = True
            if user.monthly_video_quota != 1000000:
                user.monthly_video_quota = 1000000
                updated = True
            if not user.has_usable_password() or not user.check_password('demo1234'):
                user.set_password('demo1234')
                updated = True
            if updated:
                user.save()
                self.stdout.write('Updated demo user')
            else:
                self.stdout.write('Demo user already exists')

        if created:
            user.set_password('demo1234')
            user.save()

        # Create sample video templates
        templates = [
            {'name': 'Product Launch', 'description': 'Perfect for announcing new products', 'content_type': 'promotional', 'template_data': {'theme': 'professional'}, 'is_public': True},
            {'name': 'Tutorial Explainer', 'description': 'Step-by-step educational content', 'content_type': 'educational', 'template_data': {'theme': 'minimal'}, 'is_public': True},
            {'name': 'Brand Story', 'description': 'Tell your brand story in 60 seconds', 'content_type': 'story', 'template_data': {'theme': 'dark'}, 'is_public': True},
        ]

        for t in templates:
            VideoTemplate.objects.get_or_create(name=t['name'], defaults={**t, 'created_by': user})

        self.stdout.write(self.style.SUCCESS(f'Created {len(templates)} video templates'))

        # Create sample video projects - ALWAYS provide ai_script (no None values)
        sample_projects = [
            {
                'title': 'Summer Sale 2025 Campaign',
                'topic': 'Our biggest summer sale with 50% off all products',
                'content_type': 'promotional',
                'tone': 'energetic',
                'duration_seconds': 30,
                'status': 'published',
                'is_demo_seed': True,
                'ai_script': 'Summer is here and so are our biggest deals! Get 50% off everything this weekend only. Shop now before it\'s too late!',
                'ai_caption': '☀️ Summer Sale is HERE! 50% off EVERYTHING this weekend only!',
                'ai_hashtags': ['#SummerSale', '#50PercentOff', '#ShopNow'],
            },
            {
                'title': 'How to Use Our App — Onboarding',
                'topic': 'Step-by-step guide for new users to get started',
                'content_type': 'tutorial',
                'tone': 'professional',
                'duration_seconds': 60,
                'status': 'approved',
                'is_demo_seed': True,
                'ai_script': 'Welcome! In just 3 steps you can be up and running. Step 1: Create your account. Step 2: Set up your profile. Step 3: Explore features.',
                'ai_caption': '🚀 New? Here\'s how to get started in 3 easy steps!',
                'ai_hashtags': ['#Tutorial', '#HowTo', '#GetStarted'],
            },
            {
                'title': 'Q3 2025 Product Announcement',
                'topic': 'Announcing our new AI-powered feature for enterprise customers',
                'content_type': 'announcement',
                'tone': 'professional',
                'duration_seconds': 45,
                'status': 'review',
                'is_demo_seed': True,
                'ai_script': 'We are thrilled to announce our most powerful feature yet. Introducing AI-powered automation that works 24/7.',
                'ai_caption': '🎉 Big announcement! Something incredible is finally here.',
                'ai_hashtags': ['#Announcement', '#NewFeature', '#AI'],
            },
            {
                'title': 'Customer Success Story',
                'topic': 'How a client increased revenue by 300% using our platform',
                'content_type': 'testimonial',
                'tone': 'inspirational',
                'duration_seconds': 30,
                'status': 'draft',
                'is_demo_seed': True,
                'ai_script': '',  # Empty string instead of None
                'ai_caption': '',
                'ai_hashtags': [],
            },
        ]

        for p_data in sample_projects:
            proj, created = VideoProject.objects.get_or_create(
                user=user,
                title=p_data['title'],
                defaults={
                    'topic': p_data['topic'],
                    'content_type': p_data['content_type'],
                    'tone': p_data['tone'],
                    'duration_seconds': p_data['duration_seconds'],
                    'status': p_data['status'],
                    'is_demo_seed': p_data.get('is_demo_seed', False),
                    'ai_script': p_data.get('ai_script', ''),
                    'ai_caption': p_data.get('ai_caption', ''),
                    'ai_hashtags': p_data.get('ai_hashtags', []),
                    'ai_service': 'openai',
                    'approved_at': timezone.now() if p_data['status'] in ['approved', 'published'] else None,
                }
            )
            if created:
                self.stdout.write(f'  Created project: {proj.title} [{proj.status}]')

        self.stdout.write(self.style.SUCCESS('\n✅ Demo data seeded successfully!'))
        self.stdout.write('Login at http://localhost:3000')
        self.stdout.write('  Email: demo@socialmind.dev')
        self.stdout.write('  Password: demo1234')
