import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, Clock, Trash2, MonitorPlay, Send, RefreshCw, QrCode, X, Copy } from 'lucide-react'
import { eachDayOfInterval, endOfMonth, format, isSameDay, isToday, startOfMonth, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { schedulingApi } from '@/api/client'
import { useAuthStore } from '@/store/auth'
import { cancelScheduleEntry, flattenLocalScheduledVideos, removeScheduleEntry, syncLocalVideoPostStatuses } from '@/utils/localVideoSchedules'
import { getLocalVideosKey } from '@/utils/accountStorage'
import QRCodeImage from '@/components/QRCodeImage'
import SubscriptionGate from '@/components/SubscriptionGate'

function QRModal({ projectId, title, onClose }) {
  const watchUrl = `${window.location.origin}/watch/${projectId}`
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-surface-card border border-surface-border rounded-2xl p-6 max-w-xs w-full text-center space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm truncate flex-1 text-left">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="bg-white rounded-xl p-4 mx-auto w-fit">
          <QRCodeImage url={watchUrl} size={160} />
        </div>
        <p className="text-white/50 text-xs">Scan to watch this video on any device</p>
        <div className="flex items-center gap-2 bg-white/5 border border-surface-border rounded-xl px-3 py-2">
          <span className="text-white/40 text-xs truncate flex-1 text-left">{watchUrl}</span>
          <button
            onClick={() => { navigator.clipboard.writeText(watchUrl); toast.success('Link copied!') }}
            className="text-brand-400 hover:text-brand-300 transition flex-shrink-0"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
        <button onClick={onClose} className="btn-primary w-full py-2 text-sm">Done</button>
      </div>
    </div>
  )
}

const PLATFORM_ICONS = {
  instagram: 'IG',
  facebook: 'FB',
  linkedin: 'IN',
  youtube: 'YT',
  twitter: 'X',
}

const PLATFORM_COLORS = {
  youtube: 'bg-red-500/15 border border-red-500/30 text-red-300',
  instagram: 'bg-pink-500/15 border border-pink-500/30 text-pink-300',
  facebook: 'bg-blue-500/15 border border-blue-500/30 text-blue-300',
  linkedin: 'bg-sky-500/15 border border-sky-500/30 text-sky-300',
  twitter: 'bg-slate-500/15 border border-slate-500/30 text-slate-300',
}

function getPlatformLabel(platform, platformSubtype) {
  if (platform === 'youtube') {
    const sub = platformSubtype?.youtube || 'video'
    return sub === 'shorts' ? '▶️ YouTube Shorts' : '🎬 YouTube Video'
  }
  if (platform === 'instagram') {
    const sub = platformSubtype?.instagram || 'reels'
    return sub === 'reels' ? '📸 Instagram Video' : '🖼 Instagram Post'
  }
  const icons = { facebook:'👥', linkedin:'💼', twitter:'🐦' }
  const labels = { facebook:'Facebook', linkedin:'LinkedIn', twitter:'Twitter/X' }
  return `${icons[platform]||''} ${labels[platform]||platform}`
}

function getStatusLabel(status) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'published') return 'Posted'
  if (normalized === 'publishing') return 'Posting'
  if (normalized === 'scheduled') return 'Scheduled'
  if (normalized === 'failed') return 'Failed'
  if (normalized === 'cancelled') return 'Cancelled'
  return status || 'Scheduled'
}

function getDateLabel(attempt) {
  const sourceDate = attempt.status === 'published' && attempt.publishedAt
    ? attempt.publishedAt
    : attempt.scheduledAt
  if (!sourceDate) return ''
  const prefix = attempt.status === 'published' ? 'Posted on' : 'Scheduled for'
  return `${prefix} ${format(parseISO(sourceDate), 'MMM d, yyyy Â· h:mm a')}`
}

function extractPublishErrorMessage(err) {
  const data = err?.response?.data
  if (typeof data === 'string') return data
  if (!data || typeof data !== 'object') return err?.message || 'Failed to start publishing'

  const warnings = Array.isArray(data.warnings) && data.warnings.length
    ? `: ${data.warnings.join(', ')}`
    : ''

  return (
    data.error ||
    data.detail ||
    data.message ||
    data.results?.find?.(item => item?.error)?.error ||
    `Failed to start publishing${warnings}`
  )
}

