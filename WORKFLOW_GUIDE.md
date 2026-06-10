# SocialMind Platform - Complete Workflow Guide

## 🎯 Overview

This guide covers the complete video generation, approval, scheduling, and download workflow in the SocialMind platform.

## 📋 Complete Workflow

### 1. Create Video

1. Navigate to **Create Video** page
2. Fill in video details:
   - Title
   - Topic/Description
   - Content Type (Promotional, Educational, etc.)
   - Duration (seconds)
   - Tone (Optional)
   - Target Audience (Optional)
3. Click **Generate Video**

### 2. Video Generation Process

The system will:
1. Generate AI script using Groq/OpenAI
2. Create captions and hashtags
3. Generate individual scenes with:
   - Video footage (from Pexels if API key available)
   - Overlay text
   - Voiceover narration
4. Save as scene-by-scene preview

### 3. Preview & Approve

Once generated, you'll see two viewing modes:

#### **Preview Mode** (Scene-by-Scene)
- View each scene individually
- See overlay text and voiceover
- Navigate between scenes
- Play all scenes in sequence

#### **Video Mode** (Full Video)
- Generate complete video with audio
- Click **"Generate Full Video with Audio"** button
- This will:
  - Stitch all scenes together
  - Add voiceover using Groq TTS API (or fallback synthesis)
  - Create seamless playback
  - Save to browser storage (IndexedDB)

**Actions Available:**
- ✅ **Approve** - Mark video as ready
- ❌ **Reject** - Send back to draft
- 🔄 **Regenerate** - Create new version

### 4. Schedule Post

After approving:

1. Click **"Schedule Post"** button
2. Select platforms:
   - Instagram 📸
   - Facebook 👥
   - LinkedIn 💼
   - TikTok 🎵
   - YouTube ▶️
   - Twitter/X 🐦
3. Set date and time
4. Optionally customize caption
5. Click **"Schedule to X Platforms"**

**Result:** Automatically redirects to Schedule page

### 5. Schedule Page

View all scheduled posts:

**Features:**
- List view of all scheduled videos
- Filter by "All" or "Today"
- See schedule time, platforms, and status
- Actions:
  - 👁️ **View** - Open video detail page
  - ⏰ **Cancel Schedule** - Unschedule the post
  - 🗑️ **Delete** - Remove post

**Data Source:** Reads from `localStorage` (key: `sm_local_videos`)

### 6. Downloads Page

Access and download your generated videos:

**Features:**
- Grid view of all completed videos
- Filter by status (All, Approved, Scheduled)
- Video preview on hover
- Download full video files

**Actions per video:**
- 👁️ **View** - Quick preview
- ▶️ **Play** - Full video modal
- ⬇️ **Download** - Save video file (.webm format)
- 🗑️ **Delete** - Remove video and files

**Storage:**
- Video metadata: `localStorage`
- Video files: Browser IndexedDB
- Key format: `sm_stitched_{videoId}` for full videos

## 🗂️ Data Storage Structure

### localStorage Keys

```javascript
// Video metadata array
sm_local_videos: [
  {
    id: "uuid",
    title: "Video Title",
    status: "approved" | "scheduled" | "rejected" | "review",
    scenes: [{ videoUrl, overlayText, voiceover, ... }],
    script: "Full narration text",
    duration_seconds: 30,
    ai_service: "groq",
    created_at: "ISO date string",
    scheduledAt: "ISO date string" | null,
    scheduledPlatforms: ["instagram", "facebook"],
    blobKey: "indexedDB key for original",
  }
]

// API Keys
sm_groq_key: "API key for Groq"
sm_openai_key: "API key for OpenAI"
sm_pexels_key: "API key for Pexels"
sm_elevenlabs_key: "API key for ElevenLabs"
```

### IndexedDB Structure

**Database:** `socialmind_videos`  
**Store:** `blobs`

**Keys:**
- `sm_stitched_{videoId}` - Full generated video (Blob)
- `sm_current_video` - Latest recording (fallback)
- `{videoId}` - Original scene data

## 🎬 Video Generation Details

### Scene-by-Scene Generation

Each scene contains:
- **videoUrl**: Blob URL for scene video
- **overlayText**: Main text overlay
- **voiceover**: Narration text
- **sceneNumber**: Position in sequence
- **duration**: Scene length (default 6s)

### Full Video Generation

When you click "Generate Full Video with Audio":

