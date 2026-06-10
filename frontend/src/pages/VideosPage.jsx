import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, Filter, Video, Trash2, Eye, Play, RefreshCw, Calendar, CheckCircle, XCircle, Sparkles, Film, MonitorPlay } from 'lucide-react'
import { videosApi } from '@/api/client'
import { StatusBadge, EmptyState, CardSkeleton } from '@/components/ui'
import { useAuthStore } from '@/store/auth'
import { getLocalVideosKey } from '@/utils/accountStorage'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { getScheduleEntries } from '@/utils/localVideoSchedules'
import CreateVideoChoiceModal from '@/components/CreateVideoChoiceModal'

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'created', label: 'Created' },
  { value: 'generating', label: 'Generating' },
  { value: 'approved', label: 'Approved' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' },
]

function isStaleFailedVideo(video) {
  if (String(video?.status || '').toLowerCase() !== 'failed') return false
  const referenceTime = new Date(video?.updated_at || video?.updatedAt || video?.created_at || video?.createdAt || 0).getTime()
  if (!referenceTime) return false
  const staleWindowMs = 7 * 24 * 60 * 60 * 1000
  return (Date.now() - referenceTime) > staleWindowMs
}

function normalizeVideoStatus(status) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'draft') return 'created'
  if (normalized === 'canceled') return 'cancelled'
  return normalized
}

