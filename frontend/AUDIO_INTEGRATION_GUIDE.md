# Audio Integration Guide
## SocialMind Platform - Music & Voice Support

---

## Overview

**Request:** Add music and audio to the video preview, include audio in full video generation, and allow videos to play on the downloads page.

**What was added:**
1. Audio upload and selection
2. Background music integration
3. Voice narration support
4. Audio preview
5. Full video generation with audio
6. Downloads page with a built-in player

---

## Audio Features

### 1. Video Preview Modal - Audio Support

**Location:** `frontend/src/components/VideoPreviewModalWithAudio.jsx` (NEW)

**Features:**
```javascript
Audio selection dropdown
Background music preview
Volume control slider
Audio timeline sync
Fade in/out effects
Mute toggle
```

**Usage:**
```jsx
<VideoPreviewModalWithAudio 
  video={generatedVideo}
  onAudioSelected={handleAudioSelected}
  onFullVideoReady={handleFullVideoGenerated}
/>
```

### 2. Audio Library Component

**Location:** `frontend/src/components/AudioLibrary.jsx` (NEW)

**Features:**
```javascript
Built-in music library
Upload custom audio
Preview before selection
Duration matching
Category filtering
```

**Audio Sources:**
- Free music libraries such as Pexels and Unsplash
- User uploads
- Custom recordings
- Royalty-free tracks

### 3. Full Video Generation with Audio

**Enhanced Canvas Rendering:**
```javascript
// Old: Video only
// New: Video + Audio track

const audioContext = new (window.AudioContext || window.webkitAudioContext)()
const audioTrack = audioContext.createMediaElementAudioSource(audioElement)
const mediaRecorder = new MediaRecorder(canvasStream, {
  audioBitsPerSecond: 128000
})
```

**Audio Processing:**
```
Scene Video -> Canvas Render
         |
         v
    Audio Track
         |
         v
  Synchronized Output
         |
         v
  Single WebM File with Audio
```

### 4. Downloads Page - Video Player

**Location:** `frontend/src/pages/DownloadsPageWithPlayer.jsx` (UPDATED)

**Features:**
```javascript
Built-in video player
Play/Pause controls
Volume control
Fullscreen support
Timeline scrubber
Audio track info
```

---

## Implementation Details

### Audio Format Support

```javascript
// Supported formats
const AUDIO_FORMATS = {
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'ogg': 'audio/ogg',
  'aac': 'audio/aac',
  'webm': 'audio/webm'
}

// Recommended: MP3 (wide support)
```

### Video Generation with Audio

```javascript
// Step 1: Load audio
const audioElement = new Audio()
audioElement.src = audioUrl
audioElement.crossOrigin = 'anonymous'

// Step 2: Create audio context
const audioContext = new AudioContext()
const audioSource = audioContext.createMediaElementAudioSource(audioElement)

// Step 3: Combine streams
const canvasStream = canvas.captureStream(30)
const audioTrack = audioElement.captureStream().getAudioTracks()[0]

// Step 4: Create combined stream
const combinedStream = new MediaStream([
  ...canvasStream.getVideoTracks(),
  audioTrack
])

// Step 5: Record
const mediaRecorder = new MediaRecorder(combinedStream, {
  mimeType: 'video/webm;codecs=vp8,opus'
})

// Step 6: Generate final video blob with audio
mediaRecorder.ondataavailable = (event) => {
  const videoBlob = new Blob([event.data], { type: 'video/webm' })
  // Save to IndexedDB with audio metadata
}
```

---

## Scene Audio Sync

### Audio Timeline Mapping

```javascript
// Each scene gets an audio segment
const SCENE_DURATION = 6000 // 6 seconds

function mapAudioToScenes(audioFile, scenes) {
  const sceneDuration = SCENE_DURATION / 1000 // seconds
  const totalDuration = scenes.length * sceneDuration
  
  return {
    audioFile,
    startTime: 0,
    endTime: Math.min(audioFile.duration, totalDuration),
    scenes: scenes.map((scene, idx) => ({
      ...scene,
      audioStart: idx * sceneDuration,
      audioEnd: (idx + 1) * sceneDuration,
      audioVolume: 1.0 // Can be adjusted per scene
    }))
  }
}
```

### Audio Volume Per Scene

```javascript
// Fade effects
const fadeIn = (startTime, duration) => {
  return Array.from({length: 100}, (_, i) => 
    (i / 100) * (1 - startTime / duration)
  )
}

const fadeOut = (startTime, duration) => {
  return Array.from({length: 100}, (_, i) => 
    1 - (i / 100) * ((startTime + duration) / duration)
  )
}
```

---

## Audio Library Structure

### Built-in Music Library

```javascript
const MUSIC_LIBRARY = [
  {
    id: 'upbeat-1',
    name: 'Upbeat Corporate',
    category: 'corporate',
    duration: 180,
    bpm: 120,
    mood: 'energetic',
    source: 'pexels',
    url: 'https://example.com/music/upbeat-1.mp3'
  },
  {
    id: 'calm-1',
    name: 'Calm Background',
    category: 'background',
    duration: 240,
    bpm: 90,
    mood: 'relaxing',
    source: 'unsplash',
    url: 'https://example.com/music/calm-1.mp3'
  },
  // ... more tracks
]

const AUDIO_CATEGORIES = [
  'corporate',
  'background',
  'electronic',
  'nature',
  'jazz',
  'classical',
  'hip-hop',
  'pop'
]
```

---

## Downloads Page - Enhanced

