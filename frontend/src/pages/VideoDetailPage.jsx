import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, Play, CheckCircle, XCircle, Calendar, Send,
  RefreshCw, Edit2, Save, Copy, Hash, Loader2, Clock, AlertCircle, Download
} from 'lucide-react'
import { videosApi, schedulingApi, socialAccountsApi } from '@/api/client'
import { StatusBadge } from '@/components/ui'
import { useAuthStore } from '@/store/auth'
import { getLocalVideosKey } from '@/utils/accountStorage'
import { isPro } from '@/utils/subscription'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const PLATFORM_SHORT_LABELS = {
  instagram: 'IG',
  facebook: 'FB',
  linkedin: 'LN',
  youtube: 'YT',
}

export default function VideoDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editingCaption, setEditingCaption] = useState(false)
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [scheduleModal, setScheduleModal] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({ social_account: '', scheduled_at: '', custom_caption: '' })
  const [taskProgress, setTaskProgress] = useState(null)
  const [videoLoadFailed, setVideoLoadFailed] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const refreshUser = useAuthStore(state => state.refreshUser)
  const user = useAuthStore(state => state.user)
  const accountId = user?.id || 'guest'
  const canDownload = isPro(user)

  const { data: video, isLoading } = useQuery({
    queryKey: ['video', accountId, id],
    queryFn: () => videosApi.get(id).then(r => r.data),
    refetchInterval: data => ['generating'].includes(data?.status) ? 3000 : false,
  })

  const { data: socialAccounts } = useQuery({
    queryKey: ['social-accounts', accountId],
    queryFn: () => socialAccountsApi.list().then(r => r.data),
  })

  useEffect(() => {
    if (video) {
      setCaption(video.edited_caption || video.ai_caption || '')
      setHashtags((video.edited_hashtags?.length ? video.edited_hashtags : video.ai_hashtags || []).join(' '))
    }
  }, [video?.id])

  useEffect(() => {
    setVideoLoadFailed(false)
  }, [video?.video_url, video?.video_file])

  const approveMutation = useMutation({
    mutationFn: () => videosApi.approve(id, {
      caption,
      hashtags: hashtags.split(/\s+/).filter(h => h.startsWith('#')),
    }),
    onSuccess: () => {
      qc.invalidateQueries(['video', accountId, id])
      qc.invalidateQueries(['videos', accountId])
      toast.success('Video approved!')
    },
    onError: err => toast.error(err.response?.data?.error || 'Failed to approve'),
  })

  const rejectMutation = useMutation({
    mutationFn: () => videosApi.reject(id),
    onSuccess: () => {
      qc.invalidateQueries(['video', accountId, id])
      qc.invalidateQueries(['videos', accountId])
      toast.success('Sent back to draft')
    },
  })

  const regenerateMutation = useMutation({
    mutationFn: () => videosApi.generate(id),
    onSuccess: async () => {
      await refreshUser()
      qc.invalidateQueries(['video', accountId, id])
      toast.success('Regeneration started!')
    },
    onError: err => toast.error(err.response?.data?.error || 'Failed to regenerate. Add an API key in Settings first.'),
  })

  const saveCaptionMutation = useMutation({
    mutationFn: () => videosApi.update(id, {
      edited_caption: caption,
      edited_hashtags: hashtags.split(/\s+/).filter(h => h.startsWith('#')),
    }),
    onSuccess: () => { setEditingCaption(false); qc.invalidateQueries(['video', accountId, id]); toast.success('Caption saved') },
  })

  const scheduleMutation = useMutation({
    mutationFn: () => {
      const scheduledTime = new Date(scheduleForm.scheduled_at).getTime()
      if (!scheduledTime || scheduledTime <= Date.now() + 60000) {
        return Promise.reject(new Error('Pick a future date and time at least 1 minute ahead.'))
      }
      return schedulingApi.create({
        project: id,
        social_account: scheduleForm.social_account,
        scheduled_at: scheduleForm.scheduled_at,
        custom_caption: scheduleForm.custom_caption || caption,
        custom_hashtags: hashtags.split(/\s+/).filter(h => h.startsWith('#')),
      })
    },
    onSuccess: () => {
      setScheduleModal(false)
      qc.invalidateQueries(['videos', accountId])
      qc.invalidateQueries(['posts', accountId])
      qc.invalidateQueries(['video', accountId, id])
      toast.success('✅ Post scheduled!')
      navigate('/schedule')
    },
    onError: err => toast.error(err.response?.data?.error || 'Failed to schedule'),
  })

  if (isLoading) return (
    <div className="p-6 flex justify-center items-center min-h-[400px]">
      <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
    </div>
  )
  if (!video) return <div className="p-6 text-white/50">Video not found</div>

  const isGenerating = video.status === 'generating'
  const isReview = video.status === 'review'
  const isApproved = video.status === 'approved'
  const previewSrc = resolvePreviewSrc(video.video_url || video.video_file || '')

  const openDB = () => new Promise((res, rej) => {
    const req = indexedDB.open('socialmind_videos', 1)
    req.onupgradeneeded = e => e.target.result.createObjectStore('blobs')
    req.onsuccess = e => res(e.target.result)
    req.onerror = () => rej(req.error)
  })

  const saveDownloadedVideo = async (blob) => {
    const blobKey = `sm_stitched_${video.id}`
    const db = await openDB()
    await new Promise((res, rej) => {
      const tx = db.transaction('blobs', 'readwrite')
      tx.objectStore('blobs').put(blob, blobKey)
      tx.oncomplete = () => res(true)
      tx.onerror = () => rej(tx.error)
    })

    try {
      const all = JSON.parse(localStorage.getItem(getLocalVideosKey(accountId)) || '[]')
      const existing = all.find(entry => String(entry.id) === String(video.id))
      const nextEntry = {
        ...(existing || {}),
        id: existing?.id || video.id,
        title: video.title || existing?.title || 'Video',
        topic: video.topic || existing?.topic || '',
        script: video.ai_script || existing?.script || '',
        scenes: video.scenes || existing?.scenes || [],
        videoFormat: video.format || existing?.videoFormat || '16/9',
        blobKey,
        sizeMB: Number((blob.size / 1024 / 1024).toFixed(1)),
        status: existing?.status || video.status || 'approved',
        content_type: existing?.content_type || video.content_type || 'promotional',
        duration_seconds: existing?.duration_seconds || video.duration_seconds || 0,
        ai_service: existing?.ai_service || video.ai_service || 'local-upload',
        created_at: existing?.created_at || video.created_at || new Date().toISOString(),
        hasDownloaded: true,
        downloadedAt: new Date().toISOString(),
      }
      const filtered = all.filter(entry => String(entry.id) !== String(nextEntry.id))
      localStorage.setItem(getLocalVideosKey(accountId), JSON.stringify([nextEntry, ...filtered].slice(0, 50)))
    } catch (error) {
      console.warn('Failed to persist downloaded video entry', error)
    }
  }

  const handleDownloadVideo = async () => {
    if (!previewSrc || downloading) return
    if (!canDownload) {
      toast.error('Subscribe to download videos.')
      window.dispatchEvent(new Event('sm:open-plans'))
      return
    }
    setDownloading(true)
    try {
      const response = await fetch(previewSrc)
      if (!response.ok) throw new Error('Failed to fetch video')
      const blob = await response.blob()
      await saveDownloadedVideo(blob)

      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `${(video.title || 'video').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.webm`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      qc.invalidateQueries(['downloads'])
      toast.success('Video downloaded and saved to Downloads')
    } catch (error) {
      console.error('Download failed', error)
      toast.error('Failed to download video')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="px-6 py-6 w-full">
      {/* Back */}
      <button onClick={() => navigate('/videos')}
        className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" /> Back to Videos
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{video.title}</h1>
            <StatusBadge status={video.status} />
          </div>
          <p className="text-white/40 text-sm capitalize">{video.content_type} · {video.duration_seconds}s · {video.ai_service}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 flex-wrap">
          {/* Regenerate */}
          {['draft', 'review', 'failed'].includes(video.status) && (
            <button
              onClick={() => regenerateMutation.mutate()}
              disabled={regenerateMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 text-sm transition"
            >
              {regenerateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Regenerate
            </button>
          )}

          {/* Reject */}
          {isReview && (
            <button
              onClick={() => rejectMutation.mutate()}
              disabled={rejectMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm transition"
            >
              <XCircle className="w-4 h-4" /> Reject
            </button>
          )}

          {/* Approve */}
          {isReview && (
            <button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition"
            >
              {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Approve
            </button>
          )}

          {/* Schedule */}
          {isApproved && (
            <>
              <button
                onClick={() => navigate(`/videos/${id}/schedule`)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition"
              >
                <Send className="w-4 h-4" /> Schedule to All Platforms
              </button>
              <button
                onClick={() => setScheduleModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-white/70 hover:text-white hover:bg-white/5 text-sm transition"
              >
                <Calendar className="w-4 h-4" /> Quick Schedule
              </button>
            </>
          )}

          {previewSrc && (
            <button
              onClick={handleDownloadVideo}
              disabled={downloading || !canDownload}
              title={canDownload ? 'Download video' : 'Subscribe to download videos'}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm transition disabled:opacity-60 ${
                canDownload
                  ? 'border-white/10 text-white/70 hover:text-white hover:bg-white/5'
                  : 'border-white/10 text-white/30 bg-white/[0.03] cursor-not-allowed'
              }`}
            >
              <Download className="w-4 h-4" />
              {canDownload ? (downloading ? 'Downloading...' : 'Download') : 'Subscribe to Download'}
            </button>
          )}
        </div>
      </div>

      {/* Generating Progress */}
      {isGenerating && (
        <div className="glass-card p-6 mb-6 border border-brand-600/30">
          <div className="flex items-center gap-3 mb-4">
            <Loader2 className="w-5 h-5 text-brand-400 animate-spin" />
            <span className="font-medium text-white">AI is generating your video...</span>
          </div>
          <div className="space-y-2">
            {['Generating script with AI', 'Creating captions & hashtags', 'Rendering video with MoviePy', 'Uploading to storage'].map((step, i) => (
              <div key={step} className="flex items-center gap-3 text-sm text-white/50">
                <div className="w-2 h-2 rounded-full bg-brand-400/50 animate-pulse" style={{ animationDelay: `${i * 0.5}s` }} />
                {step}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Video Preview */}
        <div className="glass-card p-5">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Play className="w-4 h-4 text-brand-400" /> Video Preview
          </h2>
          <div className="aspect-video bg-surface-50 rounded-xl overflow-hidden flex items-center justify-center mb-4">
            {previewSrc && !videoLoadFailed ? (
              <video
                key={previewSrc}
                controls
                preload="metadata"
                playsInline
                poster={video.thumbnail_url || undefined}
                className="w-full h-full object-contain"
                onError={() => setVideoLoadFailed(true)}
              >
                <source src={previewSrc} type={video.format === 'webm' ? 'video/webm' : 'video/mp4'} />
                <source src={previewSrc} />
              </video>
            ) : video.thumbnail_url ? (
              <img src={video.thumbnail_url} alt="thumbnail" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center">
                {isGenerating
                  ? <><Loader2 className="w-8 h-8 text-brand-400 animate-spin mx-auto mb-2" /><p className="text-white/40 text-sm">Generating...</p></>
                  : <><Play className="w-8 h-8 text-white/20 mx-auto mb-2" /><p className="text-white/40 text-sm">No preview yet</p></>
                }
              </div>
            )}
          </div>
          {previewSrc && videoLoadFailed && video.thumbnail_url && (
            <p className="text-xs text-yellow-400 mb-4">
              Preview is unavailable right now, but your thumbnail is shown instead.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Topic', video.topic],
              ['Tone', video.tone || '—'],
              ['Duration', `${video.duration_seconds}s`],
              ['AI Service', video.ai_service],
            ].map(([label, val]) => (
              <div key={label} className="glass rounded-xl p-3">
                <div className="text-white/40 text-xs mb-0.5">{label}</div>
                <div className="text-white text-sm font-medium truncate">{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Script & Caption */}
        <div className="space-y-4 lg:col-span-2">
          {/* Script */}
          {video.ai_script && (() => {
            // Clean script - remove JSON if present
            let script = video.ai_script || ''
            try {
              if (script.trim().startsWith('{')) {
                const parsed = JSON.parse(script)
                script = parsed.script || parsed.narration || script
              }
            } catch(e) {}
            return (
            <div className="glass-card p-5">
              <h2 className="font-semibold text-white mb-3">AI Script</h2>
              <p className="text-white/70 text-sm leading-relaxed whitespace-pre-line">
                {script}
              </p>
            </div>
            )
          })()}

          {/* Caption */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-white">Caption</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => { navigator.clipboard.writeText(caption); toast.success('Copied!') }}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition"
                >
                  <Copy className="w-4 h-4" />
                </button>
                {!editingCaption ? (
                  <button onClick={() => setEditingCaption(true)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition">
                    <Edit2 className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={() => saveCaptionMutation.mutate()}
                    disabled={saveCaptionMutation.isPending}
                    className="p-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white transition">
                    <Save className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            {editingCaption ? (
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                className="input resize-none w-full"
                rows={4}
              />
            ) : (
              <p className="text-white/70 text-sm leading-relaxed">{caption || 'No caption generated yet'}</p>
            )}
          </div>

          {/* Hashtags */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <Hash className="w-4 h-4 text-brand-400" /> Hashtags
              </h2>
              {!editingCaption ? (
                <button onClick={() => setEditingCaption(true)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition">
                  <Edit2 className="w-4 h-4" />
                </button>
              ) : null}
            </div>
            {editingCaption ? (
              <input
                value={hashtags}
                onChange={e => setHashtags(e.target.value)}
                className="input w-full"
                placeholder="#hashtag1 #hashtag2"
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {hashtags ? hashtags.split(/\s+/).filter(Boolean).map(h => (
                  <span key={h} className="px-2 py-1 rounded-lg bg-brand-600/20 text-brand-400 text-xs">{h}</span>
                )) : <span className="text-white/30 text-sm">No hashtags yet</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Schedule Modal */}
      {scheduleModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="glass-card p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-brand-400" /> Schedule Post
            </h3>

            {!socialAccounts?.length ? (
              <div className="text-center py-4">
                <AlertCircle className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                <p className="text-white/60 text-sm mb-4">No social accounts connected yet.</p>
                <button onClick={() => { setScheduleModal(false); navigate('/settings') }}
                  className="btn-primary">
                  Go to Settings → Connect Account
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="label">Social Account</label>
                  <select className="input w-full"
                    value={scheduleForm.social_account}
                    onChange={e => setScheduleForm(f => ({ ...f, social_account: e.target.value }))}>
                    <option value="">Select account…</option>
                    {socialAccounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {PLATFORM_SHORT_LABELS[a.platform] || a.platform} @{a.platform_username}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Schedule Date & Time</label>
                  <input type="datetime-local" className="input w-full"
                    value={scheduleForm.scheduled_at}
                    onChange={e => setScheduleForm(f => ({ ...f, scheduled_at: e.target.value }))}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
                <div>
                  <label className="label">Caption (optional override)</label>
                  <textarea className="input resize-none w-full" rows={3}
                    value={scheduleForm.custom_caption}
                    placeholder={caption}
                    onChange={e => setScheduleForm(f => ({ ...f, custom_caption: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Hashtags</label>
                  <textarea
                    className="input resize-none w-full"
                    rows={2}
                    value={hashtags}
                    placeholder="#hashtag1 #hashtag2"
                    onChange={e => setHashtags(e.target.value)}
                  />
                  <p className="text-white/30 text-[11px] mt-1">Separate hashtags with spaces or commas.</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setScheduleModal(false)}
                    className="flex-1 px-4 py-2 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 text-sm transition">
                    Cancel
                  </button>
                  <button
                    onClick={() => scheduleMutation.mutate()}
                    disabled={scheduleMutation.isPending || !scheduleForm.social_account || !scheduleForm.scheduled_at}
                    className="flex-1 btn-primary flex items-center justify-center gap-2"
                  >
                    {scheduleMutation.isPending
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Send className="w-4 h-4" />
                    }
                    Schedule
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function resolvePreviewSrc(src) {
  if (!src || typeof window === 'undefined') return src
  try {
    if (src.startsWith('/')) {
      return `${window.location.origin}${src}`
    }

    const parsed = new URL(src)
    const isLocalWithoutPort =
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      !parsed.port

    if (isLocalWithoutPort) {
      return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`
    }

    return src
  } catch {
    return src
  }
}