1. **Canvas Setup** (1280x720)
2. **Audio Context Creation**
   - Uses Web Audio API
   - Sample rate: 44.1kHz
3. **TTS Generation** (tries in order):
   - Groq API TTS (models: playai-tts, playai-tts-arabic)
   - Fallback: Synthesized audio using oscillators
4. **Scene Stitching**
   - Renders each scene to canvas
   - Adds text overlays and gradients
   - Plays synchronized voiceover
   - Records with MediaRecorder
5. **Storage**
   - Saves to IndexedDB as WebM
   - Codec: VP9/VP8 with Opus audio
   - Bitrate: 2.5Mbps video, 128kbps audio

## 📱 Navigation Structure

```
/dashboard          - Overview and stats
/videos             - All videos list
/videos/new         - Create new video
/videos/:id         - Server video details
/videos/local/:id   - Local video details (with Preview/Video modes)
/schedule           - Scheduled posts
/downloads          - Download videos
/analytics          - Analytics dashboard
/settings           - User settings
```

## 🔧 API Integration

### Required API Keys (Optional but Recommended)

Set in Settings page:

1. **Groq API** - For script generation and TTS
2. **OpenAI API** - Alternative script generation
3. **Pexels API** - High-quality stock footage
4. **ElevenLabs API** - Premium voice synthesis

**Without API Keys:**
- Script generation: Falls back to basic generation
- Footage: Uses colored backgrounds
- Voiceover: Uses synthesized tones

## 🎨 Video Customization

### Available Options

- **Content Type**: Promotional, Educational, Entertainment, etc.
- **Duration**: 15s, 30s, 60s, or custom
- **Tone**: Professional, Casual, Energetic, etc.
- **Format**: 16:9 (landscape), 9:16 (portrait), 1:1 (square)

### Platform Requirements

Auto-enforced when scheduling:

| Platform  | Max Duration | Aspect Ratio |
|-----------|-------------|--------------|
| Instagram | 60s         | 1:1, 9:16    |
| Facebook  | 240s        | 16:9         |
| LinkedIn  | 600s        | 16:9         |
| TikTok    | 180s        | 9:16         |
| YouTube   | 900s        | 16:9         |
| Twitter   | 140s        | 16:9         |

## 🔐 Data Privacy

- All video files stored locally in browser
- No automatic server uploads
- localStorage data persists until cleared
- IndexedDB can be cleared via browser settings

## 🐛 Troubleshooting

### Video Not Appearing in Schedule Page

1. Ensure video status is "scheduled"
2. Check `localStorage` has `sm_local_videos` array
3. Verify `scheduledAt` and `scheduledPlatforms` fields exist
4. Refresh page (auto-refresh every 5 seconds)

### Video Not Available for Download

1. Click "Generate Full Video with Audio" first
2. Wait for generation to complete (progress bar shows status)
3. Check browser console for errors
4. Ensure sufficient storage space

### Audio Not Working

1. Verify Groq API key is set in Settings
2. Check browser allows autoplay with audio
3. Try fallback synthesis if TTS fails
4. Ensure audio context is not blocked

### Storage Full

Clear old videos:
1. Go to Downloads page
2. Delete unwanted videos
3. Browser will free up IndexedDB space
4. Also clears localStorage metadata

## 📊 File Size Estimates

- Scene video: ~500KB - 2MB each
- Full video (30s): ~5-15MB
- Full video (60s): ~10-30MB
- Total storage needed: ~50-100MB for 10 videos

## 🚀 Performance Tips

1. **Close unused tabs** - Frees memory for video processing
2. **Use Chrome/Edge** - Best WebM/VP9 support
3. **Clear old videos** - Keeps browser storage fast
4. **Generate shorter videos first** - Test before long videos
5. **Wait for completion** - Don't navigate away during generation

## 📝 Notes

- Videos are client-side only (browser storage)
- No server-side video storage in current implementation
- Scheduling sets metadata only (not actual publishing)
- Download provides browser-generated WebM files
- For production publishing, integrate with platform APIs

## 🎯 Future Enhancements

Potential improvements:
- [ ] Server-side video storage
- [ ] Actual platform publishing integration
- [ ] Video editing tools
- [ ] Template library
- [ ] Batch video generation
- [ ] Advanced analytics
- [ ] Team collaboration
- [ ] Cloud backup

---

**Version:** 2.0  
**Last Updated:** March 2026
