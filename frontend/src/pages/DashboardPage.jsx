import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Video, Calendar, TrendingUp, Zap, ArrowRight, Plus, Clock, Trash2 } from 'lucide-react'
import { videosApi, schedulingApi } from '@/api/client'
import { useAuthStore } from '@/store/auth'
import { StatCard, StatusBadge, CardSkeleton } from '@/components/ui'
import { format, formatDistanceToNow } from 'date-fns'
import { flattenLocalScheduledVideos, syncLocalVideoPostStatuses } from '@/utils/localVideoSchedules'
import { getLocalVideosKey } from '@/utils/accountStorage'
import CreateVideoChoiceModal from '@/components/CreateVideoChoiceModal'
import { monthlyVideoQuota } from '@/utils/subscription'
import toast from 'react-hot-toast'

const PLATFORM_LABELS = {
  instagram: 'IG',
  facebook: 'FB',
  linkedin: 'IN',
  youtube: 'YT',
  twitter: 'X',
  social: 'WEB',
}

const STATUS_PRIORITY = {
  publishing: 5,
  scheduled: 4,
  failed: 3,
  published: 2,
  approved: 1,
  draft: 0,
}

function isRemovedPost(post) {
  const textMatch = /removed from the platform|was removed from the platform|deleted from the platform/i.test(post?.error_message || post?.errorMessage || '')
  return textMatch
}

function isStaleFailedVideo(video) {
  if (String(video?.status || '').toLowerCase() !== 'failed') return false
  const referenceTime = new Date(video?.updated_at || video?.updatedAt || video?.created_at || video?.createdAt || 0).getTime()
  if (!referenceTime) return false
  const staleWindowMs = 7 * 24 * 60 * 60 * 1000
  return (Date.now() - referenceTime) > staleWindowMs
}

function isScheduledToday(value) {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const today = new Date()
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
}

function getUpcomingVideoKey(post) {
  const identity = String(post.backendProjectId ?? post.project ?? post.videoId ?? post.id ?? '').trim()
  const scheduledAt = post.scheduled_at ? new Date(post.scheduled_at).toISOString() : ''
  return `${identity || scheduledAt}::${scheduledAt}`
}

function getRecentVideoKey(video) {
  const id = String(video?.id || video?.backendProjectId || video?.videoId || '').trim()
  if (id) return `id::${id}`

  const createdAt = String(video?.created_at || video?.createdAt || '').trim()
  const duration = String(video?.duration_seconds || '').trim()
  const contentType = String(video?.content_type || '').trim().toLowerCase()
  return `fallback::${createdAt}::${duration}::${contentType}`
}

function mergeUpcomingPostGroup(items) {
  const sorted = [...items].sort((a, b) => new Date(a.scheduled_at || 0) - new Date(b.scheduled_at || 0))
  const latest = sorted[sorted.length - 1] || null
  const platforms = [...new Set(
    sorted.flatMap(item => {
      if (Array.isArray(item.scheduledPlatforms) && item.scheduledPlatforms.length) return item.scheduledPlatforms
      if (Array.isArray(item.backendPosts) && item.backendPosts.length) return item.backendPosts.map(post => post.platform).filter(Boolean)
      if (Array.isArray(item.platforms) && item.platforms.length) return item.platforms
      return item.platform ? [item.platform] : []
    }).filter(Boolean)
  )]
  const mergedBackendPosts = sorted.flatMap(item => {
    if (Array.isArray(item.backendPosts) && item.backendPosts.length) return item.backendPosts
    return item.platform ? [item] : []
  })

  return {
    ...latest,
    platforms: platforms.length ? platforms : [latest?.platform || 'social'],
    platform: latest?.platform || platforms[0] || 'social',
    social_account_username: platforms.length ? platforms.join(', ') : (latest?.social_account_username || ''),
    status: resolveAggregateStatus(sorted.map(item => item.status)),
    platformCount: platforms.length || 1,
    backendPosts: mergedBackendPosts,
  }
}

function getUpcomingPlatformLabel(platform, platformSubtype = '') {
  const normalizedPlatform = String(platform || '').toLowerCase()
  const subtype = String(platformSubtype || '').toLowerCase()

  if (normalizedPlatform === 'youtube') {
    if (subtype === 'shorts') return 'YouTube Shorts'
    return 'YouTube Video'
  }
  if (normalizedPlatform === 'instagram') {
    if (subtype === 'reels') return 'Instagram Video'
    if (subtype === 'post') return 'Instagram Post'
    return 'Instagram Video'
  }
  if (normalizedPlatform === 'linkedin') return 'LinkedIn'
  if (normalizedPlatform === 'facebook') return 'Facebook'
  if (normalizedPlatform === 'twitter') return 'Twitter/X'
  return platform || 'Web'
}

