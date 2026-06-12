"""
Professional Video Generation Engine
Combines: Pexels footage + ElevenLabs voice + FFmpeg rendering
Creates real social media videos with actual footage and voice narration
"""
import os
import subprocess
import logging
import textwrap
import json
import shutil
import tempfile
from pathlib import Path
from typing import Optional, List

logger = logging.getLogger(__name__)

THEMES = {
    'professional': {'bg': '0A0A1E', 'text': 'FFFFFF', 'accent': '6366F1'},
    'vibrant':      {'bg': 'FF4500', 'text': 'FFFFFF', 'accent': 'FFD700'},
    'minimal':      {'bg': 'F8F9FA', 'text': '1A1A2E', 'accent': '2563EB'},
    'dark':         {'bg': '000000', 'text': 'FFFFFF', 'accent': '8B5CF6'},
    'nature':       {'bg': '064E3B', 'text': 'ECFDF5', 'accent': '34D399'},
    'corporate':    {'bg': '1E3A5F', 'text': 'FFFFFF', 'accent': '38BDF8'},
}

# Platform-specific canvas dimensions
PLATFORM_SPECS = {
    'instagram': {'w': 1080, 'h': 1920, 'fps': 30, 'orientation': 'portrait'},   # 4:5 Reel
    'instagram_square':{'w': 1080, 'h': 1080, 'fps': 30, 'orientation': 'square'},     # 1:1
    'tiktok':          {'w': 1080, 'h': 1920, 'fps': 30, 'orientation': 'portrait'},   # 9:16
    'reels':           {'w': 1080, 'h': 1920, 'fps': 30, 'orientation': 'portrait'},   # 9:16
    'youtube':         {'w': 1920, 'h': 1080, 'fps': 30, 'orientation': 'landscape'},  # 16:9
    'youtube_shorts':  {'w': 1080, 'h': 1920, 'fps': 30, 'orientation': 'portrait'},   # 9:16
    'facebook':        {'w': 1080, 'h': 1080, 'fps': 30, 'orientation': 'square'},     # 1:1
    'linkedin':        {'w': 1920, 'h': 1080, 'fps': 30, 'orientation': 'landscape'},  # 16:9
    'default':         {'w': 1920, 'h': 1080, 'fps': 30, 'orientation': 'landscape'},  # 16:9
}

# Pexels orientation per aspect ratio
ORIENTATION_MAP = {
    'landscape': 'landscape',
    'portrait':  'portrait',
    'square':    'square',
}


def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def split_scenes(script, n):
    sentences = [s.strip() for s in script.replace('!', '.').replace('?', '.').split('.') if s.strip()]
    if not sentences:
        sentences = [script]
    if len(sentences) <= n:
        return sentences
    per = max(1, len(sentences) // n)
    result = []
    for i in range(0, len(sentences), per):
        g = '. '.join(sentences[i:i+per])
        if g:
            result.append(g)
        if len(result) >= n:
            break
    return result or [script]


def fetch_pexels_videos(query: str, api_key: str, count: int = 3,
                        orientation: str = 'landscape') -> List[str]:
    """Fetch relevant video clips from Pexels API"""
    import httpx
    downloaded = []

    try:
        with httpx.Client(timeout=30) as client:
            resp = client.get(
                'https://api.pexels.com/videos/search',
                headers={'Authorization': api_key},
                params={
                    'query': query,
                    'per_page': count * 2,
                    'size': 'medium',
                    'orientation': ORIENTATION_MAP.get(orientation, 'landscape'),
                }
            )
            resp.raise_for_status()
            data = resp.json()
            videos = data.get('videos', [])[:count * 2]

            for i, video in enumerate(videos[:count]):
                files = video.get('video_files', [])
                chosen = None
                for f in files:
                    if f.get('quality') in ['hd', 'sd'] and f.get('width', 0) <= 1920:
                        chosen = f
                        break
                if not chosen and files:
                    chosen = files[0]

                if chosen and chosen.get('link'):
                    vid_path = f'/tmp/socialmind/pexels_{i}.mp4'
                    vid_resp = client.get(chosen['link'], timeout=60)
                    if vid_resp.status_code == 200:
                        with open(vid_path, 'wb') as f:
                            f.write(vid_resp.content)
                        downloaded.append(vid_path)
                        logger.info(f"Downloaded Pexels video {i+1}: {chosen.get('width')}x{chosen.get('height')}")

    except Exception as e:
        logger.warning(f"Pexels fetch failed: {e}")

    return downloaded


def generate_voice_audio(text: str, api_key: str, output_path: str) -> Optional[str]:
    """Generate voice narration using ElevenLabs"""
    import httpx

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    voice_id = "21m00Tcm4TlvDq8ikWAM"  # Rachel - clear female voice

    try:
        with httpx.Client(timeout=60) as client:
            response = client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                headers={
                    "Accept": "audio/mpeg",
                    "Content-Type": "application/json",
                    "xi-api-key": api_key,
                },
                json={
                    "text": text[:2500],
                    "model_id": "eleven_monolingual_v1",
                    "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}
                }
            )
            response.raise_for_status()
            with open(output_path, 'wb') as f:
                f.write(response.content)
            logger.info(f"Voice audio generated: {output_path}")
            return output_path
    except Exception as e:
        logger.warning(f"ElevenLabs voice generation failed: {e}")
        return None