export default function VideosPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const accountId = user?.id || 'guest'

  const { data, isLoading } = useQuery({
    queryKey: ['videos', accountId, statusFilter],
    queryFn: () => videosApi.list({ status: statusFilter || undefined }).then(r => Array.isArray(r.data) ? r.data : (r.data?.results || [])),
    refetchInterval: 5000, // Poll for generating status
  })

  const deleteMutation = useMutation({
    mutationFn: id => videosApi.delete(id),
    onSuccess: (_, deletedId) => {
      qc.setQueriesData({ queryKey: ['videos', accountId] }, (current) => {
        if (!Array.isArray(current)) return current
        return current.filter(video => String(video?.id) !== String(deletedId))
      })
      qc.invalidateQueries({ queryKey: ['videos', accountId] })
      toast.success('Video deleted')
    },
    onError: () => toast.error('Failed to delete'),
  })

  // Merge API videos with locally generated AI videos
  const [localVideos, setLocalVideos] = useState([])
  useEffect(() => {
    try {
      const raw = localStorage.getItem(getLocalVideosKey(accountId))
      const parsed = raw ? JSON.parse(raw) : []
      const cleaned = parsed.filter(video => !isStaleFailedVideo(video))
      if (cleaned.length !== parsed.length) {
        localStorage.setItem(getLocalVideosKey(accountId), JSON.stringify(cleaned))
      }
      setLocalVideos(cleaned)
    } catch(e) {}
    const handler = () => {
      try {
        const raw = localStorage.getItem(getLocalVideosKey(accountId))
        const parsed = raw ? JSON.parse(raw) : []
        const cleaned = parsed.filter(video => !isStaleFailedVideo(video))
        if (cleaned.length !== parsed.length) {
          localStorage.setItem(getLocalVideosKey(accountId), JSON.stringify(cleaned))
        }
        setLocalVideos(cleaned)
      } catch(e){}
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [accountId])

  function deleteLocalVideo(id) {
    const updated = localVideos.filter(v => String(v.id) !== String(id))
    localStorage.setItem(getLocalVideosKey(accountId), JSON.stringify(updated))
    setLocalVideos(updated)
    toast.success('Video deleted')
  }

  const allVideos = [
    ...localVideos.map(v => ({ ...v, _isLocal: true })),
    ...(data || []),
  ]
  const videos = allVideos.filter(v =>
    !search || v.title?.toLowerCase().includes(search.toLowerCase()) ||
    v.topic?.toLowerCase().includes(search.toLowerCase())
  ).filter(v => !statusFilter || normalizeVideoStatus(v.status) === statusFilter)

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      {createModalOpen && <CreateVideoChoiceModal onClose={() => setCreateModalOpen(false)} />}
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Videos</h1>
          <p className="text-white/40 text-sm mt-1">{(data?.length ?? 0) + localVideos.length} total projects</p>
        </div>
        <button onClick={() => setCreateModalOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Create Video
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            className="input pl-10"
            placeholder="Search videos…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-all border
                ${statusFilter === f.value
                  ? 'bg-brand-600/20 text-brand-400 border-brand-600/40'
                  : 'bg-white/5 text-white/50 border-white/10 hover:text-white hover:bg-white/10'
                }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <CardSkeleton key={i} />)}
        </div>
      ) : videos.length === 0 ? (
        <EmptyState
          icon={Video}
          title="No videos found"
          description="Create your first AI-powered social media video"
          action={<button onClick={() => setCreateModalOpen(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />Create Video</button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map(video => (
            <VideoCard
              key={video.id}
              video={video}
              onDelete={() => {
                if (!confirm('Delete this video?')) return
                if (video._isLocal) deleteLocalVideo(video.id)
                else deleteMutation.mutate(video.id)
              }}
              onClick={() => {
                if (video._isLocal) navigate(`/videos/local/${video.id}`)
                else navigate(`/videos/${video.id}`)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const LOCAL_STATUS_STYLES = {
  created:  'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  approved: 'bg-green-500/15 text-green-400 border border-green-500/30',
  published: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  rejected: 'bg-red-500/15 text-red-400 border border-red-500/30',
  scheduled:'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  cancelled:'bg-slate-500/15 text-slate-300 border border-slate-500/30',
  review:   'bg-red-500/15 text-red-400 border border-red-500/30',
}

const PLATFORM_ICONS = {
  instagram: '📸',
  facebook: '👥',
  linkedin: '💼',
  youtube: '▶️',
  twitter: '🐦',
}

function VideoCard({ video, onDelete, onClick }) {
  const navigate = useNavigate()
  const isLocal = video._isLocal
  const statusStyle = isLocal ? (LOCAL_STATUS_STYLES[normalizeVideoStatus(video.status)] || LOCAL_STATUS_STYLES.review) : null
  const deliveryItems = isLocal ? getDeliveryItems(video) : []

  function goVideo(e) {
    e.stopPropagation()
    if (isLocal) navigate(`/videos/local/${video.id}?mode=video`)
    else navigate(`/videos/${video.id}`)
  }

  function goPreview(e) {
    e.stopPropagation()
    if (isLocal) navigate(`/videos/local/${video.id}?mode=preview`)
    else navigate(`/videos/${video.id}`)
  }

  return (
    <div className="glass-card overflow-hidden group hover:border-brand-600/40 transition-all duration-200">
      {/* Thumbnail — click goes to detail */}
      <div className="relative h-40 bg-surface-50 cursor-pointer" onClick={onClick}>
        {isLocal && video.scenes?.[0]?.videoUrl ? (
          <video src={video.scenes[0].videoUrl} muted className="w-full h-full object-cover"/>
        ) : video.thumbnail_url ? (
          <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-brand-600/20 flex items-center justify-center">
              {video.status === 'generating'
                ? <RefreshCw className="w-6 h-6 text-brand-400 animate-spin-slow" />
                : isLocal
                  ? <Sparkles className="w-6 h-6 text-brand-400"/>
                  : <Play className="w-6 h-6 text-brand-400" />
              }
            </div>
          </div>
        )}
        {isLocal && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-purple-600/80 text-white text-xs font-bold backdrop-blur-sm">
            ✨ AI
          </div>
        )}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
             onClick={e => e.stopPropagation()}>
          <button onClick={onDelete}
            className="w-7 h-7 rounded-lg bg-red-500/80 backdrop-blur flex items-center justify-center hover:bg-red-500 transition">
            <Trash2 className="w-3 h-3 text-white" />
          </button>
        </div>
        {video.duration_seconds && (
          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-xs text-white">
            {video.duration_seconds}s
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-medium text-white text-sm truncate cursor-pointer hover:text-brand-400 transition-colors" onClick={onClick}>
            {video.title}
          </h3>
          {isLocal ? (
            <span className={`text-xs px-2 py-0.5 rounded-lg font-semibold flex-shrink-0 ${statusStyle}`}>
              {formatLocalStatusLabel(video.status)}
            </span>
          ) : (
            <StatusBadge status={video.status} />
          )}
        </div>
        <p className="text-white/40 text-xs mb-3 line-clamp-1">{video.topic || video.description}</p>
        <div className="flex items-center justify-between text-xs text-white/30 mb-3">
          <span className="capitalize">{isLocal ? 'AI Generated' : video.content_type}</span>
          <span>{video.created_at ? formatDistanceToNow(new Date(video.created_at), { addSuffix: true }) : ''}</span>
        </div>
        {deliveryItems.length > 0 && (
          <div className="mb-3 space-y-1.5">
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Social Delivery</div>
            <div className="flex flex-wrap gap-1.5">
              {deliveryItems.map(item => (
                <span
                  key={item.key}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border ${
                    item.status === 'published'
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                      : item.status === 'publishing'
                        ? 'border-blue-500/20 bg-blue-500/10 text-blue-300'
                        : item.status === 'scheduled'
                          ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                          : 'border-red-500/20 bg-red-500/10 text-red-300'
                  }`}
                  title={item.errorMessage || `${item.account} ${item.status}`}
                >
                  <span className="font-semibold uppercase">{item.platformIcon}</span>
                  <span className="truncate max-w-[110px]">{item.account}</span>
                  <span className="opacity-80">{item.status}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        {isLocal && video.scheduledPlatforms?.length > 0 && (
          <div className="flex items-center gap-1.5 mb-3 text-xs text-blue-300">
            <Calendar className="w-3.5 h-3.5" />
            <div className="flex items-center gap-1">
              {video.scheduledPlatforms.map(platform => (
                <span key={platform} title={platform} className="text-sm">
                  {PLATFORM_ICONS[platform] || '🌐'}
                </span>
              ))}
            </div>
            <span className="text-white/40 truncate">Scheduled</span>
          </div>
        )}

        {/* ── Video / Preview buttons (local AI videos only) ── */}
        {isLocal ? (
          <div className="flex gap-2">
            <button onClick={goVideo}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-brand-600/20 border border-brand-600/40 text-brand-400 hover:bg-brand-600/30 text-xs font-semibold transition-all">
              <Film className="w-3.5 h-3.5"/> Video
            </button>
            <button onClick={goPreview}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 text-xs font-semibold transition-all">
              <MonitorPlay className="w-3.5 h-3.5"/> Preview
            </button>
          </div>
        ) : (
          video.status==='approved' && (
            <div className="flex items-center gap-1 text-xs text-brand-400 font-medium">
              <Calendar className="w-3 h-3"/> Click to schedule
            </div>
          )
        )}
      </div>
    </div>
  )
}

function getDeliveryItems(video) {
  const entries = getScheduleEntries(video)
  const latest = entries[0]
  const backendPosts = Array.isArray(latest?.backendPosts) && latest.backendPosts.length
    ? latest.backendPosts
    : (Array.isArray(video?.backendPosts) ? video.backendPosts : [])

  if (!backendPosts.length) return []

  const items = []

  for (const post of backendPosts) {
    const platform = normalizePlatform(post.platform)
    const status = String(post.status || 'scheduled').toLowerCase()
    items.push({
      key: post.id || `${video.id}-${platform}-${post.platformUrl || post.publishedAt || Math.random().toString(36).slice(2, 8)}`,
      platformIcon: PLATFORM_ICONS[platform] || 'WEB',
      account: post.social_account_username ? `@${post.social_account_username}` : (post.platform_name || platformLabel(platform)),
      status,
      errorMessage: post.errorMessage || '',
    })
  }

  return items
}

function normalizePlatform(platform) {
  const normalized = String(platform || '').toLowerCase().trim()
  if (normalized === 'ig') return 'instagram'
  if (normalized === 'fb') return 'facebook'
  if (normalized === 'in' || normalized === 'ln') return 'linkedin'
  return normalized || 'social'
}

function platformLabel(platform) {
  if (platform === 'instagram') return 'Instagram'
  if (platform === 'facebook') return 'Facebook'
  if (platform === 'linkedin') return 'LinkedIn'
  if (platform === 'youtube') return 'YouTube'
  if (platform === 'twitter') return 'X'
  return 'Social'
}

function formatLocalStatusLabel(status) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'created' || normalized === 'draft') return 'Created'
  if (normalized === 'review') return 'Rejected'
  if (normalized === 'approved') return 'Approved'
  if (normalized === 'scheduled') return 'Scheduled'
  if (normalized === 'published') return 'Published'
  if (normalized === 'failed') return 'Failed'
  if (normalized === 'cancelled' || normalized === 'canceled') return 'Cancelled'
  if (normalized === 'generating') return 'Generating'
  if (normalized === 'draft') return 'Draft'
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Rejected'
}
