"""
AI service integrations for script and content generation.
Supports OpenAI (ChatGPT), DeepSeek, and extensible to others.
"""
import os
import time
import logging
from abc import ABC, abstractmethod
from typing import Optional
import httpx

logger = logging.getLogger(__name__)


class AIServiceBase(ABC):
    """Base class for AI service integrations"""

    @abstractmethod
    def generate_script(self, topic: str, duration: int, tone: str,
                        audience: str, content_type: str) -> dict:
        pass

    @abstractmethod
    def generate_caption(self, script: str, platform: str) -> str:
        pass

    @abstractmethod
    def generate_hashtags(self, topic: str, platform: str, count: int = 10) -> list:
        pass


class OpenAIService(AIServiceBase):
    """ChatGPT / OpenAI integration"""

    def __init__(self, api_key: str, model: str = 'gpt-4o'):
        self.api_key = api_key
        self.model = model
        self.base_url = 'https://api.openai.com/v1'

    def _chat(self, messages: list, max_tokens: int = 2000) -> dict:
        start = time.time()
        with httpx.Client(timeout=60) as client:
            response = client.post(
                f'{self.base_url}/chat/completions',
                headers={'Authorization': f'Bearer {self.api_key}',
                         'Content-Type': 'application/json'},
                json={'model': self.model, 'messages': messages, 'max_tokens': max_tokens}
            )
            response.raise_for_status()
            data = response.json()
            data['_duration'] = time.time() - start
            return data

    def generate_script(self, topic: str, duration: int = 30, tone: str = 'professional',
                        audience: str = 'general', content_type: str = 'promotional') -> dict:
        word_count = duration * 2  # ~2 words/second for narration

        system_prompt = """You are an expert social media video scriptwriter. 
        Create engaging, concise scripts optimized for social media videos.
        Format your response as JSON with keys: 'script', 'scenes', 'narration', 'hooks'
        - script: full narration text
        - scenes: list of scene descriptions with timing
        - narration: formatted for TTS
        - hooks: 3 attention-grabbing opening variations"""

        user_prompt = f"""Create a {duration}-second {content_type} video script about: {topic}
        Target audience: {audience}
        Tone: {tone}
        Word count target: ~{word_count} words
        Make it compelling, shareable, and platform-optimized for Instagram/Facebook/LinkedIn."""

        try:
            result = self._chat([
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt}
            ])
            content = result['choices'][0]['message']['content']
            # Try to parse JSON, fallback to raw text
            try:
                import json
                parsed = json.loads(content)
            except Exception:
                parsed = {'script': content, 'scenes': [], 'narration': content, 'hooks': []}
            parsed['_tokens'] = result.get('usage', {}).get('total_tokens', 0)
            parsed['_duration'] = result.get('_duration', 0)
            return parsed
        except Exception as e:
            logger.error(f"OpenAI script generation failed: {e}")
            raise

    def generate_caption(self, script: str, platform: str = 'instagram') -> str:
        platform_limits = {
            'instagram': 2200, 'facebook': 63206, 'linkedin': 3000
        }
        limit = platform_limits.get(platform, 2200)

        result = self._chat([{
            'role': 'user',
            'content': f"""Write an engaging {platform} caption for this video script.
            Max length: {limit} characters. Include relevant emojis.
            Make it engaging with a clear CTA.
            
            Script: {script[:1000]}"""
        }], max_tokens=500)
        return result['choices'][0]['message']['content'].strip()

    def generate_hashtags(self, topic: str, platform: str = 'instagram', count: int = 10) -> list:
        result = self._chat([{
            'role': 'user',
            'content': f"""Generate {count} highly relevant hashtags for {platform} 
            about: {topic}
            Return ONLY the hashtags, one per line, with # symbol."""
        }], max_tokens=300)
        text = result['choices'][0]['message']['content']
        tags = [line.strip() for line in text.split('\n') if line.strip().startswith('#')]
        return tags[:count]


