import ollama
import json
import os

class SocialMindAI:
    def __init__(self):
        self.model = 'llama3.2'
        print("✅ AI Model Ready: llama3.2")
    
    def generate_youtube_content(self, topic):
        """Generate YouTube title and description"""
        prompt = f"""Generate YouTube SEO content for video about: "{topic}"
        
        Return EXACTLY in this format:
        TITLE: [Write an engaging title under 60 characters with keywords]
        DESCRIPTION: [Write 2-3 sentences describing the video content]
        TAGS: [5 relevant tags separated by commas]
        """
        
        try:
            response = ollama.chat(model=self.model, messages=[
                {'role': 'user', 'content': prompt}
            ])
            return response['message']['content']
        except Exception as e:
            return f"Error: {e}"
    
    def generate_social_caption(self, topic, platform):
        """Generate captions for Instagram, Facebook, LinkedIn"""
        prompts = {
            'instagram': f"Write a short Instagram caption (max 150 characters) with 5 hashtags for: {topic}",
            'facebook': f"Write an engaging Facebook post caption with 3 hashtags for: {topic}",
            'linkedin': f"Write a professional LinkedIn post caption with 3 hashtags for: {topic}"
        }
        
        try:
            response = ollama.chat(model=self.model, messages=[
                {'role': 'user', 'content': prompts.get(platform, prompts['instagram'])}
            ])
            return response['message']['content']
        except Exception as e:
            return f"Error: {e}"
    
    def generate_all_content(self, topic):
        """Generate content for all platforms at once"""
        print(f"🎬 Generating AI content for: {topic}")
        
        content = {
            'topic': topic,
            'youtube': self.generate_youtube_content(topic),
            'instagram': self.generate_social_caption(topic, 'instagram'),
            'facebook': self.generate_social_caption(topic, 'facebook'),
            'linkedin': self.generate_social_caption(topic, 'linkedin')
        }
        
        # Save to JSON file for backup
        with open('generated_content.json', 'w', encoding='utf-8') as f:
            json.dump(content, f, indent=2)
        
        return content

# Test the AI when run directly
if __name__ == "__main__":
    ai = SocialMindAI()
    
    # Test with a sample topic
    test_topic = "10 Python Tips for Beginners"
    result = ai.generate_all_content(test_topic)
    
    print("\n" + "="*50)
    print("📺 YOUTUBE CONTENT:")
    print(result['youtube'])
    print("\n📱 INSTAGRAM:")
    print(result['instagram'])
    print("\n👔 LINKEDIN:")
    print(result['linkedin'])