import { useState, useEffect, useRef } from 'react'
import { Trash2, FileVideo, Loader2, Play, Pause, Volume2, X, HardDrive, Film, QrCode, Copy } from 'lucide-react'
import QRCodeImage from '@/components/QRCodeImage'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/auth'
import { getLocalVideosKey } from '@/utils/accountStorage'
import SubscriptionGate from '@/components/SubscriptionGate'

// IndexedDB helpers
const DB_NAME = 'socialmind_videos', DB_STORE = 'blobs', DB_VERSION = 1

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => e.target.result.createObjectStore(DB_STORE)
    req.onsuccess = e => res(e.target.result)
    req.onerror = () => rej(req.error)
  })
}

async function loadBlob(key) {
  try {
    const db = await openDB()
    const tx = db.transaction(DB_STORE, 'readonly')
    const req = tx.objectStore(DB_STORE).get(key)
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result || null)
      req.onerror = () => rej(req.error)
    })
  } catch { return null }
}

async function deleteBlob(key) {
  try {
    const db = await openDB()
    const tx = db.transaction(DB_STORE, 'readwrite')
    const req = tx.objectStore(DB_STORE).delete(key)
    return new Promise((res, rej) => {
      req.onsuccess = () => res(true)
      req.onerror = () => rej(req.error)
    })
  } catch { return false }
}

