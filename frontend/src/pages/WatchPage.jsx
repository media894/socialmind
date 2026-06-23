import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Play, Pause, Volume2, VolumeX, Loader2, AlertCircle } from 'lucide-react'
import axios from 'axios'
import { BACKEND_URL } from '@/api/client'

export default function WatchPage() {
  const { projectId } = useParams()
  const videoRef = useRef(null)
  const [videoInfo, setVideoInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    axios.get(`${BACKEND_URL}/videos/public/${projectId}/`)
      .then(r => { setVideoInfo(r.data); setLoading(false) })
      .catch(() => { setError('Video not found or no longer available.'); setLoading(false) })
  }, [projectId])

  function togglePlay() {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      videoRef.current.play()
      setPlaying(true)
    } else {
      videoRef.current.pause()
      setPlaying(false)
    }
  }

  function toggleMute() {
    if (!videoRef.current) return
    videoRef.current.muted = !muted
    setMuted(!muted)
  }

  function handleSeek(e) {
    if (!videoRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    videoRef.current.currentTime = ratio * duration
  }

  const progress = duration ? (currentTime / duration) * 100 : 0

  function formatTime(s) {
    if (!s || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4 text-white">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-lg font-medium">{error}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">S</div>
          <span className="text-white/50 text-sm">SocialMind</span>
        </div>

        <h1 className="text-white text-xl font-semibold mb-4 truncate">{videoInfo.title}</h1>

        {/* Video player */}
        <div className="relative bg-black rounded-2xl overflow-hidden shadow-2xl">
          <video
            ref={videoRef}
            src={videoInfo.video_url}
            className="w-full max-h-[70vh] object-contain"
            onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
            onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
            onEnded={() => setPlaying(false)}
            onClick={togglePlay}
            playsInline
          />

          {/* Overlay play button when paused */}
          {!playing && (
            <button
              onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition"
            >
              <div className="w-16 h-16 rounded-full bg-indigo-600/90 flex items-center justify-center shadow-xl">
                <Play className="w-7 h-7 text-white ml-1" />
              </div>
            </button>
          )}

          {/* Controls bar */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-8">
            {/* Progress bar */}
            <div
              className="w-full h-1.5 bg-white/20 rounded-full mb-3 cursor-pointer"
              onClick={handleSeek}
            >
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={togglePlay} className="text-white hover:text-indigo-300 transition">
                  {playing
                    ? <Pause className="w-5 h-5" />
                    : <Play  className="w-5 h-5" />
                  }
                </button>
                <span className="text-white/60 text-xs">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>
              <button onClick={toggleMute} className="text-white hover:text-indigo-300 transition">
                {muted
                  ? <VolumeX className="w-5 h-5" />
                  : <Volume2 className="w-5 h-5" />
                }
              </button>
            </div>
          </div>
        </div>

        <p className="text-white/30 text-xs text-center mt-4">
          Shared via SocialMind
        </p>
      </div>
    </div>
  )
}