function getUpcomingPlatformLabels(post) {
  if (!post) return []

  const fromBackendPosts = Array.isArray(post.backendPosts)
    ? post.backendPosts.map(bp => getUpcomingPlatformLabel(bp.platform, bp.platform_subtype))
    : []
  const fromScheduledPlatforms = Array.isArray(post.scheduledPlatforms)
    ? post.scheduledPlatforms.map(platform => getUpcomingPlatformLabel(platform, post.platformSubtype?.[platform]))
    : []
  const fromPlatforms = Array.isArray(post.platforms)
    ? post.platforms.map(platform => getUpcomingPlatformLabel(platform, post.platformSubtype?.[platform]))
    : []

  return [...new Set([...fromBackendPosts, ...fromScheduledPlatforms, ...fromPlatforms].filter(Boolean))]
}

function getUpcomingPostCount(post) {
  const platforms = new Set()
  ;(Array.isArray(post?.scheduledPlatforms) ? post.scheduledPlatforms : []).forEach(platform => {
    if (platform) platforms.add(platform)
  })
  ;(Array.isArray(post?.platforms) ? post.platforms : []).forEach(platform => {
    if (platform) platforms.add(platform)
  })
  ;(Array.isArray(post?.backendPosts) ? post.backendPosts : []).forEach(post => {
    if (post?.platform) platforms.add(post.platform)
  })
  return platforms.size || (post?.platform ? 1 : 0) || 1
}

function resolveAggregateStatus(statuses) {
  const normalized = (Array.isArray(statuses) ? statuses : []).map(status => String(status || '').toLowerCase())
  if (normalized.some(status => status === 'published')) return 'published'
  if (normalized.some(status => status === 'publishing')) return 'publishing'
  if (normalized.some(status => status === 'scheduled')) return 'scheduled'
  if (normalized.some(status => status === 'failed')) return 'failed'
  if (normalized.some(status => status === 'approved')) return 'approved'
  return 'draft'
}