class DeepSeekService(AIServiceBase):
    """DeepSeek AI integration"""

    def __init__(self, api_key: str, model: str = 'deepseek-chat'):
        self.api_key = api_key
        self.model = model
        self.base_url = 'https://api.deepseek.com/v1'

    def _chat(self, messages: list, max_tokens: int = 2000) -> dict:
        with httpx.Client(timeout=60) as client:
            response = client.post(
                f'{self.base_url}/chat/completions',
                headers={'Authorization': f'Bearer {self.api_key}',
                         'Content-Type': 'application/json'},
                json={'model': self.model, 'messages': messages, 'max_tokens': max_tokens}
            )
            response.raise_for_status()
            return response.json()

    def generate_script(self, topic: str, duration: int = 30, tone: str = 'professional',
                        audience: str = 'general', content_type: str = 'promotional') -> dict:
        word_count = duration * 2
        result = self._chat([{
            'role': 'system',
            'content': 'You are an expert social media video scriptwriter. Return JSON only.'
        }, {
            'role': 'user',
            'content': f"""Create a {duration}-second {content_type} video script about: {topic}
            Audience: {audience}, Tone: {tone}, Words: ~{word_count}
            JSON format: {{"script": "...", "scenes": [], "narration": "...", "hooks": []}}"""
        }])
        import json
        content = result['choices'][0]['message']['content']
        try:
            return json.loads(content)
        except Exception:
            return {'script': content, 'scenes': [], 'narration': content, 'hooks': []}

    def generate_caption(self, script: str, platform: str = 'instagram') -> str:
        result = self._chat([{
            'role': 'user',
            'content': f"Write a {platform} caption for this script. Include emojis and CTA.\n\n{script[:800]}"
        }], max_tokens=400)
        return result['choices'][0]['message']['content'].strip()

    def generate_hashtags(self, topic: str, platform: str = 'instagram', count: int = 10) -> list:
        result = self._chat([{
            'role': 'user',
            'content': f"Generate {count} {platform} hashtags for: {topic}. One per line with # symbol."
        }], max_tokens=200)
        text = result['choices'][0]['message']['content']
        tags = [line.strip() for line in text.split('\n') if line.strip().startswith('#')]
        return tags[:count]


def get_ai_service(service_name: str, api_key: str) -> AIServiceBase:
    """Factory function to get the appropriate AI service"""
    services = {
        'openai': OpenAIService,
        'deepseek': DeepSeekService,
        'groq': GroqService,
    }
    cls = services.get(service_name)
    if not cls:
        raise ValueError(f"Unknown AI service: {service_name}")
    return cls(api_key)


class GroqService(AIServiceBase):
    """Groq AI integration - uses OpenAI-compatible API"""

    def __init__(self, api_key: str, model: str = 'llama-3.1-8b-instant'):
        self.api_key = api_key
        self.model = model
        self.base_url = 'https://api.groq.com/openai/v1'

    def _chat(self, messages: list, max_tokens: int = 2000) -> dict:
        with httpx.Client(timeout=60) as client:
            response = client.post(
                f'{self.base_url}/chat/completions',
                headers={'Authorization': f'Bearer {self.api_key}',
                         'Content-Type': 'application/json'},
                json={'model': self.model, 'messages': messages, 'max_tokens': max_tokens}
            )
            response.raise_for_status()
            return response.json()

    def generate_script(self, topic: str, duration: int = 30, tone: str = 'professional',
                        audience: str = 'general', content_type: str = 'promotional') -> dict:
        word_count = duration * 2
        result = self._chat([{
            'role': 'system',
            'content': f'You are an expert social media video scriptwriter. Write a {duration}-second video script. Return ONLY the spoken narration text - no JSON, no scene descriptions, no formatting. Just the words that will appear on screen.'
        }, {
            'role': 'user',
            'content': f'Write a {duration}-second {content_type} video script about: {topic}\nAudience: {audience}, Tone: {tone}\nTarget: ~{word_count} words\nReturn ONLY the narration text, nothing else.'
        }])
        import json, re
        text = result['choices'][0]['message']['content'].strip()
        # Remove any JSON or markdown if model still returns it
        if text.startswith('{') or text.startswith('```'):
            try:
                clean = re.sub(r'```.*?```', '', text, flags=re.DOTALL).strip()
                if clean.startswith('{'):
                    parsed = json.loads(clean)
                    text = parsed.get('script', parsed.get('narration', clean))
                else:
                    text = clean
            except Exception:
                pass
        return {'script': text, 'scenes': [], 'narration': text, 'hooks': []}

    def generate_caption(self, script: str, platform: str = 'instagram') -> str:
        result = self._chat([{
            'role': 'user',
            'content': f'Write a {platform} caption for this script. Include emojis and CTA.\n\n{script[:800]}'
        }], max_tokens=400)
        return result['choices'][0]['message']['content'].strip()

    def generate_hashtags(self, topic: str, platform: str = 'instagram', count: int = 10) -> list:
        result = self._chat([{
            'role': 'user',
            'content': f'Generate {count} {platform} hashtags for: {topic}. One per line with # symbol.'
        }], max_tokens=200)
        text = result['choices'][0]['message']['content']
        tags = [line.strip() for line in text.split('\n') if line.strip().startswith('#')]
        return tags[:count]
