import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, Send, X, Clock, CheckCircle2 } from 'lucide-react'
import { schedulingApi } from '@/api/client'
import { StatusBadge, EmptyState } from '@/components/ui'
import { useAuthStore } from '@/store/auth'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, isSameMonth } from 'date-fns'
import toast from 'react-hot-toast'

const PLATFORM_LABELS = {
  instagram: 'Instagram',
  instagram_reels: 'IG Reels',
  instagram_post: 'IG Post',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  youtube_shorts: 'YT Shorts',
  tiktok: 'TikTok',
  twitter: 'Twitter/X',
}

const PLATFORM_COLORS = {
  instagram: '#E1306C', instagram_reels: '#E1306C', instagram_post: '#E1306C',
  facebook: '#1877F2', linkedin: '#0A66C2',
  youtube: '#FF0000', youtube_shorts: '#FF0000',
  tiktok: '#010101', twitter: '#1DA1F2',
}

export default function SchedulePage() {
  const [view, setView] = useState('list')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [statusFilter, setStatusFilter] = useState('all')
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const accountId = user?.id || 'guest'

  const { data: posts, isLoading } = useQuery({
    queryKey: ['posts', accountId],
    queryFn: () => schedulingApi.list().then(r => Array.isArray(r.data) ? r.data : (r.data?.results || [])),
    refetchInterval: (query) => {
      const items = query.state.data || []
      return items.some(post => ['scheduled', 'publishing', 'failed'].includes(post.status)) ? 8000 : 30000
    },
  })

  const publishNowMutation = useMutation({
    mutationFn: id => schedulingApi.publishNow(id),
    onSuccess: () => {
      qc.invalidateQueries(['posts', accountId])
      toast.success('Publishing now...')
    },
    onError: err => toast.error(err.response?.data?.error || 'Failed to publish'),
  })

  const cancelMutation = useMutation({
    mutationFn: id => schedulingApi.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries(['posts', accountId])
      toast.success('Post cancelled')
    },
  })

  const markPostedMutation = useMutation({
    mutationFn: id => schedulingApi.markAsPosted(id),
    onSuccess: () => {
      qc.invalidateQueries(['posts', accountId])
      toast.success('Marked as posted ✅')
    },
    onError: err => toast.error(err.response?.data?.error || 'Failed to mark as posted'),
  })

  const statusTabs = [
    { key: 'all', label: 'All' },
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'publishing', label: 'Posting' },
    { key: 'published', label: 'Published' },
    { key: 'failed', label: 'Failed' },
  ]

  const filteredPosts = useMemo(() => {
    if (!posts) return []
    if (statusFilter === 'all') return posts
    return posts.filter(post => post.status === statusFilter)
  }, [posts, statusFilter])

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Schedule</h1>
          <p className="text-white/40 text-sm mt-1">Manage your upcoming and past posts</p>
        </div>
        <div className="flex gap-2">
          {['list', 'calendar'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                view === v
                  ? 'bg-brand-600/20 text-brand-400 border-brand-600/40'
                  : 'text-white/50 border-surface-border hover:text-white hover:bg-white/5'
              }`}
            >
              {v === 'list' ? 'List' : 'Calendar'}
            </button>
          ))}
        </div>
      </div>

      {view === 'calendar' ? (
        <CalendarView
          posts={posts || []}
          currentMonth={currentMonth}
          setCurrentMonth={setCurrentMonth}
        />
      ) : (
        <>
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            {statusTabs.map(tab => {
              const count = tab.key === 'all'
                ? posts?.length
                : posts?.filter(p => p.status === tab.key).length
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition flex items-center gap-1.5 whitespace-nowrap ${
                    statusFilter === tab.key
                      ? 'bg-brand-600/20 text-brand-400 border-brand-600/40'
                      : 'text-white/50 hover:text-white hover:bg-white/5 border-surface-border'
                  }`}
                >
                  {tab.label}
                  {count != null && (
                    <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-xs">{count}</span>
                  )}
                </button>
              )
            })}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="glass-card h-20 shimmer" />)}
            </div>
          ) : !posts?.length ? (
            <EmptyState
              icon={Calendar}
              title="No posts scheduled"
              description="Approve a video and schedule it to get started"
            />
          ) : !filteredPosts.length ? (
            <EmptyState
              icon={Calendar}
              title={`No ${statusFilter === 'all' ? '' : statusFilter} posts`}
              description="Try another filter or schedule a new post."
            />
          ) : (
            <div className="space-y-3">
              {filteredPosts.map(post => {
                const platformKey = post.platform_subtype || post.platform || ''
                const platformLabel = PLATFORM_LABELS[platformKey] || platformKey || 'Social'
                const platformColor = PLATFORM_COLORS[platformKey] || '#6366F1'
                return (
                <div key={post.id} className="glass-card p-4 flex items-start gap-4">
                  {/* Platform colour pill */}
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="text-xs font-bold rounded-lg px-2.5 py-1.5 text-white whitespace-nowrap"
                      style={{ background: platformColor + '22', border: `1px solid ${platformColor}55`, color: platformColor }}>
                      {platformLabel}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="font-medium text-white text-sm truncate">{post.project_title}</p>
                      <StatusBadge status={post.status} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-white/40 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(post.scheduled_at), 'MMM d, yyyy · h:mm a')}
                      </span>
                      {post.social_account_username && <span>@{post.social_account_username}</span>}
                    </div>
                    {post.status === 'published' && post.platform_url && (
                      <a href={post.platform_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-brand-400 hover:underline mt-1 block">
                        View on {platformLabel}
                      </a>
                    )}
                    {post.status === 'publishing' && (
                      <div className="text-xs text-brand-400 mt-1">
                        Posting in progress — refreshing automatically…
                      </div>
                    )}
                    {post.status === 'published' && (
                      <div className="flex gap-4 mt-1 text-xs text-white/30">
                        {post.likes_count > 0 && <span>❤️ {post.likes_count}</span>}
                        {post.comments_count > 0 && <span>💬 {post.comments_count}</span>}
                        {post.views_count > 0 && <span>👁 {post.views_count}</span>}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {(post.status === 'scheduled' || post.status === 'failed') && (
                      <>
                        <button
                          onClick={() => publishNowMutation.mutate(post.id)}
                          disabled={publishNowMutation.isPending}
                          className="btn-primary px-3 py-1.5 text-xs flex items-center gap-1"
                        >
                          <Send className="w-3 h-3" /> {post.status === 'failed' ? 'Retry' : 'Post Now'}
                        </button>
                        <button
                          onClick={() => markPostedMutation.mutate(post.id)}
                          disabled={markPostedMutation.isPending}
                          className="px-3 py-1.5 text-xs rounded-xl border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 flex items-center gap-1 transition"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Mark Posted
                        </button>
                        {post.status === 'scheduled' && (
                          <button
                            onClick={() => cancelMutation.mutate(post.id)}
                            className="btn-ghost px-3 py-1.5 text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                          >
                            <X className="w-3 h-3" /> Cancel
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CalendarView({ posts, currentMonth, setCurrentMonth }) {
  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  })
  const startPad = startOfMonth(currentMonth).getDay()

  const getPostsForDay = (day) => posts.filter(p => isSameDay(new Date(p.scheduled_at), day))

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1))}
          className="btn-ghost px-3 py-1.5 text-sm"
        >
          Prev
        </button>
        <h3 className="font-semibold text-white">{format(currentMonth, 'MMMM yyyy')}</h3>
        <button
          onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1))}
          className="btn-ghost px-3 py-1.5 text-sm"
        >
          Next
        </button>
      </div>

      <div className="grid grid-cols-7 mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-center text-xs text-white/30 py-2">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array(startPad).fill(null).map((_, i) => <div key={`pad-${i}`} />)}
        {days.map(day => {
          const dayPosts = getPostsForDay(day)
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[70px] p-1.5 rounded-lg border transition-colors ${
                isToday(day) ? 'border-brand-500/50 bg-brand-600/10' : 'border-surface-border hover:border-white/20'
              } ${!isSameMonth(day, currentMonth) ? 'opacity-30' : ''}`}
            >
              <div className={`text-xs font-medium mb-1 ${isToday(day) ? 'text-brand-400' : 'text-white/60'}`}>
                {format(day, 'd')}
              </div>
              {dayPosts.slice(0, 2).map(post => (
                <div
                  key={post.id}
                  className="text-xs px-1.5 py-0.5 rounded bg-brand-600/20 text-brand-400 truncate mb-0.5"
                >
                  {(PLATFORM_LABELS[post.platform] || 'WEB')} {post.project_title}
                </div>
              ))}
              {dayPosts.length > 2 && (
                <div className="text-xs text-white/30">+{dayPosts.length - 2} more</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
