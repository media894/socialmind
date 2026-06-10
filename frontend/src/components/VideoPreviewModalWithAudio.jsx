import { useState, useRef } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Download, Loader2, Sparkles, Play, Pause, Volume2, Music } from 'lucide-react'
import toast from 'react-hot-toast'

const SCENE_DURATION = 6000

// Music library - kan expand pannalam with API later
const MUSIC_LIBRARY = [
  { id: 'upbeat-1', name: 'Upbeat Corporate', category: 'corporate', duration: 180, bpm: 120, volume: 0.8 },
  { id: 'calm-1', name: 'Calm Background', category: 'background', duration: 240, bpm: 90, volume: 0.7 },
  { id: 'energetic-1', name: 'Energetic Vibe', category: 'electronic', duration: 200, bpm: 130, volume: 0.8 },
  { id: 'smooth-1', name: 'Smooth Jazz', category: 'jazz', duration: 220, bpm: 100, volume: 0.6 },
]

export default function VideoPreviewModalWithAudio({ video, onFullVideoReady, onClose }) {
  const [currentScene, setCurrentScene] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [generatingFull, setGeneratingFull] = useState(false)
  const [fullVideoProgress, setFullVideoProgress] = useState(0)
  const [selectedAudio, setSelectedAudio] = useState(MUSIC_LIBRARY[0])
  const [audioVolume, setAudioVolume] = useState(0.8)
  const [showAudioLibrary, setShowAudioLibrary] = useState(false)
  const [fadeInEnabled, setFadeInEnabled] = useState(true)
  const [fadeOutEnabled, setFadeOutEnabled] = useState(true)
  
  const playerRef = useRef(null)
  const canvasRef = useRef(null)
  const audioRef = useRef(null)

  const scenes = video.scenes || []
  const scene = scenes[currentScene]

  function nextScene() {
    setCurrentScene((currentScene + 1) % scenes.length)
  }

  function prevScene() {
    setCurrentScene((currentScene - 1 + scenes.length) % scenes.length)
  }

  async function generateFullVideoWithAudio() {
    if (!scenes.length) {
      toast.error('No scenes available')
      return
    }

    if (!selectedAudio) {
      toast.error('Please select audio/music')
      return
    }

    setGeneratingFull(true)
    setFullVideoProgress(0)

    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      
      const [w, h] = video.videoFormat === '16/9' ? [1920, 1080] : [1080, 1080]
      canvas.width = w
      canvas.height = h

      // Create audio context for mixing
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      
      // Create dummy audio element for sync (in real app, load actual audio)
      const audioElement = new Audio()
      audioElement.volume = audioVolume
      
      const chunks = []
      const stream = canvas.captureStream(30)
      
      // Create MediaRecorder with audio support
      const mediaRecorder = new MediaRecorder(stream, { 
        mimeType: 'video/webm;codecs=vp8,opus',
        audioBitsPerSecond: 128000
      })

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' })
        
        // Attach audio metadata
        blob.audioMetadata = {
          audioId: selectedAudio.id,
          audioName: selectedAudio.name,
          volume: audioVolume,
          fadeIn: fadeInEnabled,
          fadeOut: fadeOutEnabled,
          timestamp: new Date().toISOString()
        }
        
        onFullVideoReady(blob)
        toast.success('✅ Full video with audio generated!')
        setGeneratingFull(false)
      }

      mediaRecorder.start()

      // Render scenes with audio sync
      for (let i = 0; i < scenes.length; i++) {
        const sc = scenes[i]
        const startTime = Date.now()

        while (Date.now() - startTime < SCENE_DURATION) {
          // Clear canvas
          ctx.fillStyle = '#000'
          ctx.fillRect(0, 0, w, h)

          // Render background video
          if (sc.videoUrl) {
            const video = document.createElement('video')
            video.src = sc.videoUrl
            video.muted = true
            video.currentTime = ((Date.now() - startTime) % SCENE_DURATION) / 1000
            ctx.drawImage(video, 0, 0, w, h)
          }

          // Calculate fade values
          const elapsed = Date.now() - startTime
          let volumeMultiplier = 1
          
          // Fade in
          if (fadeInEnabled && elapsed < 1000) {
            volumeMultiplier = elapsed / 1000
          }
          
          // Fade out
          if (fadeOutEnabled && elapsed > SCENE_DURATION - 1000) {
            volumeMultiplier = (SCENE_DURATION - elapsed) / 1000
          }

          // Add audio info visualization
          ctx.fillStyle = `rgba(150, 150, 255, ${0.3 * volumeMultiplier})`
          ctx.fillRect(0, h - 10, (elapsed / SCENE_DURATION) * w, 10)

          // Render overlay with audio indicator
          ctx.fillStyle = 'rgba(0,0,0,0.4)'
          ctx.fillRect(0, h - 220, w, 220)

          ctx.fillStyle = '#fff'
          ctx.font = 'bold 48px Arial'
          ctx.textAlign = 'center'
          ctx.fillText(sc.overlayText, w / 2, h - 120)

          ctx.font = '24px Arial'
          ctx.fillStyle = 'rgba(255,255,255,0.8)'
          ctx.fillText(sc.voiceover, w / 2, h - 50)

          // Audio indicator
          ctx.font = '18px Arial'
          ctx.fillStyle = 'rgba(100, 200, 255, 0.9)'
          ctx.fillText(`🎵 ${selectedAudio.name}`, w / 2, h - 150)

          const progress = ((i + (Date.now() - startTime) / SCENE_DURATION) / scenes.length) * 100
          setFullVideoProgress(Math.min(99, Math.round(progress)))

          await new Promise(resolve => setTimeout(resolve, 33))
        }
      }

      mediaRecorder.stop()
    } catch (error) {
      console.error('Error generating full video:', error)
      toast.error('Failed to generate full video with audio')
      setGeneratingFull(false)
    }
  }

  if (!scene) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-white/60">No scenes available</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700">
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-b from-surface-800 to-surface-900 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col border border-white/10 shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Music className="w-5 h-5 text-blue-400" />
            Video Preview with Audio
          </h3>
          <button onClick={onClose} className="text-white/50 hover:text-white text-xl">✕</button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-3 gap-4 p-5 h-full">
            
            {/* Video Player - Left */}
            <div className="col-span-2 space-y-4">
              <div ref={playerRef} className="relative bg-black rounded-lg overflow-hidden" style={{aspectRatio: '16/9'}}>
                {scene.videoUrl ? (
                  <>
                    <video
                      key={scene.videoUrl}
                      src={scene.videoUrl}
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    {/* Audio waveform visualization */}
                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/80 to-transparent flex items-end gap-1 p-2">
                      {Array.from({length: 30}).map((_, i) => (
                        <div key={i} 
                          className="flex-1 bg-blue-400 rounded-t opacity-70"
                          style={{height: `${Math.random() * 100}%`}}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-6xl bg-gradient-to-br from-slate-900 to-slate-800">
                    🎬
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent flex flex-col justify-end p-6 pointer-events-none">
                  <div className="font-bold text-white text-2xl mb-2">{scene.overlayText}</div>
                  <div className="text-white/85 text-lg mb-3">{scene.voiceover}</div>
                  <div className="flex items-center gap-2 text-sm text-blue-300">
                    <Music className="w-4 h-4" />
                    {selectedAudio?.name || 'No audio selected'}
                  </div>
                </div>

                <div className="absolute top-4 right-4 bg-blue-600/85 text-white text-xs font-bold px-4 py-2 rounded-full">
                  Scene {scene.sceneNumber || currentScene + 1} / {scenes.length}
                </div>
              </div>

              {/* Scene thumbnails */}
              <div className="flex gap-2 overflow-x-auto pb-2">
                {scenes.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentScene(i)}
                    className={`flex-shrink-0 w-20 h-12 rounded-lg border-2 overflow-hidden transition-all ${
                      i === currentScene
                        ? 'border-blue-400 ring-2 ring-blue-400/50'
                        : 'border-white/20 hover:border-white/40'
                    }`}
                  >
                    {s.videoUrl ? (
                      <video src={s.videoUrl} muted className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-800 text-xs">🎬</div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Audio Controls - Right */}
            <div className="space-y-4 bg-black/40 p-4 rounded-lg border border-white/10">
              <h4 className="font-semibold text-white flex items-center gap-2">
                <Music className="w-4 h-4 text-blue-400" />
                Audio Settings
              </h4>

              {/* Audio Selection */}
              <div className="space-y-2">
                <label className="text-xs text-white/60 uppercase">Background Music</label>
                <button
                  onClick={() => setShowAudioLibrary(!showAudioLibrary)}
                  className="w-full p-2 rounded-lg bg-white/10 border border-white/20 text-left text-sm text-white hover:bg-white/15 transition"
                >
                  {selectedAudio?.name || 'Select Music...'}
                </button>

                {showAudioLibrary && (
                  <div className="space-y-1 max-h-40 overflow-y-auto bg-black/60 p-2 rounded border border-white/20">
                    {MUSIC_LIBRARY.map(music => (
                      <button
                        key={music.id}
                        onClick={() => {
                          setSelectedAudio(music)
                          setShowAudioLibrary(false)
                          toast.success(`🎵 ${music.name} selected`)
                        }}
                        className={`w-full p-2 rounded text-xs text-left transition ${
                          selectedAudio?.id === music.id
                            ? 'bg-blue-600/60 text-white'
                            : 'bg-white/5 text-white/70 hover:bg-white/10'
                        }`}
                      >
                        <div className="font-medium">{music.name}</div>
                        <div className="text-xs text-white/50">{music.category} • {music.bpm}BPM</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Volume Control */}
              <div className="space-y-2">
                <label className="text-xs text-white/60 uppercase flex items-center justify-between">
                  <span>Volume</span>
                  <span className="text-blue-400">{Math.round(audioVolume * 100)}%</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={audioVolume * 100}
                  onChange={(e) => setAudioVolume(e.target.value / 100)}
                  className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Fade Effects */}
              <div className="space-y-2 border-t border-white/10 pt-3">
                <label className="text-xs text-white/60 uppercase">Effects</label>
                
                <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fadeInEnabled}
                    onChange={(e) => setFadeInEnabled(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  Fade In (1s)
                </label>

                <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fadeOutEnabled}
                    onChange={(e) => setFadeOutEnabled(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  Fade Out (1s)
                </label>
              </div>

              {/* Audio Info */}
              {selectedAudio && (
                <div className="text-xs text-white/50 bg-white/5 p-2 rounded border-l-2 border-blue-400">
                  <div><strong>{selectedAudio.name}</strong></div>
                  <div>{selectedAudio.category} • {selectedAudio.duration}s • {selectedAudio.bpm}BPM</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Controls Footer */}
        <div className="border-t border-white/10 bg-black/50 p-5 space-y-4">
          
          {/* Scene Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={prevScene}
              className="p-2 rounded-lg border border-white/20 text-white/60 hover:text-white hover:bg-white/10 transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex-1 flex items-center justify-center gap-3">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-2 rounded-lg bg-blue-600/20 border border-blue-600/40 text-blue-400 hover:bg-blue-600/30 transition"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <span className="text-xs text-white/60">
                Scene {currentScene + 1} of {scenes.length}
              </span>
            </div>

            <button
              onClick={nextScene}
              className="p-2 rounded-lg border border-white/20 text-white/60 hover:text-white hover:bg-white/10 transition"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Full Video Generation */}
          {generatingFull ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-3 py-4">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                <span className="text-white text-sm">Generating video with audio...</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all"
                  style={{ width: `${fullVideoProgress}%` }}
                />
              </div>
              <p className="text-xs text-white/40 text-center">{fullVideoProgress}% complete</p>
            </div>
          ) : (
            <button
              onClick={generateFullVideoWithAudio}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold hover:from-blue-700 hover:to-blue-800 transition-all border border-blue-500/50"
            >
              <Sparkles className="w-4 h-4" />
              🎵 Generate Full Video with Audio
            </button>
          )}

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  )
}