// ── Video Player Modal ────────────────────────────────────────────────────────
function VideoPlayer({ videoUrl, videoTitle, onClose }) {
  const [isPlaying, setIsPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const videoRef = useRef(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onTime = () => setCurrentTime(video.currentTime)
    const onMeta = () => setDuration(video.duration)
    const onEnd  = () => setIsPlaying(false)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('ended', onEnd)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('ended', onEnd)
    }
  }, [])

  const togglePlay = () => {
    if (!videoRef.current) return
    if (isPlaying) videoRef.current.pause()
    else videoRef.current.play()
    setIsPlaying(p => !p)
  }

  const handleSeek = (t) => {
    if (videoRef.current) { videoRef.current.currentTime = t; setCurrentTime(t) }
  }

  const handleVol = (v) => {
    setVolume(v)
    if (videoRef.current) videoRef.current.volume = v
  }

  const fmt = (t) => {
    if (!t) return '0:00'
    return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <h3 className="font-semibold text-white truncate">{videoTitle}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 bg-black flex items-center justify-center relative overflow-hidden">
          <video ref={videoRef} src={videoUrl} className="w-full h-full object-contain" autoPlay />
          {!isPlaying && (
            <button
              onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/20 transition"
            >
              <div className="bg-white/20 p-5 rounded-full">
                <Play className="w-10 h-10 text-white fill-white" />
              </div>
            </button>
          )}
        </div>

        <div className="bg-black/60 border-t border-surface-border p-4 space-y-3">
          <div>
            <input
              type="range" min="0" max={duration || 0} value={currentTime}
              onChange={e => handleSeek(parseFloat(e.target.value))}
              className="w-full h-1.5 accent-brand-500 cursor-pointer"
            />
            <div className="flex justify-between text-xs text-white/40 mt-1">
              <span>{fmt(currentTime)}</span>
              <span>{fmt(duration)}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={togglePlay} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition">
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-white" />}
            </button>
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-white/50" />
              <input
                type="range" min="0" max="100" value={Math.round(volume * 100)}
                onChange={e => handleVol(e.target.value / 100)}
                className="w-24 h-1.5 accent-brand-500 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── QR Code Modal ─────────────────────────────────────────────────────────────
function QRModal({ video, onClose }) {
  const watchUrl = video.backendProjectId
    ? `${window.location.origin}/watch/${video.backendProjectId}`
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-surface-card border border-surface-border rounded-2xl p-6 max-w-xs w-full text-center space-y-4 shadow-2xl">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-white font-semibold text-sm truncate flex-1 text-left">{video.title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        {watchUrl ? (
          <>
            <div className="bg-white rounded-xl p-4 mx-auto w-fit">
              <QRCodeImage url={watchUrl} size={160} />
            </div>
            <p className="text-white/50 text-xs">
              Scan to watch this video on any device
            </p>
            <div className="flex items-center gap-2 bg-white/5 border border-surface-border rounded-xl px-3 py-2">
              <span className="text-white/40 text-xs truncate flex-1 text-left">{watchUrl}</span>
              <button
                onClick={() => { navigator.clipboard.writeText(watchUrl); toast.success('Link copied!') }}
                className="text-brand-400 hover:text-brand-300 transition flex-shrink-0"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <div className="py-4 text-white/40 text-sm">
            QR code not available — this video was not synced to the server.
          </div>
        )}

        <button onClick={onClose} className="btn-primary w-full py-2 text-sm">Done</button>
      </div>
    </div>
  )
}

// ── Main Downloads Page ───────────────────────────────────────────────────────
export default function DownloadsPageWithPlayer() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [qrVideo, setQrVideo] = useState(null)
  const { user } = useAuthStore()
  const accountId = user?.id || 'guest'

  useEffect(() => { loadLocalVideos() }, [accountId])

  async function loadLocalVideos() {
    setLoading(true)
    try {
      const saved = JSON.parse(localStorage.getItem(getLocalVideosKey(accountId)) || '[]')
        .filter(v => v.hasDownloaded || v.downloadedAt)
      const withBlobs = await Promise.all(
        saved.map(async (video) => {
          const blob = await loadBlob(`sm_stitched_${video.id}`) || await loadBlob(video.blobKey)
          return { ...video, blob, blobUrl: blob ? URL.createObjectURL(blob) : null }
        })
      )
      setVideos(withBlobs)
    } catch {
      toast.error('Failed to load videos')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(video) {
    if (!confirm(`Delete "${video.title}"?`)) return
    try {
      await deleteBlob(`sm_stitched_${video.id}`)
      if (video.blobKey && video.blobKey !== `sm_stitched_${video.id}`) await deleteBlob(video.blobKey)
      const updated = videos.filter(v => v.id !== video.id)
      setVideos(updated)
      localStorage.setItem(getLocalVideosKey(accountId), JSON.stringify(updated.map(({ blob, blobUrl, ...v }) => v)))
      toast.success('Video deleted')
      if (selectedVideo?.id === video.id) setSelectedVideo(null)
    } catch {
      toast.error('Failed to delete video')
    }
  }

  const totalMB = (videos.reduce((sum, v) => sum + (v.blob?.size || 0), 0) / 1024 / 1024).toFixed(1)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
      </div>
    )
  }

  return (
    <SubscriptionGate feature="downloads">
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Downloads</h1>
        <p className="text-white/40 text-sm mt-0.5">Your downloaded videos</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-surface-card border border-surface-border rounded-2xl p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-brand-600/20 flex items-center justify-center">
            <Film className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <div className="text-3xl font-black text-white">{videos.length}</div>
            <div className="text-xs text-white/40 uppercase tracking-wider font-medium mt-0.5">Videos</div>
          </div>
        </div>
        <div className="bg-surface-card border border-surface-border rounded-2xl p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-600/20 flex items-center justify-center">
            <HardDrive className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="text-3xl font-black text-white">{totalMB} <span className="text-lg font-bold text-white/50">MB</span></div>
            <div className="text-xs text-white/40 uppercase tracking-wider font-medium mt-0.5">Storage Used</div>
          </div>
        </div>
      </div>

      {/* Video list */}
      {videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <FileVideo className="w-8 h-8 text-white/20" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No downloads yet</h3>
          <p className="text-white/40 text-sm max-w-xs">Videos you download from the app will appear here.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map(video => (
            <div
              key={video.id}
              className="bg-surface-card border border-surface-border rounded-2xl overflow-hidden hover:border-brand-600/40 transition-all"
            >
              {/* Thumbnail */}
              <div className="relative bg-black aspect-video">
                {video.blobUrl ? (
                  <>
                    <video src={video.blobUrl} className="w-full h-full object-cover" muted />
                    <button
                      onClick={() => setSelectedVideo(video)}
                      className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/25 transition"
                    >
                      <div className="bg-brand-500 hover:bg-brand-400 p-3 rounded-full shadow-xl transition">
                        <Play className="w-5 h-5 text-white fill-white" />
                      </div>
                    </button>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <FileVideo className="w-10 h-10 text-white/20" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="font-semibold text-white text-sm truncate mb-1">{video.title}</h3>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/30">
                    {new Date(video.created_at).toLocaleDateString()}
                    {video.sizeMB && ` · ${video.sizeMB} MB`}
                  </span>
                  <div className="flex items-center gap-1">
                    {video.backendProjectId && (
                      <button
                        onClick={() => setQrVideo(video)}
                        className="p-1.5 rounded-lg text-white/30 hover:text-brand-400 hover:bg-brand-500/10 transition"
                        title="Show QR code"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(video)}
                      className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Player modal */}
      {selectedVideo?.blobUrl && (
        <VideoPlayer
          videoUrl={selectedVideo.blobUrl}
          videoTitle={selectedVideo.title}
          onClose={() => setSelectedVideo(null)}
        />
      )}

      {/* QR code modal */}
      {qrVideo && <QRModal video={qrVideo} onClose={() => setQrVideo(null)} />}
    </div>
    </SubscriptionGate>
  )
}