export default function SchedulePage() {
  const [view, setView] = useState('calendar')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [localVideos, setLocalVideos] = useState([])
  const [filter, setFilter] = useState('default')
  const [qrTarget, setQrTarget] = useState(null)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const accountId = user?.id || 'guest'

  const { data: backendPosts } = useQuery({
    queryKey: ['posts', accountId, 'sync-local-schedule'],
    queryFn: () => schedulingApi.list().then(r => Array.isArray(r.data) ? r.data : (r.data?.results || [])),
    refetchInterval: 10000,
  })

  useEffect(() => {
    loadVideos()
    const interval = setInterval(loadVideos, 5000)
    return () => clearInterval(interval)
  }, [accountId])

  useEffect(() => {
    if (!backendPosts?.length) return

    try {
      const all = JSON.parse(localStorage.getItem(getLocalVideosKey(accountId)) || '[]')
      const synced = syncLocalVideoPostStatuses(all, backendPosts)
      if (JSON.stringify(synced) !== JSON.stringify(all)) {
        localStorage.setItem(getLocalVideosKey(accountId), JSON.stringify(synced))
      }
      setLocalVideos(flattenLocalScheduledVideos(synced))
    } catch (e) {
      console.error('Failed to sync local scheduled posts', e)
    }
  }, [backendPosts, accountId])

  function loadVideos() {
    try {
      const all = JSON.parse(localStorage.getItem(getLocalVideosKey(accountId)) || '[]')
      setLocalVideos(flattenLocalScheduledVideos(all))
    } catch (e) {
      console.error('Error loading videos:', e)
    }
  }

  function removeScheduledPost(videoId, scheduleId, successMessage) {
    try {
      const all = JSON.parse(localStorage.getItem(getLocalVideosKey(accountId)) || '[]')
      const updated = all.map(video =>
        video.id === videoId ? removeScheduleEntry(video, scheduleId) : video
      )
      localStorage.setItem(getLocalVideosKey(accountId), JSON.stringify(updated))
      window.dispatchEvent(new Event('socialmind:local-videos-changed'))
      loadVideos()
      toast.success(successMessage)
    } catch (e) {
      toast.error('Failed to update schedule')
    }
  }

  const deletePublishedPostMutation = useMutation({
    mutationFn: async ({ backendPostIds }) => {
      await Promise.all(backendPostIds.map(id => schedulingApi.delete(id)))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posts', accountId] })
      qc.invalidateQueries({ queryKey: ['analytics', accountId] })
      qc.invalidateQueries({ queryKey: ['layout', accountId, 'notifications'] })
    },
  })

  const publishNowMutation = useMutation({
    mutationFn: async (backendPostIds) => {
      const ids = Array.isArray(backendPostIds) ? backendPostIds : [backendPostIds]
      const results = await Promise.allSettled(ids.map(id => schedulingApi.publishNow(id)))
      const failed = results.find(result => result.status === 'rejected')
      if (failed) throw failed.reason
    },
    onSuccess: () => {
      toast.success('Publishing started!')
      qc.invalidateQueries({ queryKey: ['posts', accountId] })
      loadVideos()
    },
    onError: (err) => {
      toast.error(extractPublishErrorMessage(err), { duration: 7000 })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['posts', accountId] })
      qc.invalidateQueries({ queryKey: ['layout', accountId, 'notifications'] })
      setTimeout(loadVideos, 500)
    },
  })

  const cancelScheduleMutation = useMutation({
    mutationFn: async ({ backendPostIds }) => {
      if (Array.isArray(backendPostIds) && backendPostIds.length > 0) {
        await Promise.all(backendPostIds.map(id => schedulingApi.delete(id)))
      }
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['posts', accountId] })
      qc.invalidateQueries({ queryKey: ['analytics', accountId] })
      qc.invalidateQueries({ queryKey: ['layout', accountId, 'notifications'] })
      if (variables?.videoId && variables?.scheduleId) {
        markScheduleCancelled(variables.videoId, variables.scheduleId, 'Schedule cancelled')
      }
    },
    onError: () => {
      toast.error('Failed to cancel schedule')
    },
  })

  function handleDelete(attempt) {
    if (!confirm('Remove this post entry?')) return

    const backendPostIds = Array.isArray(attempt.backendPosts)
      ? attempt.backendPosts.map(post => post.id).filter(Boolean)
      : []

    if (backendPostIds.length) {
      deletePublishedPostMutation.mutate(
        { backendPostIds },
        {
          onSuccess: () => {
            removeScheduledPost(attempt.videoId, attempt.scheduleId, 'Post deleted successfully')
          },
          onError: () => {
            toast.error('Failed to delete published post')
          },
        }
      )
      return
    }

    removeScheduledPost(attempt.videoId, attempt.scheduleId, 'Scheduled entry removed')
  }

  function handleCancelSchedule(videoId, scheduleId) {
    const target = localVideos.find(item => String(item.videoId) === String(videoId) && String(item.scheduleId) === String(scheduleId))
    const backendPostIds = Array.isArray(target?.backendPosts)
      ? target.backendPosts.map(post => post.id).filter(Boolean)
      : []

    if (backendPostIds.length) {
      cancelScheduleMutation.mutate({ backendPostIds, videoId, scheduleId })
      return
    }

    markScheduleCancelled(videoId, scheduleId, 'Schedule cancelled')
    qc.invalidateQueries({ queryKey: ['posts', accountId] })
    qc.invalidateQueries({ queryKey: ['analytics', accountId] })
    qc.invalidateQueries({ queryKey: ['layout', accountId, 'notifications'] })
  }

  function markScheduleCancelled(videoId, scheduleId, successMessage) {
    try {
      const all = JSON.parse(localStorage.getItem(getLocalVideosKey(accountId)) || '[]')
      const updated = all.map(video =>
        String(video.id) === String(videoId)
          ? cancelScheduleEntry(video, scheduleId)
          : video
      )
      localStorage.setItem(getLocalVideosKey(accountId), JSON.stringify(updated))
      window.dispatchEvent(new Event('socialmind:local-videos-changed'))
      loadVideos()
      toast.success(successMessage)
    } catch (e) {
      toast.error('Failed to update schedule')
    }
  }

  const scheduledVideos = localVideos.filter(v => ['scheduled', 'publishing'].includes(v.status))
  const failedVideos = localVideos.filter(v => v.status === 'failed')
  const todayVideos = localVideos.filter(v => {
    if (!v.scheduledAt) return false
    return new Date(v.scheduledAt).toDateString() === new Date().toDateString()
  })

  const filteredVideos = localVideos.filter(v => {
    if (filter === 'default') return ['scheduled', 'publishing'].includes(v.status)
    if (filter === 'all') return true
    if (filter === 'failed') return v.status === 'failed'
    if (filter === 'today') {
      if (!v.scheduledAt) return false
      return new Date(v.scheduledAt).toDateString() === new Date().toDateString()
    }
    return true
  })

  const groupedVideos = useMemo(() => {
    const grouped = new Map()

    for (const attempt of filteredVideos) {
      const key = String(attempt.videoId || attempt.title || attempt.id)
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key).push(attempt)
    }

    return [...grouped.entries()]
      .map(([key, attempts]) => {
        const sortedAttempts = [...attempts].sort((a, b) => new Date(b.scheduledAt || 0) - new Date(a.scheduledAt || 0))
        return {
          key,
          latest: sortedAttempts[0],
          attempts: sortedAttempts,
        }
      })
      .sort((a, b) => new Date(b.latest?.scheduledAt || 0) - new Date(a.latest?.scheduledAt || 0))
  }, [filteredVideos])

  return (
    <SubscriptionGate feature="schedule">
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Schedule</h1>
          <p className="text-white/40 text-sm mt-1">
            Manage your upcoming posts · {scheduledVideos.length} scheduled
          </p>
        </div>
        <div className="flex gap-2">
          {['calendar', 'list'].map(mode => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                view === mode
                  ? 'bg-brand-600/20 text-brand-400 border-brand-600/40'
                  : 'text-white/50 border-white/10 hover:text-white hover:bg-white/5'
              }`}
            >
              {mode === 'calendar' ? 'Calendar' : 'List'}
            </button>
          ))}
        </div>
      </div>

      {view === 'calendar' ? (
        <ScheduleCalendar
          posts={scheduledVideos}
          currentMonth={currentMonth}
          setCurrentMonth={setCurrentMonth}
        />
      ) : (
        <>
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            {[
              { id: 'all', label: 'All', count: localVideos.length },
              { id: 'today', label: 'Today', count: todayVideos.length },
              { id: 'failed', label: 'Failed', count: failedVideos.length },
            ].map(({ id, label, count }) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`px-3 py-1.5 rounded-lg text-sm transition flex items-center gap-1.5 whitespace-nowrap border ${
                  filter === id
                    ? 'bg-brand-600/20 text-brand-400 border-brand-600/40'
                    : 'text-white/50 border-white/10 hover:text-white hover:bg-white/5'
                }`}
              >
                {label}
                <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-xs">{count}</span>
              </button>
            ))}
          </div>

          {groupedVideos.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <Calendar className="w-12 h-12 text-white/20 mx-auto mb-3" />
              <h3 className="text-white font-semibold mb-1">
                {filter === 'failed' ? 'No failed posts' : filter === 'today' ? 'No posts scheduled today' : 'No posts scheduled'}
              </h3>
              <p className="text-white/40 text-sm mb-4">
                {filter === 'failed'
                  ? 'Failed posts will appear here when a publish attempt does not succeed.'
                  : 'Approve a video and schedule it to get started'}
              </p>
              <button
                onClick={() => navigate('/videos')}
                className="btn-primary inline-flex items-center gap-2"
              >
                Go to Videos
              </button>
            </div>
          ) : (
            <div className="space-y-3">
          {groupedVideos.map(group => (
            <div key={group.key} className="glass-card p-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-32 h-18 rounded-lg overflow-hidden bg-slate-800">
                  {group.latest?.scenes?.[0]?.videoUrl ? (
                    <video src={group.latest.scenes[0].videoUrl} className="w-full h-full object-cover" muted />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">VID</div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <h3 className="font-medium text-white text-sm truncate">{group.latest?.title}</h3>
                      <p className="text-[11px] text-white/35 mt-1">
                        Attempt History · {group.attempts.length} entr{group.attempts.length === 1 ? 'y' : 'ies'}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {group.latest?.backendProjectId && (
                        <button
                          onClick={() => setQrTarget({ projectId: group.latest.backendProjectId, title: group.latest.title })}
                          className="p-2 rounded-lg border border-brand-600/30 text-brand-400 hover:bg-brand-600/10 transition"
                          title="Share QR Code"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => navigate(`/videos/local/${group.latest?.videoId}`)}
                        className="p-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition"
                        title="View"
                      >
                        <MonitorPlay className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {group.attempts.map(attempt => (
                      <div key={attempt.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                                attempt.status === 'published'
                                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                  : attempt.status === 'cancelled'
                                    ? 'bg-slate-500/15 border-slate-500/30 text-slate-300'
                                  : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                              }`}>
                                {getStatusLabel(attempt.status)}
                              </span>
                              <span className="text-xs text-white/35">
                                {attempt.scenes?.length || 0} scenes · {attempt.duration_seconds}s
                              </span>
                              {/* Format badge — tells user if video is portrait/landscape */}
                              {attempt.videoFormat && (() => {
                                const fmt = attempt.videoFormat
                                const isPortrait = fmt === '9/16'
                                const isSquare = fmt === '1/1'
                                const label = isPortrait ? '📱 9:16 Portrait' : isSquare ? '⬜ 1:1 Square' : '🖥 16:9 Landscape'
                                const shortsOk = isPortrait
                                const needsShorts = attempt.scheduledPlatforms?.includes('youtube') && attempt.platformSubtype?.youtube === 'shorts'
                                return (
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                    isPortrait ? 'bg-green-500/15 border-green-500/30 text-green-400'
                                    : isSquare  ? 'bg-purple-500/15 border-purple-500/30 text-purple-400'
                                    : 'bg-slate-500/15 border-slate-500/30 text-slate-300'
                                  }`}>
                                    {label}
                                    {needsShorts && !shortsOk && ' ⚠️ needs portrait for Shorts'}
                                  </span>
                                )
                              })()}
                            </div>

                            <div className="flex items-center gap-3 text-xs text-white/40 mb-2 flex-wrap">
                              {getDateLabel(attempt) && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {getDateLabel(attempt)}
                                </span>
                              )}
                            </div>

                    {attempt.scheduledPlatforms && attempt.scheduledPlatforms.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {attempt.scheduledPlatforms.map(platform => (
                          <span
                            key={`${attempt.id}-${platform}`}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${PLATFORM_COLORS[platform] || 'bg-white/5 text-white/60'}`}
                          >
                            {getPlatformLabel(platform, attempt.platformSubtype)}
                          </span>
                        ))}
                      </div>
                    )}


                            {attempt.status === 'published' && (
                              <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/50">
                                <span>Likes {attempt.likes_count ?? 0}</span>
                                <span>Comments {attempt.comments_count ?? 0}</span>
                                <span>Shares {attempt.shares_count ?? 0}</span>
                                <span>Views {attempt.views_count ?? 0}</span>
                              </div>
                            )}

                            {attempt.status === 'failed' && attempt.errorMessage && (
                              <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-2 text-xs text-red-200 whitespace-pre-wrap break-words">
                                {attempt.errorMessage}
                              </div>
                            )}
                          </div>

                          <div className="flex gap-2 flex-shrink-0">
                            {/* Publish Now — available for scheduled/failed items that have backend post IDs */}
                            {(['scheduled', 'failed'].includes(attempt.status)) &&
                              Array.isArray(attempt.backendPosts) &&
                              attempt.backendPosts.length > 0 && (() => {
                                const postIds = attempt.backendPosts.map(post => post.id).filter(Boolean)
                                if (!postIds.length) return null
                                return (
                                  <button
                                    onClick={() => publishNowMutation.mutate(postIds)}
                                    disabled={publishNowMutation.isPending}
                                    className="p-2 rounded-lg border border-green-500/30 text-green-400 hover:bg-green-500/10 transition disabled:opacity-50"
                                    title={attempt.status === 'failed' ? `Retry publish (${postIds.length} account${postIds.length > 1 ? 's' : ''})` : `Publish now (${postIds.length} account${postIds.length > 1 ? 's' : ''})`}
                                  >
                                    {attempt.status === 'failed'
                                      ? <RefreshCw className="w-4 h-4" />
                                      : <Send className="w-4 h-4" />
                                    }
                                  </button>
                                )
                              })()
                            }
                            {/* Cancel — only for scheduled items */}
                            {attempt.status === 'scheduled' && (
                              <button
                                onClick={() => handleCancelSchedule(attempt.videoId, attempt.scheduleId)}
                                className="p-2 rounded-lg border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 transition"
                                title="Cancel Schedule"
                              >
                                <Clock className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(attempt)}
                              className="p-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
            </div>
          )}
        </>
      )}

      {qrTarget && (
        <QRModal
          projectId={qrTarget.projectId}
          title={qrTarget.title}
          onClose={() => setQrTarget(null)}
        />
      )}
    </div>
    </SubscriptionGate>
  )
}

