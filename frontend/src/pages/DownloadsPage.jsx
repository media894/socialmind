import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Play, Trash2, Eye, Calendar, Film, FileVideo } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/auth'
import { getLocalVideosKey } from '@/utils/accountStorage'
import { isPro } from '@/utils/subscription'
import CreateVideoChoiceModal from '@/components/CreateVideoChoiceModal'

export default function DownloadsPage() {
  const [videos, setVideos] = useState([])
  const [filter, setFilter] = useState('all') // all | approved | scheduled
  const [previewVideo, setPreviewVideo] = useState(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const accountId = user?.id || 'guest'
  const canDownload = isPro(user)

  useEffect(() => {
    loadVideos()
  }, [accountId])

  function loadVideos() {
    try {
      const all = JSON.parse(localStorage.getItem(getLocalVideosKey(accountId)) || '[]')
      // Show approved or scheduled videos (those that have been completed)
      const completed = all.filter(v => v.status === 'approved' || v.status === 'scheduled')
      setVideos(completed)
    } catch (e) {
      console.error('Error loading videos:', e)
      setVideos([])
    }
  }

  async function handleDownload(video) {
    if (!canDownload) {
      toast.error('Subscribe to download videos.')
      window.dispatchEvent(new Event('sm:open-plans'))
      return
    }
    try {
      // Check for stitched video first, fall back to original
      const stitchedKey = `sm_stitched_${video.id}`
      const fallbackKey = video.blobKey || 'sm_current_video'

      // Try to load the blob from IndexedDB
      const blob = await loadBlob(stitchedKey) || await loadBlob(fallbackKey)

      if (!blob) {
        toast.error('Video file not found. Try generating the video first.')
        return
      }

      // Create download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${video.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.webm`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success('Download started!')
    } catch (e) {
      console.error('Download error:', e)
      toast.error('Failed to download video')
    }
  }

  async function loadBlob(key) {
    try {
      const db = await openDB()
      const tx = db.transaction('blobs', 'readonly')
      const req = tx.objectStore('blobs').get(key)
      return new Promise((res, rej) => {
        req.onsuccess = () => res(req.result || null)
        req.onerror = () => rej(req.error)
      })
    } catch {
      return null
    }
  }

  function openDB() {
    return new Promise((res, rej) => {
      const req = indexedDB.open('socialmind_videos', 1)
      req.onupgradeneeded = e => e.target.result.createObjectStore('blobs')
      req.onsuccess = e => res(e.target.result)
      req.onerror = () => rej(req.error)
    })
  }

  function handleDelete(videoId) {
    if (!confirm('Delete this video? This action cannot be undone.')) return

    try {
      const all = JSON.parse(localStorage.getItem(getLocalVideosKey(accountId)) || '[]')
      const updated = all.filter(v => v.id !== videoId)
      localStorage.setItem(getLocalVideosKey(accountId), JSON.stringify(updated))

      // Also try to delete the blob from IndexedDB
      deleteVideoBlobs(videoId)

      loadVideos()
      toast.success('Video deleted')
    } catch (e) {
      toast.error('Failed to delete video')
    }
  }

  async function deleteVideoBlobs(videoId) {
    try {
      const db = await openDB()
      const tx = db.transaction('blobs', 'readwrite')
      const store = tx.objectStore('blobs')

      // Delete both stitched and original
      store.delete(`sm_stitched_${videoId}`)
      store.delete(videoId)

      return new Promise((res, rej) => {
        tx.oncomplete = () => res(true)
        tx.onerror = () => rej(tx.error)
      })
    } catch (e) {
      console.error('Error deleting blobs:', e)
    }
  }

  const filteredVideos = videos.filter(v => {
    if (filter === 'all') return true
    if (filter === 'approved') return v.status === 'approved'
    if (filter === 'scheduled') return v.status === 'scheduled'
    return true
  })

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Downloads</h1>
          <p className="text-white/40 text-sm mt-1">
            View and download your generated videos · {filteredVideos.length} videos
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {[
          { id: 'all', label: 'All Videos', count: videos.length },
          { id: 'approved', label: 'Approved', count: videos.filter(v => v.status === 'approved').length },
          { id: 'scheduled', label: 'Scheduled', count: videos.filter(v => v.status === 'scheduled').length },
        ].map(({ id, label, count }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`px-3 py-1.5 rounded-lg text-sm transition flex items-center gap-1.5 whitespace-nowrap border
              ${filter === id
                ? 'bg-brand-600/20 text-brand-400 border-brand-600/40'
                : 'text-white/50 border-white/10 hover:text-white hover:bg-white/5'}`}>
            {label}
            <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-xs">{count}</span>
          </button>
        ))}
      </div>

      {/* Videos Grid */}
      {filteredVideos.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <FileVideo className="w-12 h-12 text-white/20 mx-auto mb-3" />
          <h3 className="text-white font-semibold mb-1">No videos yet</h3>
          <p className="text-white/40 text-sm mb-4">
            Create and approve videos to see them here
          </p>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="btn-primary inline-flex items-center gap-2">
            <Film className="w-4 h-4" />
            Create Video
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVideos.map(video => (
            <VideoCard
              key={video.id}
              video={video}
              onDownload={() => handleDownload(video)}
              canDownload={canDownload}
              onDelete={() => handleDelete(video.id)}
              onView={() => navigate(`/videos/local/${video.id}`)}
              onPreview={() => setPreviewVideo(video)}
            />
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {previewVideo && (
        <PreviewModal
          video={previewVideo}
          onClose={() => setPreviewVideo(null)}
          onDownload={() => handleDownload(previewVideo)}
          canDownload={canDownload}
        />
      )}
      {createModalOpen && <CreateVideoChoiceModal onClose={() => setCreateModalOpen(false)} />}
    </div>
  )
}

function VideoCard({ video, onDownload, onDelete, onView, onPreview, canDownload }) {
  return (
    <div className="glass-card overflow-hidden group">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-slate-800 overflow-hidden cursor-pointer" onClick={onPreview}>
        {video.scenes?.[0]?.videoUrl ? (
          <video
            src={video.scenes[0].videoUrl}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            muted
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">🎬</div>
        )}

        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onView() }}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20">
            <Eye className="w-5 h-5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onPreview() }}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20">
            <Play className="w-5 h-5" />
          </button>
        </div>

        {/* Status badge */}
        <div className="absolute top-2 right-2">
          <span className={`px-2 py-1 rounded-lg text-xs font-semibold backdrop-blur-sm border
            ${video.status === 'approved'
              ? 'bg-green-500/20 border-green-500/40 text-green-400'
              : 'bg-blue-500/20 border-blue-500/40 text-blue-400'}`}>
            {video.status}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="font-semibold text-white text-sm mb-2 truncate">{video.title}</h3>

        <div className="flex items-center gap-3 text-xs text-white/40 mb-3">
          <span>{video.scenes?.length || 0} scenes</span>
          <span>•</span>
          <span>{video.duration_seconds}s</span>
          {video.created_at && (
            <>
              <span>•</span>
              <span>{format(new Date(video.created_at), 'MMM d')}</span>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onDownload}
            disabled={!canDownload}
            title={canDownload ? 'Download video' : 'Subscribe to download videos'}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
              canDownload
                ? 'bg-brand-600 hover:bg-brand-500 text-white'
                : 'bg-white/[0.04] text-white/30 cursor-not-allowed'
            }`}>
            <Download className="w-4 h-4" />
            Download
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function PreviewModal({ video, onClose, onDownload, canDownload }) {
  const [blobUrl, setBlobUrl] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadVideo()
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [video.id])

  async function loadVideo() {
    try {
      const stitchedKey = `sm_stitched_${video.id}`
      const fallbackKey = video.blobKey || 'sm_current_video'

      const blob = await loadBlob(stitchedKey) || await loadBlob(fallbackKey)

      if (blob) {
        const url = URL.createObjectURL(blob)
        setBlobUrl(url)
      }
    } catch (e) {
      console.error('Error loading video:', e)
    } finally {
      setLoading(false)
    }
  }

  async function loadBlob(key) {
    try {
      const db = await openDB()
      const tx = db.transaction('blobs', 'readonly')
      const req = tx.objectStore('blobs').get(key)
      return new Promise((res, rej) => {
        req.onsuccess = () => res(req.result || null)
        req.onerror = () => rej(req.error)
      })
    } catch {
      return null
    }
  }

  function openDB() {
    return new Promise((res, rej) => {
      const req = indexedDB.open('socialmind_videos', 1)
      req.onupgradeneeded = e => e.target.result.createObjectStore('blobs')
      req.onsuccess = e => res(e.target.result)
      req.onerror = () => rej(req.error)
    })
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass-card max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="font-semibold text-white">{video.title}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white">✕</button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="aspect-video bg-slate-800 rounded-lg flex items-center justify-center">
              <div className="text-white/40">Loading video...</div>
            </div>
          ) : blobUrl ? (
            <video
              src={blobUrl}
              controls
              autoPlay
              className="w-full rounded-lg bg-black"
            />
          ) : (
            <div className="aspect-video bg-slate-800 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <p className="text-white/40 mb-2">Video not available</p>
                <p className="text-white/30 text-sm">Generate the full video first</p>
              </div>
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <button
              onClick={onDownload}
              disabled={!canDownload}
              title={canDownload ? 'Download video' : 'Subscribe to download videos'}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2 font-semibold transition ${
                canDownload
                  ? 'btn-primary'
                  : 'bg-white/[0.04] text-white/30 cursor-not-allowed'
              }`}>
              <Download className="w-4 h-4" />
              Download Video
            </button>
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
