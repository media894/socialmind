import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, ChevronLeft, Calendar, Play, Pause, CheckCircle, Loader2, Film,
  AlertCircle, Settings,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { getLocalVideosKey } from '@/utils/accountStorage'
import { appendScheduleEntry } from '@/utils/localVideoSchedules'
import { videosApi, socialAccountsApi } from '@/api/client'

// ── IndexedDB helpers ─────────────────────────────────────────────────
const DB_NAME = 'socialmind_videos', DB_STORE = 'blobs', DB_VERSION = 1

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => e.target.result.createObjectStore(DB_STORE)
    req.onsuccess = e => res(e.target.result)
    req.onerror = () => rej(req.error)
  })
}
async function saveBlob(key, blob) {
  try {
    const db = await openDB()
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(blob, key)
    return new Promise((res, rej) => { tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error) })
  } catch { return false }
}

const PLATFORM_ICONS = {
  instagram: '📸', facebook: '👥', linkedin: '💼',
  youtube: '▶️', twitter: '🐦', tiktok: '🎵',
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function nowPlusMinutes(mins) {
  const d = new Date(Date.now() + mins * 60 * 1000)
  const offset = d.getTimezoneOffset()
  const localDate = new Date(d.getTime() - offset * 60 * 1000)
  return localDate.toISOString().slice(0, 16)
}

function titleFromFileName(fileName = '') {
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildFallbackCopy(topic = 'your video') {
  const cleanTopic = topic.trim() || 'your video'
  const words = cleanTopic
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter(word => word.length > 2) || []
  const topicTags = words
    .slice(0, 6)
    .map(word => `#${word.charAt(0).toUpperCase()}${word.slice(1)}`)
  const hashtags = [...new Set([...topicTags, '#Video', '#SocialMedia', '#ContentCreator'])].slice(0, 10)

  return {
    caption: `${cleanTopic.replace(/\b\w/g, char => char.toUpperCase())} is ready to share. Watch the full video and tell us what you think.`,
    hashtags: hashtags.join(' '),
  }
}

function getVideoMetadata(file) {
  return new Promise(resolve => {
    if (!file) {
      resolve({})
      return
    }

    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    const cleanup = () => URL.revokeObjectURL(objectUrl)

    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.onloadedmetadata = () => {
      const metadata = {
        duration_seconds: Number.isFinite(video.duration) ? Math.round(video.duration) : undefined,
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
        mime_type: file.type || undefined,
        size_mb: Number((file.size / 1024 / 1024).toFixed(1)),
      }
      cleanup()
      resolve(metadata)
    }
    video.onerror = () => {
      cleanup()
      resolve({})
    }
    video.src = objectUrl
  })
}

function captureVideoFrames(file, maxFrames = 3) {
  return new Promise(resolve => {
    if (!file) {
      resolve([])
      return
    }

    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const frames = []
    let seekIndex = 0
    const seekPoints = [0.15, 0.5, 0.85]
    const timeoutId = window.setTimeout(() => finish(), 8000)

    const cleanup = () => URL.revokeObjectURL(objectUrl)
    const finish = () => {
      window.clearTimeout(timeoutId)
      cleanup()
      resolve(frames.slice(0, maxFrames))
    }
    const seekNext = () => {
      if (seekIndex >= seekPoints.length || frames.length >= maxFrames) {
        finish()
        return
      }
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1
      const targetTime = Math.max(0, Math.min(Math.max(duration - 0.1, 0), duration * seekPoints[seekIndex]))
      seekIndex += 1
      if (Math.abs(video.currentTime - targetTime) < 0.01) {
        video.currentTime = Math.min(duration, targetTime + 0.01)
      } else {
        video.currentTime = targetTime
      }
    }

    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.onloadedmetadata = () => {
      if (!ctx || !video.videoWidth || !video.videoHeight) {
        finish()
        return
      }
      const scale = Math.min(1, 640 / video.videoWidth)
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
      seekNext()
    }
    video.onseeked = () => {
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        frames.push(canvas.toDataURL('image/jpeg', 0.72))
      } catch {
        finish()
        return
      }
      seekNext()
    }
    video.onerror = finish
    video.src = objectUrl
  })
}

export default function UploadVideoPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const accountId = user?.id || 'guest'
  const fileInputRef = useRef(null)
  const videoRef = useRef(null)
  const autoCopyRequestRef = useRef(0)
  const captionEditedRef = useRef(false)
  const hashtagsEditedRef = useRef(false)

  const [videoFile, setVideoFile] = useState(null)
  const [videoUrl, setVideoUrl] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [selectedAccountIds, setSelectedAccountIds] = useState([])
  const [scheduledAt, setScheduledAt] = useState(nowPlusMinutes(5))
  const [saving, setSaving] = useState(false)
  const [generatingCopy, setGeneratingCopy] = useState(false)
  const [done, setDone] = useState(false)

  const { data: socialAccounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['social-accounts'],
    queryFn: () => socialAccountsApi.list().then(r => Array.isArray(r.data) ? r.data : (r.data?.results || [])),
    staleTime: 30000,
  })

  const connectedAccounts = socialAccounts.filter(a => a.is_active)

  useEffect(() => {
    return () => { if (videoUrl) URL.revokeObjectURL(videoUrl) }
  }, [videoUrl])

  useEffect(() => {
    if (!videoFile || !title.trim()) return undefined
    if (captionEditedRef.current && hashtagsEditedRef.current) return undefined

    const timer = window.setTimeout(() => {
      generateUploadCopy(title.trim(), videoFile)
    }, 450)

    return () => window.clearTimeout(timer)
  }, [title, videoFile])

  function handleFileDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    if (file) processFile(file)
  }

  function handleFilePick(e) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  function processFile(file) {
    if (!file.type.startsWith('video/')) { toast.error('Please select a video file'); return }
    if (file.size > 500 * 1024 * 1024) { toast.error('File too large (max 500 MB)'); return }
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    const inferredTitle = titleFromFileName(file.name)
    setVideoFile(file)
    setVideoUrl(URL.createObjectURL(file))
    setPlaying(false)
    captionEditedRef.current = false
    hashtagsEditedRef.current = false
    setCaption('')
    setHashtags('')
    if (!title) {
      setTitle(inferredTitle)
    } else {
      generateUploadCopy(title.trim() || inferredTitle, file)
    }
  }

  async function generateUploadCopy(topic, file) {
    const requestId = autoCopyRequestRef.current + 1
    autoCopyRequestRef.current = requestId
    setGeneratingCopy(true)

    const selectedAccount = connectedAccounts.find(account => selectedAccountIds.includes(String(account.id)))
    const platform = selectedAccount?.platform || connectedAccounts[0]?.platform || 'instagram'

    try {
      const [videoMetadata, frameImages] = await Promise.all([
        getVideoMetadata(file),
        captureVideoFrames(file),
      ])

      const { data } = await videosApi.generateCaption({
        title: topic,
        file_name: file?.name || '',
        video_metadata: videoMetadata,
        frame_images: frameImages,
        platform,
      })
      if (autoCopyRequestRef.current !== requestId) return

      const nextCaption = String(data?.caption || '').trim()
      const nextHashtags = Array.isArray(data?.hashtags)
        ? data.hashtags.join(' ')
        : String(data?.hashtags || '').trim()

      if (nextCaption && !captionEditedRef.current) setCaption(nextCaption)
      if (nextHashtags && !hashtagsEditedRef.current) setHashtags(nextHashtags)
    } catch {
      if (autoCopyRequestRef.current !== requestId) return
      const fallback = buildFallbackCopy(topic)
      if (!captionEditedRef.current) setCaption(fallback.caption)
      if (!hashtagsEditedRef.current) setHashtags(fallback.hashtags)
    } finally {
      if (autoCopyRequestRef.current === requestId) setGeneratingCopy(false)
    }
  }

  function togglePlay() {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      videoRef.current.play(); setPlaying(true)
    } else {
      videoRef.current.pause(); setPlaying(false)
    }
  }

  function toggleAccount(id) {
    setSelectedAccountIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function handleSchedule() {
    if (!videoFile) { toast.error('Please select a video file'); return }
    if (!title.trim()) { toast.error('Please enter a title'); return }
    if (!selectedAccountIds.length) { toast.error('Select at least one social account'); return }
    if (!scheduledAt) { toast.error('Pick a schedule date & time'); return }
    const scheduledDate = new Date(scheduledAt)
    if (Number.isNaN(scheduledDate.getTime())) { toast.error('Invalid date/time'); return }
    if (scheduledDate.getTime() <= Date.now() + 60 * 1000) {
      toast.error('Schedule must be at least 1 minute in the future'); return
    }

    setSaving(true)
    try {
      const videoId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const blobKey = `sm_uploaded_${accountId}_${videoId}`
      await saveBlob(blobKey, videoFile)

      const scheduledIso = scheduledDate.toISOString()
      const hashtagList = hashtags
        .split(/[\s,]+/)
        .map(h => h.replace(/^#*/, '#'))
        .filter(h => h.length > 1)

      const selectedAccounts = connectedAccounts.filter(a => selectedAccountIds.includes(String(a.id)))

      // ── Submit to backend so Celery can publish automatically ──────
      const formData = new FormData()
      formData.append('file', videoFile, videoFile.name)
      formData.append('title', title.trim())
      formData.append('caption', caption.trim())
      formData.append('scheduled_at', scheduledIso)
      hashtagList.forEach(tag => formData.append('hashtags', tag))
      selectedAccountIds.forEach(id => formData.append('social_accounts', id))

      let backendPosts = []
      let backendProjectId = null

      try {
        const { data } = await videosApi.scheduleLocalVideo(formData)
        backendProjectId = data?.project?.id ? String(data.project.id) : null
        if (Array.isArray(data?.posts)) {
          backendPosts = data.posts.map(p => ({
            id: String(p.id),
            project: backendProjectId,
            platform: p.platform || p.social_account?.platform || '',
            status: p.status || 'scheduled',
            scheduledAt: p.scheduled_at || scheduledIso,
          }))
        }
      } catch (backendErr) {
        const msg = backendErr?.response?.data?.error || 'Could not register with server — video saved locally only'
        toast.error(msg)
      }

      // ── Save to localStorage ───────────────────────────────────────
      const videoMeta = {
        id: videoId,
        title: title.trim(),
        description: caption.trim(),
        topic: '',
        script: '',
        scenes: [],
        hashtags: hashtagList,
        videoFormat: '16/9',
        workImages: [],
        logoImage: '',
        blobKey,
        sizeMB: (videoFile.size / 1024 / 1024).toFixed(1),
        status: 'approved',
        content_type: 'uploaded',
        duration_seconds: 0,
        ai_service: null,
        created_at: new Date().toISOString(),
        source: 'manual_upload',
        fileName: videoFile.name,
        fileType: videoFile.type,
        backendProjectId,
      }

      const platformsForEntry = [...new Set(selectedAccounts.map(a => a.platform).filter(Boolean))]

      let scheduledVideo = videoMeta
      scheduledVideo = appendScheduleEntry(scheduledVideo, {
        id: `schedule_${Date.now()}_0`,
        scheduledAt: scheduledIso,
        scheduledPlatforms: platformsForEntry,
        scheduledTitle: title.trim(),
        scheduledCaption: caption,
        scheduledHashtags: hashtags,
        postStatus: 'scheduled',
        backendProjectId,
        backendPosts,
      })

      const existing = JSON.parse(localStorage.getItem(getLocalVideosKey(accountId)) || '[]')
      localStorage.setItem(
        getLocalVideosKey(accountId),
        JSON.stringify([scheduledVideo, ...existing].slice(0, 50))
      )
      window.dispatchEvent(new Event('socialmind:local-videos-changed'))

      setDone(true)
      toast.success('Video scheduled successfully!')
    } catch {
      toast.error('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-surface-card border border-surface-border rounded-2xl p-8 max-w-sm w-full text-center space-y-5">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
          <div>
            <p className="text-white font-semibold text-lg">Video Scheduled!</p>
            <p className="text-white/40 text-sm mt-1">Your video is ready to share</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => navigate('/schedule')}
              className="btn-primary flex-1 py-2 text-sm"
            >
              View Schedule
            </button>
            <button
              onClick={() => navigate('/videos/upload')}
              className="flex-1 py-2 text-sm rounded-xl border border-surface-border text-white/60 hover:text-white hover:bg-white/5 transition"
            >
              Upload Another
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Upload Video</h1>
          <p className="text-white/40 text-sm">Upload from your device and schedule to social media</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Drop zone / preview */}
        {!videoFile ? (
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-surface-border rounded-2xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-brand-600/50 hover:bg-white/3 transition group"
          >
            <div className="w-14 h-14 rounded-2xl bg-brand-600/15 flex items-center justify-center group-hover:bg-brand-600/25 transition">
              <Upload className="w-7 h-7 text-brand-400" />
            </div>
            <div className="text-center">
              <p className="text-white font-medium">Drop your video here</p>
              <p className="text-white/40 text-sm mt-0.5">or click to browse — MP4, MOV, WebM (max 500 MB)</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFilePick}
            />
          </div>
        ) : (
          <div className="bg-surface-card border border-surface-border rounded-2xl overflow-hidden">
            <div className="relative bg-black aspect-video flex items-center justify-center">
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-full object-contain"
                onEnded={() => setPlaying(false)}
              />
              <button
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition opacity-0 hover:opacity-100"
              >
                {playing
                  ? <Pause className="w-12 h-12 text-white drop-shadow" />
                  : <Play  className="w-12 h-12 text-white drop-shadow" />
                }
              </button>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
              <div className="flex items-center gap-2 min-w-0">
                <Film className="w-4 h-4 text-white/40 flex-shrink-0" />
                <span className="text-white/70 text-sm truncate">{videoFile.name}</span>
                <span className="text-white/30 text-xs flex-shrink-0">({formatFileSize(videoFile.size)})</span>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-brand-400 hover:text-brand-300 transition flex-shrink-0 ml-3"
              >
                Change
              </button>
              <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFilePick} />
            </div>
          </div>
        )}

        {/* Title */}
        <div>
          <label className="block text-white/70 text-sm font-medium mb-1.5">Title</label>
          <input
            className="input w-full"
            placeholder="Enter a title for your video"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>

        {/* Caption */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-white/70 text-sm font-medium">Caption</label>
            {generatingCopy && (
              <span className="inline-flex items-center gap-1.5 text-xs text-brand-300">
                <Loader2 className="h-3 w-3 animate-spin" />
                Generating
              </span>
            )}
          </div>
          <textarea
            className="input w-full resize-none"
            rows={3}
            placeholder="Write a caption for your post…"
            value={caption}
            onChange={e => {
              captionEditedRef.current = true
              setCaption(e.target.value)
            }}
          />
        </div>

        {/* Hashtags */}
        <div>
          <label className="block text-white/70 text-sm font-medium mb-1.5">Hashtags</label>
          <input
            className="input w-full"
            placeholder="#marketing #socialmedia #video"
            value={hashtags}
            onChange={e => {
              hashtagsEditedRef.current = true
              setHashtags(e.target.value)
            }}
          />
        </div>

        {/* Connected account selection */}
        <div>
          <label className="block text-white/70 text-sm font-medium mb-2">Publish To</label>
          {accountsLoading ? (
            <div className="flex items-center gap-2 text-white/40 text-sm py-3">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading accounts…
            </div>
          ) : connectedAccounts.length === 0 ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-300 text-sm font-medium">No connected accounts</p>
                <p className="text-amber-300/60 text-xs mt-1">
                  Connect your social accounts in Settings before scheduling a video.
                </p>
                <button
                  onClick={() => navigate('/settings')}
                  className="mt-2 flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-200 transition"
                >
                  <Settings className="w-3.5 h-3.5" /> Go to Settings
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {connectedAccounts.map(account => {
                const selected = selectedAccountIds.includes(String(account.id))
                const icon = PLATFORM_ICONS[account.platform] || '🌐'
                const label = account.platform_name || account.platform_username || account.platform
                return (
                  <button
                    key={account.id}
                    onClick={() => toggleAccount(String(account.id))}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left
                      ${selected
                        ? 'bg-brand-600/20 border-brand-600/50 text-white'
                        : 'bg-white/5 border-surface-border text-white/50 hover:text-white hover:bg-white/10'
                      }`}
                  >
                    <span className="text-lg leading-none flex-shrink-0">{icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{label}</div>
                      <div className="text-xs text-white/35 capitalize">{account.platform}</div>
                    </div>
                    {selected && <CheckCircle className="w-4 h-4 text-brand-400 flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Schedule date/time */}
        <div>
          <label className="block text-white/70 text-sm font-medium mb-1.5">
            <Calendar className="w-4 h-4 inline mr-1.5 text-white/40" />
            Schedule Date & Time
          </label>
          <input
            type="datetime-local"
            className="input w-full"
            value={scheduledAt}
            onChange={e => setScheduledAt(e.target.value)}
            min={(() => {
              const d = new Date()
              const offset = d.getTimezoneOffset()
              return new Date(d.getTime() - offset * 60 * 1000).toISOString().slice(0, 16)
            })()}
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSchedule}
          disabled={saving || !videoFile || connectedAccounts.length === 0}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Scheduling…</>
            : <><Calendar className="w-4 h-4" /> Schedule Video</>
          }
        </button>
      </div>
    </div>
  )
}