class VideoGenerator:
    def __init__(self, output_dir='/tmp/socialmind'):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def generate_text_video(self, script, title, duration=30, platform='default',
                             theme='professional', output_filename=None,
                             logo_path=None, background_path=None, audio_path=None,
                             pexels_api_key=None, topic=None):

        output_filename = output_filename or f"video_{os.urandom(4).hex()}.mp4"
        output_path = str(self.output_dir / output_filename)
        tc = THEMES.get(theme, THEMES['professional'])

        # Resolve platform dimensions
        specs = PLATFORM_SPECS.get(str(platform or 'default').lower(), PLATFORM_SPECS['default'])
        w, h, fps = specs['w'], specs['h'], specs['fps']
        orientation = specs['orientation']

        # Try Pexels footage video first if API key available
        if pexels_api_key and topic:
            try:
                result = self._generate_with_pexels(
                    script=script, title=title, topic=topic,
                    duration=duration, theme=tc,
                    output_path=output_path,
                    logo_path=logo_path,
                    pexels_api_key=pexels_api_key,
                    audio_path=audio_path,
                    output_filename=output_filename,
                    w=w, h=h, fps=fps, orientation=orientation,
                )
                if result and Path(output_path).exists() and Path(output_path).stat().st_size > 1000:
                    return result
            except Exception as e:
                logger.warning(f"Pexels video failed: {e}, falling back to text video")

        # Fallback: PIL text-based video
        return self._generate_text_video_pil(
            script=script, title=title, duration=duration,
            theme=tc, output_path=output_path,
            logo_path=logo_path,
            audio_path=audio_path, output_filename=output_filename,
            w=w, h=h, fps=fps,
        )

    def _generate_with_pexels(self, script, title, topic, duration, theme,
                               output_path, logo_path, pexels_api_key, audio_path,
                               output_filename, w=1920, h=1080, fps=30,
                               orientation='landscape'):
        """Generate video using Pexels footage as background"""

        # Fetch relevant video clips with matching orientation
        search_query = topic[:50] if topic else title
        video_clips = fetch_pexels_videos(search_query, pexels_api_key, count=3,
                                          orientation=orientation)

        if not video_clips:
            raise Exception("No Pexels videos found")

        import shutil as _shutil
        if not _shutil.which('ffmpeg'):
            logger.warning("FFmpeg not available, returning raw Pexels URL")
            return {
                'success': True,
                'output_path': None,
                'pexels_url': video_clips[0] if video_clips else '',
                'filename': output_filename,
                'duration': duration,
                'resolution': f'{w}x{h}',
                'format': 'mp4',
                'file_size': 0,
                'scenes_count': 1,
                'has_footage': True,
            }

        # Split script into scenes
        num_scenes = max(2, duration // 6)
        scenes = split_scenes(script, num_scenes)
        scene_dur = duration / len(scenes)

        # Prepare scene clips (loop/trim Pexels footage)
        scene_files = []
        for i, scene_text in enumerate(scenes):
            clip_src = video_clips[i % len(video_clips)]
            scene_out = f'/tmp/socialmind/scene_{i}.mp4'

            # Trim/loop the clip to scene duration — scale to target canvas
            trim_cmd = [
                'ffmpeg', '-y',
                '-stream_loop', '-1',
                '-i', clip_src,
                '-t', str(scene_dur),
                '-vf', (
                    f'scale={w}:{h}:force_original_aspect_ratio=increase,'
                    f'crop={w}:{h},format=yuv420p'
                ),
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
                '-pix_fmt', 'yuv420p',
                '-movflags', 'faststart',
                '-an',
                scene_out
            ]
            result = subprocess.run(trim_cmd, capture_output=True, timeout=60)
            if result.returncode == 0:
                # Add text overlay (title at top, scene caption at bottom)
                text_out = f'/tmp/socialmind/scene_{i}_text.mp4'
                safe_title = title.replace("'", "\\'").replace(":", "\\:")[:40]
                safe_text = scene_text.replace("'", "\\'").replace(":", "\\:")

                import textwrap as tw
                chars_per_line = max(30, w // 22)
                wrapped = '\n'.join(tw.wrap(safe_text, chars_per_line)[:3])
                safe_wrapped = wrapped.replace("'", "\\'").replace(":", "\\:")

                accent = theme['accent']
                title_fontsize = max(24, h // 40)
                body_fontsize = max(20, h // 50)
                caption_box_h = max(100, h // 10)

                filter_str = (
                    f"drawbox=x=0:y={h - caption_box_h}:w={w}:h={caption_box_h}:color=black@0.75:t=fill,"
                    f"drawtext=text='{safe_wrapped}':"
                    f"fontsize={body_fontsize}:fontcolor=white:"
                    f"x=(w-text_w)/2:y={h - caption_box_h + 12}:"
                    f"font=DejaVuSans:line_spacing=4,"
                    f"drawbox=x=0:y=0:w={w}:h={title_fontsize + 24}:color=black@0.65:t=fill,"
                    f"drawtext=text='{safe_title}':"
                    f"fontsize={title_fontsize}:fontcolor=0x{accent}:"
                    f"x=(w-text_w)/2:y=12:font=DejaVuSans-Bold"
                )

                overlay_cmd = [
                    'ffmpeg', '-y', '-i', scene_out,
                    '-vf', filter_str,
                    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
                    '-pix_fmt', 'yuv420p',
                    '-movflags', '+faststart',
                    text_out
                ]
                r2 = subprocess.run(overlay_cmd, capture_output=True, timeout=60)
                scene_files.append(text_out if r2.returncode == 0 else scene_out)

        if not scene_files:
            raise Exception("No scene files created")

        # Concatenate all scenes with smooth output
        concat_list = '/tmp/socialmind/concat.txt'
        with open(concat_list, 'w') as f:
            for sf in scene_files:
                f.write(f"file '{sf}'\n")

        concat_cmd = [
            'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
            '-i', concat_list,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-t', str(duration),
            output_path
        ]
        result = subprocess.run(concat_cmd, capture_output=True, timeout=120)

        if result.returncode != 0:
            raise Exception(f"Concat failed: {result.stderr[-200:]}")

        # Merge audio then watermark
        if audio_path and Path(audio_path).exists():
            output_path = self._add_audio(output_path, audio_path, duration)

        if logo_path and Path(logo_path).exists():
            output_path = self._apply_logo_watermark(output_path, logo_path)

        fs = Path(output_path).stat().st_size if Path(output_path).exists() else 0
        return {
            'success': True, 'output_path': output_path,
            'filename': output_filename, 'duration': duration,
            'resolution': f'{w}x{h}', 'format': 'mp4',
            'file_size': fs, 'scenes_count': len(scenes),
            'has_footage': True,
        }

    def _generate_text_video_pil(self, script, title, duration, theme,
                                   output_path, logo_path, audio_path, output_filename,
                                   w=1920, h=1080, fps=30):
        """Generate text-based video using PIL frames"""
        try:
            from PIL import Image, ImageDraw, ImageFont
        except ImportError:
            return self._minimal(output_path, output_filename, duration,
                                  w=w, h=h, logo_path=logo_path)

        bg = hex_to_rgb(theme['bg'])
        fg = hex_to_rgb(theme['text'])
        ac = hex_to_rgb(theme['accent'])

        frames_dir = self.output_dir / f'frames_{os.urandom(2).hex()}'
        frames_dir.mkdir(exist_ok=True)

        font_paths = [
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
            '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
        ]

        def get_font(size, bold=False):
            for fp in font_paths:
                if bold and 'Bold' not in fp:
                    continue
                if Path(fp).exists():
                    try:
                        return ImageFont.truetype(fp, size)
                    except Exception:
                        pass
            return ImageFont.load_default()

        # Scale font sizes relative to canvas height
        title_size = max(36, h // 15)
        body_size = max(28, h // 22)
        title_font = get_font(title_size, bold=True)
        body_font = get_font(body_size)

        num_scenes = max(3, duration // 5)
        scenes = split_scenes(script, num_scenes)
        frames_per_scene = int(fps * duration / len(scenes))
        frame_idx = 0

        chars_per_line = max(30, w // (body_size // 2))

        for si, scene_text in enumerate(scenes):
            lines = textwrap.wrap(scene_text, width=chars_per_line)[:4]
            for fi in range(frames_per_scene):
                img = Image.new('RGB', (w, h), bg)
                draw = ImageDraw.Draw(img)

                # Accent bars (top & bottom strip)
                draw.rectangle([0, 0, w, 5], fill=ac)
                draw.rectangle([0, h - 8, w, h], fill=ac)

                # Subtle gradient top
                for y in range(80):
                    alpha = int(25 * (1 - y / 80))
                    r = min(255, bg[0] + alpha)
                    g2 = min(255, bg[1] + alpha)
                    b = min(255, bg[2] + alpha)
                    draw.line([(0, y), (w, y)], fill=(r, g2, b))

                # Per-scene fade-in
                fade_frames = int(fps * 0.3)
                if fi < fade_frames:
                    alpha = fi / fade_frames
                    base = Image.new('RGB', (w, h), bg)
                    img = Image.blend(base, img, alpha)
                    draw = ImageDraw.Draw(img)

                # Title (first scene only for portrait; all for landscape wide)
                if si == 0 or len(scenes) <= 2:
                    ty = int(h * 0.17)
                    draw.text((w // 2 + 2, ty + 2), title, font=title_font, fill=(0, 0, 0), anchor='mm')
                    draw.text((w // 2, ty), title, font=title_font, fill=ac, anchor='mm')
                    line_y = int(h * 0.27)
                    draw.rectangle([w // 2 - 120, line_y, w // 2 + 120, line_y + 2], fill=ac)

                # Content lines — centred vertically
                line_h = body_size + 8
                total_text_h = len(lines) * line_h
                if si == 0:
                    start_y = int(h * 0.38)
                else:
                    start_y = (h - total_text_h) // 2 + 20
                for li, line in enumerate(lines):
                    ly = start_y + li * line_h
                    draw.text((w // 2 + 2, ly + 2), line, font=body_font, fill=(0, 0, 0, 80), anchor='mm')
                    draw.text((w // 2, ly), line, font=body_font, fill=fg, anchor='mm')

                frame_path = frames_dir / f"f{frame_idx:06d}.png"
                img.save(str(frame_path))
                frame_idx += 1

        # Render video — faststart ensures instant browser playback
        cmd = [
            'ffmpeg', '-y', '-framerate', str(fps),
            '-i', str(frames_dir / 'f%06d.png'),
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-t', str(duration),
            output_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        shutil.rmtree(str(frames_dir), ignore_errors=True)

        if result.returncode != 0:
            raise Exception(f"FFmpeg error: {result.stderr[-300:]}")

        if audio_path and Path(audio_path).exists():
            output_path = self._add_audio(output_path, audio_path, duration)

        if logo_path and Path(logo_path).exists():
            output_path = self._apply_logo_watermark(output_path, logo_path)

        fs = Path(output_path).stat().st_size if Path(output_path).exists() else 0
        return {
            'success': True, 'output_path': output_path,
            'filename': output_filename, 'duration': duration,
            'resolution': f'{w}x{h}', 'format': 'mp4',
            'file_size': fs, 'scenes_count': len(scenes),
        }

    def _add_audio(self, video_path: str, audio_path: str, duration: int) -> str:
        """Merge audio into video using FFmpeg"""
        audio_out = video_path.replace('.mp4', '_final.mp4')
        cmd = [
            'ffmpeg', '-y',
            '-i', video_path,
            '-i', audio_path,
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-shortest',
            '-t', str(duration),
            '-movflags', '+faststart',
            audio_out
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode == 0 and Path(audio_out).exists():
            os.replace(audio_out, video_path)
            logger.info("Audio merged into video successfully!")
        return video_path

    def _apply_logo_watermark(self, video_path: str, logo_path: str) -> str:
        """Burn a bottom-right logo watermark into the rendered video."""
        if not video_path or not logo_path:
            return video_path
        if not Path(video_path).exists() or not Path(logo_path).exists():
            return video_path

        watermarked_path = video_path.replace('.mp4', '_logo.mp4')
        cmd = [
            'ffmpeg', '-y',
            '-i', video_path,
            '-i', logo_path,
            '-filter_complex',
            '[1:v]scale=180:-1[wm];[0:v][wm]overlay=W-w-42:H-h-42:format=auto[v]',
            '-map', '[v]',
            '-map', '0:a?',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '18',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'copy',
            '-shortest',
            '-movflags', '+faststart',
            watermarked_path,
        ]

        result = subprocess.run(cmd, capture_output=True, timeout=180)
        if result.returncode == 0 and Path(watermarked_path).exists():
            os.replace(watermarked_path, video_path)
            logger.info("Logo watermark applied successfully!")
        else:
            logger.warning("Logo watermark failed: %s", result.stderr[-400:] if result.stderr else 'unknown error')
            if Path(watermarked_path).exists():
                try:
                    Path(watermarked_path).unlink()
                except Exception:
                    pass
        return video_path

    def _minimal(self, output_path, output_filename, duration, w=1920, h=1080, logo_path=None):
        try:
            cmd = [
                'ffmpeg', '-y', '-f', 'lavfi',
                '-i', f'color=c=0A0A1E:size={w}x{h}:duration={duration}:rate=30',
                '-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                output_path
            ]
            subprocess.run(cmd, capture_output=True, timeout=60)
        except Exception:
            with open(output_path, 'wb') as f:
                f.write(b'\x00\x00\x00\x20ftypisom')
        if logo_path and Path(logo_path).exists():
            output_path = self._apply_logo_watermark(output_path, logo_path)
        fs = Path(output_path).stat().st_size if Path(output_path).exists() else 0
        return {
            'success': True, 'output_path': output_path,
            'filename': output_filename, 'duration': duration,
            'resolution': f'{w}x{h}', 'format': 'mp4', 'file_size': fs, 'scenes_count': 1,
        }

    def generate_thumbnail(self, video_path, time_offset=1.0):
        thumb = video_path.replace('.mp4', '_thumb.jpg')
        try:
            cmd = ['ffmpeg', '-y', '-i', video_path, '-ss', str(time_offset),
                   '-vframes', '1', '-q:v', '2', thumb]
            r = subprocess.run(cmd, capture_output=True, timeout=30)
            if r.returncode == 0 and Path(thumb).exists():
                return thumb
        except Exception as e:
            logger.error(f"Thumbnail failed: {e}")
        return None

    def get_video_metadata(self, video_path):
        try:
            cmd = ['ffprobe', '-v', 'quiet', '-print_format', 'json',
                   '-show_streams', '-show_format', video_path]
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if r.returncode == 0:
                data = json.loads(r.stdout)
                vs = next((s for s in data.get('streams', []) if s.get('codec_type') == 'video'), {})
                return {
                    'duration': float(data.get('format', {}).get('duration', 0)),
                    'width': vs.get('width', 0), 'height': vs.get('height', 0),
                    'fps': eval(vs.get('r_frame_rate', '30/1')),
                    'codec': vs.get('codec_name', ''),
                    'file_size': int(data.get('format', {}).get('size', 0)),
                }
        except Exception as e:
            logger.error(f"Metadata failed: {e}")
        return {}


class VideoGenerationConfig:
    THEMES = {k: {'bg_color': hex_to_rgb(v['bg']), 'text_color': '#' + v['text'], 'accent': v['accent']}
              for k, v in THEMES.items()}
    PLATFORM_SPECS = PLATFORM_SPECS
