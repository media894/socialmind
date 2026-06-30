"""
Platform-aware video rendering helpers.

Each platform maps to a single fixed target aspect ratio. When the source
video does not match that ratio the renderer uses scale+crop (not padding)
so the output is distortion-free and has no black bars.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional


# ── Fixed aspect-ratio target per platform ───────────────────────────────────
# Requirements:
#   9:16  → YouTube Shorts, Instagram Reels, TikTok
#   16:9  → YouTube Videos, Facebook, LinkedIn, Twitter/X
#   1:1   → Instagram Posts
# ─────────────────────────────────────────────────────────────────────────────

PLATFORM_RATIO_MAP: dict[str, str] = {
    'instagram':        '9:16',   # defaults to Reels
    'instagram_reels':  '9:16',
    'instagram_post':   '1:1',
    'youtube':          '16:9',   # standard video
    'youtube_shorts':   '9:16',
    'facebook':         '16:9',
    'linkedin':         '16:9',
    'twitter':          '16:9',
    'twitter_x':        '16:9',
    'tiktok':           '9:16',
}

PLATFORM_FORMAT_MAP: dict[str, str] = {
    'instagram':        'reel',
    'instagram_reels':  'reel',
    'instagram_post':   'post',
    'youtube':          'video',
    'youtube_shorts':   'shorts',
    'facebook':         'feed_video',
    'linkedin':         'company_post',
    'twitter':          'post',
    'twitter_x':        'post',
    'tiktok':           'video',
}

# Output pixel dimensions for each named ratio
RATIO_PRESETS: dict[str, str] = {
    '9:16':  '1080x1920',
    '16:9':  '1920x1080',
    '1:1':   '1080x1080',
    '4:5':   '1080x1350',
}

# Kept for backward-compatibility (e.g. SocialVideoUploader.platform_configs)
PLATFORM_RENDER_PRESETS: dict[str, dict] = {
    platform: {
        'ratio':      PLATFORM_RATIO_MAP[platform],
        'resolution': RATIO_PRESETS.get(PLATFORM_RATIO_MAP[platform], '1920x1080'),
        'format':     PLATFORM_FORMAT_MAP[platform],
    }
    for platform in PLATFORM_RATIO_MAP
}


# ── Internal helpers ─────────────────────────────────────────────────────────

def _platform_key(platform: str) -> str:
    return re.sub(r'[^a-z0-9]+', '_', str(platform or '').strip().lower()) or 'social'


def _ffmpeg_path() -> str:
    import urllib.request
    import tarfile
    import subprocess
    from django.conf import settings

    local_binary = os.path.join(settings.BASE_DIR, 'ffmpeg_binary')
    
    def check_binary(binary_path):
        if not binary_path or not os.path.exists(binary_path):
            return False
        if not os.access(binary_path, os.X_OK):
            return False
        try:
            # Test if it can actually execute and find its libraries
            subprocess.run([binary_path, '-version'], capture_output=True, check=True)
            return True
        except Exception:
            return False

    if check_binary(local_binary):
        return local_binary

    path = shutil.which('ffmpeg')
    if check_binary(path):
        return path

    try:
        import imageio_ffmpeg
        path = imageio_ffmpeg.get_ffmpeg_exe()
        if check_binary(path):
            return path
    except ImportError:
        pass

    print("Downloading static ffmpeg binary...")
    try:
        tar_path = os.path.join(settings.BASE_DIR, 'ffmpeg.tar.xz')
        urllib.request.urlretrieve('https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz', tar_path)
        with tarfile.open(tar_path, 'r:xz') as tar:
            for member in tar.getmembers():
                if member.name.endswith('/ffmpeg'):
                    member.name = 'ffmpeg_binary'
                    tar.extract(member, path=settings.BASE_DIR)
                    break
        os.chmod(local_binary, 0o755)
        if os.path.exists(tar_path):
            os.remove(tar_path)
        if check_binary(local_binary):
            return local_binary
    except Exception as e:
        print(f"Failed to download ffmpeg: {e}")
        raise RuntimeError(f"ffmpeg is missing and auto-download failed: {e}")

    raise RuntimeError('ffmpeg is required to render platform-specific video variants, and no working binary was found.')


def _ffprobe_path() -> str:
    return shutil.which('ffprobe') or ''


def _render_signature(input_path: str, platform: str, ratio: str) -> str:
    source = Path(input_path)
    payload = f"{source.resolve()}::{source.stat().st_mtime_ns}::{platform}::{ratio}::30fps-fast-v2".encode()
    return hashlib.sha1(payload).hexdigest()[:12]


def _probe_video_dimensions(input_path: str) -> tuple[Optional[int], Optional[int]]:
    ffprobe = _ffprobe_path()
    if not ffprobe:
        return None, None
    command = [
        ffprobe,
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height',
        '-of', 'json',
        input_path,
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=15)
    if result.returncode != 0:
        return None, None
    try:
        payload = json.loads(result.stdout or '{}')
        streams = payload.get('streams') or []
        stream = streams[0] if streams else {}
        width  = int(stream.get('width')  or 0) or None
        height = int(stream.get('height') or 0) or None
        return width, height
    except Exception:
        return None, None


# ── Public API ────────────────────────────────────────────────────────────────

def get_platform_render_preset(platform: str, input_path: str | None = None) -> dict:
    """
    Return the render preset for *platform*.

    The ratio is always the platform's fixed canonical ratio (per requirements).
    *input_path* is accepted for API compatibility but no longer influences the
    chosen ratio.
    """
    platform_key = _platform_key(platform)
    ratio      = PLATFORM_RATIO_MAP.get(platform_key, '16:9')
    resolution = '1280x720' if platform_key in {'twitter', 'twitter_x'} else RATIO_PRESETS.get(ratio, '1920x1080')
    fmt        = PLATFORM_FORMAT_MAP.get(platform_key, 'feed_video')

    source_ratio: Optional[float] = None
    if input_path:
        w, h = _probe_video_dimensions(input_path)
        if w and h:
            source_ratio = w / h

    return {
        'ratio':            ratio,
        'resolution':       resolution,
        'format':           fmt,
        'source_ratio':     source_ratio,
        'available_ratios': [ratio],   # single canonical ratio
    }


def render_platform_video(input_path: str, platform: str, output_dir: str | None = None) -> str:
    """
    Render a high-quality MP4 variant sized for *platform*.

    The video is scaled so it *fills* the target canvas, then cropped to the
    exact pixel dimensions — no black bars, no distortion, full content
    coverage.  Centre-weighted cropping keeps the most visually important
    region (the centre of the frame) in view.
    """
    if not input_path or not os.path.exists(input_path):
        raise FileNotFoundError(f'Input video not found: {input_path}')

    preset  = get_platform_render_preset(platform, input_path)
    ffmpeg  = _ffmpeg_path()
    out_dir = Path(output_dir or tempfile.gettempdir())
    out_dir.mkdir(parents=True, exist_ok=True)

    source    = Path(input_path)
    signature = _render_signature(input_path, platform, preset['ratio'])
    out_path  = out_dir / f'{source.stem}_{_platform_key(platform)}_{signature}.mp4'

    if out_path.exists() and out_path.stat().st_size > 0:
        return str(out_path)

    target_w, target_h = preset['resolution'].split('x', 1)

    # Scale to *fill* the target dimensions (no black bars), then
    # centre-crop to the exact target size.
    vf = (
        "fps=30,"
        f"scale={target_w}:{target_h}:force_original_aspect_ratio=increase,"
        f"crop={target_w}:{target_h},"
        f"format=yuv420p"
    )

    command = [
        ffmpeg, '-y',
        '-i', str(source),
        '-vf', vf,
        '-c:v', 'libx264',
        '-profile:v', 'main',
        '-level', '4.0',
        '-r', '30',
        '-crf', '24',
        '-preset', 'fast',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-threads', '1',
        '-max_muxing_queue_size', '1024',
        '-movflags', '+faststart',
        str(out_path),
    ]

    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired as exc:
        if out_path.exists():
            out_path.unlink(missing_ok=True)
        raise RuntimeError(
            'Timed out while rendering the platform-specific video variant. '
            'The source video could not be converted quickly enough for publishing.'
        ) from exc
    if result.returncode != 0 or not out_path.exists():
        raise RuntimeError(
            'Failed to render the platform-specific video variant. '
            f'ffmpeg output: {(result.stderr or result.stdout or "").strip()[:1000]}'
        )

    return str(out_path)


class SocialVideoUploader:
    def __init__(self):
        # Expose the preset map so callers can inspect supported platforms
        self.platform_configs = PLATFORM_RENDER_PRESETS

    def resize_video(self, input_path: str, platform: str, output_path: str) -> str:
        rendered = render_platform_video(
            input_path, platform,
            output_dir=str(Path(output_path).parent),
        )
        if rendered != output_path:
            shutil.copy2(rendered, output_path)
        return output_path

    def post_to_all_platforms(self, original_video_path: str, video_topic: str) -> dict:
        results = {}
        for platform in self.platform_configs:
            resized_path = render_platform_video(original_video_path, platform)
            results[platform] = {
                'video_path': resized_path,
                'title':      video_topic,
                'caption':    video_topic,
                'hashtags':   [],
                'preset':     get_platform_render_preset(platform, original_video_path),
            }
        return results