function buildProjectStatusMap(posts) {
  const grouped = new Map()

  for (const post of Array.isArray(posts) ? posts : []) {
    const key = String(post?.project ?? post?.videoId ?? post?.id ?? '').trim()
    if (!key) continue
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(post)
  }

  return new Map(
    [...grouped.entries()].map(([key, group]) => [key, resolveAggregateStatus(group.map(item => item?.status))])
  )
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [localUpcomingPosts, setLocalUpcomingPosts] = useState([])
  const [localVideos, setLocalVideos] = useState([])
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const accountId = user?.id || 'guest'

  const { data: recentVideos, isLoading: videosLoading } = useQuery({
    queryKey: ['videos', accountId, 'recent'],
    queryFn: () => videosApi.list({ page: 1 }).then(r => Array.isArray(r.data) ? r.data : (r.data?.results || [])),
  })

  const { data: upcomingPosts, isLoading: postsLoading } = useQuery({
    queryKey: ['posts', accountId, 'upcoming'],
    queryFn: () => schedulingApi.list().then(r => Array.isArray(r.data) ? r.data : (r.data?.results || [])),
    refetchInterval: (query) => {
      const posts = query.state.data || []
      return posts.some(post => ['scheduled', 'publishing', 'failed'].includes(post.status)) ? 10000 : 30000
    },
  })

  const { data: publishedPosts } = useQuery({
    queryKey: ['posts', accountId, 'published', 'dashboard'],
    queryFn: () => schedulingApi.list({ status: 'published' }).then(r => Array.isArray(r.data) ? r.data : (r.data?.results || [])),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  const deleteRemoteVideo = useMutation({
    mutationFn: id => videosApi.delete(id),
    onSuccess: (_, deletedId) => {
      qc.setQueriesData({ queryKey: ['videos', accountId] }, (current) => {
        if (!Array.isArray(current)) return current
        return current.filter(video => String(video?.id) !== String(deletedId))
      })
      qc.invalidateQueries({ queryKey: ['videos', accountId] })
      toast.success('Video deleted')
    },
    onError: () => toast.error('Failed to delete video'),
  })

  useEffect(() => {
    function loadLocalVideos() {
      try {
        const all = JSON.parse(localStorage.getItem(getLocalVideosKey(accountId)) || '[]')
        const cleaned = all.filter(video => !isStaleFailedVideo(video))
        if (cleaned.length !== all.length) {
          localStorage.setItem(getLocalVideosKey(accountId), JSON.stringify(cleaned))
        }
        setLocalVideos(cleaned)
      } catch (e) {
        console.error('Failed to load local videos', e)
      }
    }

    loadLocalVideos()
    window.addEventListener('storage', loadLocalVideos)
    window.addEventListener('socialmind:local-videos-changed', loadLocalVideos)
    return () => {
      window.removeEventListener('storage', loadLocalVideos)
      window.removeEventListener('socialmind:local-videos-changed', loadLocalVideos)
    }
  }, [accountId])

  useEffect(() => {
    const combinedPosts = [...(upcomingPosts || []), ...(publishedPosts || [])]
    if (!combinedPosts.length) return

    try {
      const all = JSON.parse(localStorage.getItem(getLocalVideosKey(accountId)) || '[]')
      const synced = syncLocalVideoPostStatuses(all, combinedPosts)
      if (JSON.stringify(synced) !== JSON.stringify(all)) {
        localStorage.setItem(getLocalVideosKey(accountId), JSON.stringify(synced))
        setLocalVideos(synced)
      }
    } catch (e) {
      console.error('Failed to sync local video statuses', e)
    }
  }, [upcomingPosts, publishedPosts, accountId])

  useEffect(() => {
    function loadLocalUpcomingPosts() {
      try {
        const all = JSON.parse(localStorage.getItem(getLocalVideosKey(accountId)) || '[]')
        const now = Date.now()
        const upcoming = flattenLocalScheduledVideos(all)
          .filter(v => ['scheduled', 'publishing'].includes(v.status))
          .filter(v => new Date(v.scheduledAt).getTime() > now)
          .map(v => ({
            id: v.id,
            videoId: v.videoId,
            backendProjectId: v.backendProjectId,
            platform: v.scheduledPlatforms?.[0] || (Array.isArray(v.backendPosts) && v.backendPosts[0]?.platform) || 'social',
            platforms: v.scheduledPlatforms?.length
              ? v.scheduledPlatforms
              : (Array.isArray(v.backendPosts) && v.backendPosts.length
                  ? v.backendPosts.map(post => post.platform).filter(Boolean)
                  : ['social']),
            backendPosts: Array.isArray(v.backendPosts) ? v.backendPosts : [],
            project_title: v.title,
            scheduled_at: v.scheduledAt,
            social_account_username: getUpcomingPlatformLabels(v).join(', '),
            platformCount: getUpcomingPostCount(v),
            status: v.status || 'scheduled',
            platformSubtype: v.platformSubtype || {},
            _isLocal: true,
          }))
          .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
        setLocalUpcomingPosts(upcoming)
      } catch (e) {
        console.error('Failed to load local scheduled posts', e)
      }
    }

    loadLocalUpcomingPosts()
    window.addEventListener('storage', loadLocalUpcomingPosts)
    window.addEventListener('socialmind:local-videos-changed', loadLocalUpcomingPosts)
    const interval = setInterval(loadLocalUpcomingPosts, 5000)
    return () => {
      window.removeEventListener('storage', loadLocalUpcomingPosts)
      window.removeEventListener('socialmind:local-videos-changed', loadLocalUpcomingPosts)
      clearInterval(interval)
    }
  }, [accountId])

  const mergedUpcomingPosts = useMemo(
    () => {
      const deduped = new Map()

      ;[
        ...localUpcomingPosts,
        ...((upcomingPosts || []).filter(post =>
          ['scheduled', 'publishing'].includes(post.status) &&
          new Date(post.scheduled_at).getTime() > Date.now()
        )),
      ].forEach(post => {
        const key = getUpcomingVideoKey(post)
        const existing = deduped.get(key)

        if (!existing) {
          deduped.set(key, [post])
          return
        }

        existing.push(post)
      })

      return [...deduped.values()]
        .map(group => mergeUpcomingPostGroup(group))
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    },
    [localUpcomingPosts, upcomingPosts]
  )

  const activeScheduledCount = mergedUpcomingPosts.filter(post =>
    ['scheduled', 'publishing'].includes(post.status)
  ).length

  const todaysUpcomingPosts = useMemo(
    () => mergedUpcomingPosts.filter(post => isScheduledToday(post.scheduled_at)),
    [mergedUpcomingPosts]
  )
  const allMergedRecentVideos = useMemo(
    () => {
      const deduped = new Map()

      ;[
        ...localVideos.map(v => ({
          ...v,
          _isLocal: true,
          thumbnail_url: v.thumbnail_url || v.thumbnailUrl || '',
          created_at: v.created_at || v.createdAt || new Date().toISOString(),
          content_type: v.content_type || 'promotional',
          status: v.status || 'draft',
        })).filter(video => !isStaleFailedVideo(video)),
        ...(recentVideos || []).filter(video => !video?.is_demo_seed),
      ]
        .map(v => v)
        .forEach(v => {
          const identityKey = getRecentVideoKey(v)
          const existing = deduped.get(identityKey)

          if (!existing) {
            deduped.set(identityKey, v)
            return
          }

          if (existing._isLocal && !v._isLocal) {
            deduped.set(identityKey, v)
            return
          }
          if (!existing._isLocal && v._isLocal) {
            return
          }

          const existingPriority = STATUS_PRIORITY[existing.status] ?? -1
          const nextPriority = STATUS_PRIORITY[v.status] ?? -1
          const existingCreatedAt = new Date(existing.created_at || 0).getTime()
          const nextCreatedAt = new Date(v.created_at || 0).getTime()

          if (nextPriority > existingPriority || (nextPriority === existingPriority && nextCreatedAt > existingCreatedAt)) {
            deduped.set(identityKey, v)
          }
        })

      return [...deduped.values()]
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    },
    [localVideos, recentVideos]
  )

  const mergedRecentVideos = useMemo(
    () => allMergedRecentVideos.slice(0, 5),
    [allMergedRecentVideos]
  )

  const createdVideosCount = Number(user?.videos_generated_this_month || 0)
  const quotaRemaining = Math.max(0, monthlyVideoQuota(user) - createdVideosCount)

  const visiblePublishedPosts = useMemo(
    () => (Array.isArray(publishedPosts) ? publishedPosts : []).filter(post =>
      String(post?.status || '').toLowerCase() === 'published' && !isRemovedPost(post)
    ),
    [publishedPosts]
  )

  const handleDeleteRecentVideo = async (video) => {
    if (!confirm(`Delete "${video.title}"?`)) return

    if (video._isLocal) {
      try {
        const updated = localVideos.filter(item => String(item.id) !== String(video.id))
        localStorage.setItem(getLocalVideosKey(accountId), JSON.stringify(updated))
        setLocalVideos(updated)
        toast.success('Video deleted')
      } catch (error) {
        toast.error('Failed to delete video')
      }
      return
    }

    await deleteRemoteVideo.mutateAsync(video.id)
  }

  const platformBreakdown = useMemo(() => {
    const platforms = ['instagram', 'facebook', 'linkedin', 'youtube']
    return platforms.reduce((acc, platform) => {
      const posts = visiblePublishedPosts.filter(post => String(post?.platform || '').toLowerCase() === platform)
      acc[platform] = {
        count: posts.length,
        likes: posts.reduce((sum, post) => sum + Number(post?.likes_count || 0), 0),
        views: posts.reduce((sum, post) => sum + Number(post?.views_count || 0), 0),
      }
      return acc
    }, {})
  }, [visiblePublishedPosts])

  const stats = [
    { label: 'Videos Created', value: createdVideosCount, icon: Video, color: 'brand' },
    { label: 'Scheduled Posts', value: activeScheduledCount, icon: Calendar, color: 'blue' },
    { label: 'Total Published', value: visiblePublishedPosts.length, icon: TrendingUp, color: 'green' },
    { label: 'Quota Remaining', value: quotaRemaining, icon: Zap, color: 'yellow' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Good {getTimeOfDay()}, {user?.first_name || user?.username}
          </h1>
          <p className="text-white/40 text-sm mt-1">Here's what's happening with your content</p>
        </div>
        <button onClick={() => setCreateModalOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Create Video</span>
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Recent Videos</h2>
            <Link to="/videos" className="text-brand-400 hover:text-brand-300 text-sm flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
          {videosLoading
              ? [1, 2, 3].map(i => <CardSkeleton key={i} />)
              : mergedRecentVideos.map(v => <VideoRow key={v.id} video={v} onDelete={() => handleDeleteRecentVideo(v)} />)}
            {!videosLoading && !mergedRecentVideos.length && (
              <div className="glass-card p-8 text-center">
                <Video className="w-10 h-10 text-brand-400/40 mx-auto mb-3" />
                <p className="text-white/40 text-sm mb-4">No videos yet. Create your first AI video!</p>
                <button onClick={() => setCreateModalOpen(true)} className="btn-primary inline-flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Create Video
                </button>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Today&apos;s Scheduled Posts</h2>
            <Link to="/schedule" className="text-brand-400 hover:text-brand-300 text-sm flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {postsLoading && todaysUpcomingPosts.length === 0
              ? [1, 2, 3].map(i => <div key={i} className="glass-card p-4 h-20 shimmer rounded-2xl" />)
              : todaysUpcomingPosts.slice(0, 6).map(post => <UpcomingPostRow key={`${post._isLocal ? 'local' : 'remote'}-${post.id}`} post={post} />)}
            {!postsLoading && !todaysUpcomingPosts.length && (
              <div className="glass-card p-6 text-center">
                <Calendar className="w-8 h-8 text-brand-400/40 mx-auto mb-3" />
                <p className="text-white/40 text-sm">No posts scheduled today</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <PlatformBreakdown platformBreakdown={platformBreakdown} />
      {createModalOpen && <CreateVideoChoiceModal onClose={() => setCreateModalOpen(false)} />}
    </div>
  )
}

function VideoRow({ video, onDelete }) {
  const target = video._isLocal && video.backendProjectId
    ? `/videos/${video.backendProjectId}`
    : (video._isLocal ? `/videos/local/${video.id}?mode=video` : `/videos/${video.id}`)
  return (
    <Link
      to={target}
      className="glass-card p-4 flex items-center gap-4 hover:border-brand-600/40 transition-colors group"
    >
      <div className="w-16 h-12 rounded-lg bg-surface-50 flex-shrink-0 overflow-hidden">
        {video.thumbnail_url
          ? <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" />
          : (
            <div className="w-full h-full flex items-center justify-center">
              <Video className="w-5 h-5 text-white/20" />
            </div>
          )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-white text-sm truncate group-hover:text-brand-400 transition-colors">
              {video.title}
            </p>
            <p className="text-white/40 text-xs mt-0.5">{video.content_type} - {video.duration_seconds}s</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <StatusBadge status={video.status} />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onDelete?.()
          }}
          className="flex items-center justify-center w-7 h-7 rounded-lg bg-black/60 border border-white/10 text-red-300 hover:text-red-200 hover:bg-red-500/20 transition"
          title="Delete video"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </Link>
  )
}

function UpcomingPostRow({ post }) {
  const platformLabels = getUpcomingPlatformLabels(post)
  const platformCount = post.platformCount || platformLabels.length || 1

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-white truncate flex-1">{post.project_title}</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-300 border border-brand-500/25">
          {platformCount} post{platformCount !== 1 ? 's' : ''}
        </span>
        <StatusBadge status={post.status || 'scheduled'} />
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        {platformLabels.map(platform => (
          <span
            key={`${post.id}-${platform}`}
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/10 text-white/70"
            title={platform}
          >
            {platform}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1 text-xs text-white/40">
        <Clock className="w-3 h-3" />
        <span>{formatDistanceToNow(new Date(post.scheduled_at), { addSuffix: true })}</span>
      </div>
      <div className="text-xs text-white/30 mt-1">
        {format(new Date(post.scheduled_at), 'MMM d, h:mm a')}
      </div>
      {post.status === 'publishing' && (
        <div className="text-xs text-brand-400 mt-1">
          Posting is in progress. This card refreshes automatically.
        </div>
      )}
    </div>
  )
}

function PlatformBreakdown({ platformBreakdown }) {
  const platforms = [
    { key: 'instagram', label: 'Instagram', icon: 'IG' },
    { key: 'facebook', label: 'Facebook', icon: 'FB' },
    { key: 'linkedin', label: 'LinkedIn', icon: 'IN' },
    { key: 'youtube', label: 'YouTube', icon: 'YT' },
  ]

  return (
    <div className="glass-card p-5">
      <h2 className="font-semibold text-white mb-4">Platform Performance</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {platforms.map(({ key, label, icon }) => {
          const data = platformBreakdown?.[key] || {}
          return (
            <div key={key} className="text-center">
              <div className="text-2xl mb-1">{icon}</div>
              <div className="text-sm font-medium text-white">{label}</div>
              <div className="text-xl font-bold text-white mt-2">{data.count ?? 0}</div>
              <div className="text-xs text-white/40">posts</div>
              <div className="text-sm text-white/60 mt-1">likes {data.likes ?? 0}</div>
              <div className="text-sm text-white/60">views {data.views ?? 0}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function getTimeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