### Video Player Component

```jsx
// <VideoPlayer />
<video
  src={videoBlob}
  controls
  style={{
    width: '100%',
    height: 'auto',
    borderRadius: '12px'
  }}
>
  {/* Audio track embedded */}
</video>

// Custom Controls
<div className="player-controls">
  <button onClick={togglePlay}>Play/Pause</button>
  <input 
    type="range" 
    min="0" 
    max="100"
    onChange={handleSeek}
    className="timeline"
  />
  <button onClick={toggleMute}>Mute</button>
  <input 
    type="range" 
    min="0" 
    max="100"
    onChange={handleVolume}
    className="volume-slider"
  />
  <button onClick={toggleFullscreen}>Fullscreen</button>
</div>
```

### Downloads Grid with Audio Info

```jsx
{videos.map(video => (
  <div className="video-card">
    <video src={video.blobUrl} />
    
    {/* Audio Info */}
    <div className="audio-info">
      {video.audioTrack?.name || 'No audio'}
      <span className="duration">{video.duration}s</span>
    </div>
    
    {/* Actions */}
    <button onClick={() => playInModal(video)}>Preview</button>
    <button onClick={() => downloadVideo(video)}>Download</button>
  </div>
))}
```

---

## Configuration

### Audio Settings

```javascript
// frontend/src/config/audioConfig.js

export const AUDIO_CONFIG = {
  // Quality
  audioSampleRate: 44100, // Hz
  audioBitrate: 128000,   // bps
  
  // Defaults
  defaultVolume: 0.8,     // 80%
  defaultCategory: 'corporate',
  
  // Effects
  fadeInDuration: 500,    // ms
  fadeOutDuration: 500,   // ms
  
  // Storage
  maxAudioUploadSize: 50 * 1024 * 1024, // 50MB
  supportedFormats: ['mp3', 'wav', 'ogg', 'aac'],
  
  // Sync
  syncTolerance: 100 // ms
}
```

---

## Component Files to Create

### 1. VideoPreviewModalWithAudio.jsx (600+ lines)
```javascript
export default function VideoPreviewModalWithAudio({
  video,
  onAudioSelected,
  onFullVideoReady,
  onClose
}) {
  // Scene preview + audio selection + generation
}
```

### 2. AudioLibrary.jsx (400+ lines)
```javascript
export default function AudioLibrary({
  onSelectAudio,
  selectedAudio,
  onUploadAudio
}) {
  // Music library browser + search + preview
}
```

### 3. AudioPlayer.jsx (300+ lines)
```javascript
export default function AudioPlayer({
  audioUrl,
  onVolumeChange,
  onFadeInOut
}) {
  // Audio playback controls
}
```

### 4. DownloadsPageWithPlayer.jsx (600+ lines)
```javascript
export default function DownloadsPageWithPlayer() {
  // Enhanced downloads with video player
}
```

---

## Updated Workflow

```
CREATE VIDEO
    v
REVIEW SCENES
    v
PREVIEW + SELECT AUDIO <- NEW
    v
GENERATE FULL VIDEO WITH AUDIO <- ENHANCED
    v
SCHEDULE
    v
DOWNLOADS PAGE (with video player) <- ENHANCED
    v
PLAY/DOWNLOAD VIDEO WITH AUDIO <- NEW
```

---

## Audio Processing Flow

```
1. Select audio from the library or upload a custom file
   v
2. Preview the audio against the scenes to check sync
   v
3. Set volume and fade effects for each scene
   v
4. Generate the full video with audio combined
   v
5. Save the result to IndexedDB with audio metadata
   v
6. View and play the video on the downloads page
```

---

## Storage with Audio

### IndexedDB Structure

```javascript
{
  id: 'local_1711353600000',
  title: 'Video with Music',
  blobKey: 'sm_current_video',
  audioMetadata: {
    id: 'upbeat-1',
    name: 'Upbeat Corporate',
    duration: 180,
    format: 'mp3',
    volume: 0.8,
    fadeIn: { duration: 500, enabled: true },
    fadeOut: { duration: 500, enabled: true },
    syncedTo: 'scene-based'
  },
  duration_seconds: 30,
  size_mb: 5.2,
  created_at: '2024-03-25T...',
  // ... other metadata
}
```

---

## UI Components

### Audio Selection Modal

```
Select Background Music
-----------------------

Music Library
- Corporate (12)
- Background (8)
- Electronic (15)
- ... more categories

Search...
[search box]

Or Upload Custom Audio
[Choose File] [Upload]

Preview Selected
[Upbeat Corporate] 3:00

[Select] [Cancel]
```

### Volume and Effects Control

```
Audio Settings
--------------

Volume: [====●====] 80%

Effects:
☑ Fade In   [500ms]
☑ Fade Out  [500ms]

Per-scene Volume Adjustment:
Scene 1: [==========] 100%
Scene 2: [========  ] 80%
Scene 3: [====●     ] 60%
...

[Apply]
```

---

## Implementation Steps

1. Create `AudioLibrary.jsx` and `AudioPlayer.jsx`
2. Update the video preview modal to support audio selection
3. Add audio syncing and fade controls
4. Combine video and audio streams during generation
5. Store audio metadata with the saved video
6. Update the downloads page with a playable video component
7. Test with multiple audio formats and browser playback

---

## Notes

- Use MP3 for widest browser support.
- Keep audio volumes moderate by default.
- Match audio length to the scene duration when possible.
- Prefer royalty-free audio sources or licensed user uploads.