function ScheduleCalendar({ posts, currentMonth, setCurrentMonth }) {
  const monthStart = startOfMonth(currentMonth)
  const days = eachDayOfInterval({
    start: monthStart,
    end: endOfMonth(currentMonth),
  })
  const startPad = monthStart.getDay()

  const getPostsForDay = (day) => posts.filter(post => {
    if (!post.scheduledAt) return false
    return isSameDay(new Date(post.scheduledAt), day)
  })

  return (
    <div className="glass-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-5">
        <button
          onClick={() => setCurrentMonth(month => new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          className="btn-ghost px-3 py-1.5 text-sm"
        >
          Prev
        </button>
        <div className="text-center">
          <h3 className="font-semibold text-white">{format(currentMonth, 'MMMM yyyy')}</h3>
          <p className="text-xs text-white/35 mt-0.5">
            {posts.length} scheduled post{posts.length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          onClick={() => setCurrentMonth(month => new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          className="btn-ghost px-3 py-1.5 text-sm"
        >
          Next
        </button>
      </div>

      <div className="grid grid-cols-7 mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(dayName => (
          <div key={dayName} className="text-center text-xs text-white/35 py-2 font-medium">
            {dayName}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: startPad }).map((_, index) => (
          <div key={`pad-${index}`} className="min-h-[92px]" />
        ))}

        {days.map(day => {
          const dayPosts = getPostsForDay(day)
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[92px] rounded-xl border p-2 transition-colors ${
                isToday(day)
                  ? 'border-brand-500/55 bg-brand-600/10'
                  : dayPosts.length
                    ? 'border-brand-500/30 bg-brand-600/[0.07]'
                    : 'border-white/10 bg-white/[0.025] hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-semibold ${isToday(day) ? 'text-brand-300' : 'text-white/60'}`}>
                  {format(day, 'd')}
                </span>
                {dayPosts.length > 0 && (
                  <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-[0_6px_14px_rgba(139,92,246,0.28)]">
                    {dayPosts.length}
                  </span>
                )}
              </div>

              {dayPosts.length > 0 && (
                <div className="mt-2 space-y-1">
                  {dayPosts.slice(0, 2).map(post => (
                    <div
                      key={post.id}
                      className="rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] leading-4 text-white/70"
                      title={post.title}
                    >
                      <div className="truncate font-medium">{post.title}</div>
                      <div className="text-white/35">{format(new Date(post.scheduledAt), 'h:mm a')}</div>
                    </div>
                  ))}
                  {dayPosts.length > 2 && (
                    <div className="text-[11px] text-brand-300/80 px-1">
                      +{dayPosts.length - 2} more scheduled
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
