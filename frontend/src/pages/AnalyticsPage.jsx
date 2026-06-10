import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  BarChart3,
  TrendingUp,
  Heart,
  Eye,
  Share2,
  MessageCircle,
  Activity,
  Radar,
  Clock3,
  RefreshCw,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { format, formatDistanceToNow, isValid } from 'date-fns'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { schedulingApi, socialAccountsApi } from '@/api/client'
import { useAuthStore } from '@/store/auth'
import { StatCard } from '@/components/ui'
import SubscriptionGate from '@/components/SubscriptionGate'

const LIVE_REFRESH_MS = 5000

function isRemovedPost(post) {
  const textMatch = /removed from the platform|was removed from the platform|deleted from the platform/i.test(post?.error_message || post?.errorMessage || '')
  return textMatch
}

function getEffectiveViews(post) {
  const likes = Number(post?.likes_count || 0)
  const comments = Number(post?.comments_count || 0)
  const shares = Number(post?.shares_count || 0)
  const rawViews = Number(post?.views_count || 0)
  const platform = String(post?.platform || '').toLowerCase()
  const engagementFallback = likes + comments + shares
  return platform === 'linkedin'
    ? Math.max(rawViews, engagementFallback)
    : Math.max(rawViews, engagementFallback)
}

function getEffectiveShares(post, activityShares = 0) {
  const backendShares = Number(post?.shares_count || 0)
  return Math.max(backendShares, Number(activityShares || 0))
}

export default function AnalyticsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const accountId = user?.id || 'guest'
  const [forceRefreshing, setForceRefreshing] = useState(false)

  async function handleForceRefresh() {
    setForceRefreshing(true)
    try {
      await schedulingApi.forceRefreshAnalytics()
      await qc.invalidateQueries({ queryKey: ['analytics'] })
      await qc.invalidateQueries({ queryKey: ['posts'] })
    } catch (e) {
      // silent — backend may still respond
    } finally {
      setForceRefreshing(false)
    }
  }

  const summaryQuery = useQuery({
    queryKey: ['analytics', accountId, 'summary', 'live'],
    queryFn: () => schedulingApi.analyticsSummary().then(r => r.data),
    refetchInterval: LIVE_REFRESH_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  const postsQuery = useQuery({
    queryKey: ['posts', accountId, 'published', 'live'],
    queryFn: () => schedulingApi.list({ status: 'published' }).then(r => r.data.results || r.data || []),
    refetchInterval: LIVE_REFRESH_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  const activityQuery = useQuery({
    queryKey: ['analytics', accountId, 'notifications', 'live'],
    queryFn: () => schedulingApi.notifications().then(r => r.data || []),
    refetchInterval: LIVE_REFRESH_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  const socialAccountsQuery = useQuery({
    queryKey: ['social-accounts', accountId, 'analytics-live'],
    queryFn: () => socialAccountsApi.list().then(r => Array.isArray(r.data) ? r.data : (r.data?.results || [])),
    refetchInterval: LIVE_REFRESH_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  const shareActivityByPostId = useMemo(() => {
    const items = Array.isArray(activityQuery.data) ? activityQuery.data : []
    return items.reduce((acc, item) => {
      if (String(item?.type || '').toLowerCase() !== 'share') return acc
      const postId = String(item?.postId || '').trim()
      if (!postId) return acc
      acc[postId] = (acc[postId] || 0) + Number(item?.total || 1)
      return acc
    }, {})
  }, [activityQuery.data])

  const posts = (postsQuery.data || []).filter(post =>
    post?.status === 'published' &&
    !isRemovedPost(post)
  )
  const visiblePosts = posts

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const selectedPostId = searchParams.get('post')
  const selectedEvent = searchParams.get('event')
  const selectedPlatformParam = searchParams.get('platform')

  const platformData = useMemo(() => {
    const platforms = [
      { key: 'instagram', name: 'Instagram', short: 'IG', color: '#e1306c', soft: 'rgba(225,48,108,0.12)' },
      { key: 'facebook', name: 'Facebook', short: 'FB', color: '#1877f2', soft: 'rgba(24,119,242,0.12)' },
      { key: 'linkedin', name: 'LinkedIn', short: 'LN', color: '#0a66c2', soft: 'rgba(10,102,194,0.12)' },
      { key: 'youtube', name: 'YouTube', short: 'YT', color: '#ff0033', soft: 'rgba(255,0,51,0.12)' },
    ]

    return platforms.map(item => {
      const platformPosts = visiblePosts.filter(post => String(post.platform || '').toLowerCase() === item.key)
      return {
        ...item,
        posts: platformPosts.length,
        likes: platformPosts.reduce((sum, post) => sum + Number(post.likes_count || 0), 0),
        shares: platformPosts.reduce((sum, post) => sum + getEffectiveShares(post, shareActivityByPostId[String(post.id)] || 0), 0),
        views: platformPosts.reduce((sum, post) => sum + getEffectiveViews(post), 0),
      }
    })
  }, [visiblePosts, shareActivityByPostId])

  const postInsights = posts
    .map(post => {
      const likes = post.likes_count ?? 0
      const comments = post.comments_count ?? 0
      const shares = getEffectiveShares(post, shareActivityByPostId[String(post.id)] || 0)
      const views = getEffectiveViews(post)

      return {
        id: post.id,
        title: post.project_title || 'Untitled post',
        platform: getPlatformLabel(post.platform),
        platformKey: post.platform,
        publishedAt: formatSafeDate(post.published_at),
        publishedAtRaw: post.published_at || null,
        likes,
        views,
        shares,
        comments,
        caption: post.caption || post.project_description || 'No caption added',
        profileName: post.social_account_username || 'Connected profile',
        postUrl: post.platform_url || null,
        status: post.status || 'published',
        analyticsDebug: post.analytics_debug || {},
      }
    })
    .sort((a, b) => (b.views - a.views) || (b.likes - a.likes))

  const linkedInShareSource = useMemo(() => {
    const accounts = Array.isArray(socialAccountsQuery.data) ? socialAccountsQuery.data : []
    const linkedInAccounts = accounts.filter(account => String(account?.platform || '').toLowerCase() === 'linkedin')
    const linkedInDebugs = postInsights
      .filter(post => post.platformKey === 'linkedin' && post.analyticsDebug)
      .map(post => post.analyticsDebug)
    const debug = summarizeLinkedInDebug(linkedInDebugs)
    const debugLabel = formatLinkedInDebugLabel(debug)
    return {
      label: 'LinkedIn share stats',
      value: linkedInAccounts.length
        ? (debugLabel || 'Synced from your connected LinkedIn account')
        : 'No LinkedIn account connected',
    }
  }, [socialAccountsQuery.data, postInsights])

  const defaultPlatform = platformData.find(item => item.posts > 0)?.key
    || postInsights.map(post => post.platformKey).find(Boolean)
    || 'linkedin'
  const activePlatform = selectedPlatformParam || defaultPlatform

  const filteredPostInsights = postInsights.filter(post => post.platformKey === activePlatform)
  const selectedPost = selectedPostId
    ? postInsights.find(post => String(post.id) === String(selectedPostId))
    : filteredPostInsights[0] || postInsights[0]

  const selectedNotification = useMemo(() => {
    const items = Array.isArray(activityQuery.data) ? activityQuery.data : []
    if (!selectedPostId || !selectedEvent) return null
    return items.find(item =>
      String(item?.postId || '') === String(selectedPostId) &&
      String(item?.type || '') === String(selectedEvent)
    ) || null
  }, [activityQuery.data, selectedEvent, selectedPostId])

  const filteredTimelineData = filteredPostInsights.slice(0, 8).map(post => ({
    name: `${post.title.slice(0, 16)}${post.title.length > 16 ? '...' : ''}`,
    likes: post.likes,
    views: post.views,
    shares: post.shares,
  }))

  const filteredRecentUpdates = [...filteredPostInsights]
    .sort((a, b) => new Date(b.publishedAtRaw || 0) - new Date(a.publishedAtRaw || 0))
    .slice(0, 8)

  const notificationLog = selectedPost ? buildNotificationLog(selectedPost, selectedEvent, selectedNotification, user?.username || user?.email || '') : []
  const topPost = postInsights[0]

  const stats = [
    { label: 'Total Posts Published', value: visiblePosts.length, icon: BarChart3, color: 'brand' },
    { label: 'Total Likes', value: visiblePosts.reduce((sum, post) => sum + Number(post.likes_count || 0), 0), icon: Heart, color: 'green' },
    { label: 'Total Views', value: visiblePosts.reduce((sum, post) => sum + getEffectiveViews(post), 0), icon: Eye, color: 'blue' },
    { label: 'Total Shares', value: visiblePosts.reduce((sum, post) => sum + getEffectiveShares(post, shareActivityByPostId[String(post.id)] || 0), 0), icon: Share2, color: 'purple' },
  ]

  const chartColors = { grid: '#2d2d4e', text: '#ffffff70', tooltip: '#17172a' }

  const setPlatform = platform => {
    const params = new URLSearchParams(location.search)
    params.set('platform', platform)
    navigate(`${location.pathname}?${params.toString()}`, { replace: true })
  }

  return (
    <SubscriptionGate feature="analytics">
    <div className="p-6 max-w-7xl mx-auto animate-fade-in space-y-6">
      <section className="glass-card p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-brand-400/80">
              <Activity className="w-3.5 h-3.5" />
              Posted Post Analytics
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight mt-2">Analytics Overview</h1>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 xl:min-w-[420px]">
            <HighlightCard
              label="Live refresh"
              value="5 sec"
              icon={Activity}
              accent="text-emerald-300"
            />
            <HighlightCard
              label="Top post"
              value={topPost?.title || 'No posted content'}
              note={topPost ? `${formatNumber(topPost.views)} views` : 'Publish posts to start tracking'}
              icon={TrendingUp}
              accent="text-brand-400"
            />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(stat => <StatCard key={stat.label} {...stat} />)}
      </div>

      <div className="grid xl:grid-cols-[1.2fr,1.8fr] gap-6">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">Posts by Platform</h3>
            <Radar className="w-4 h-4 text-white/30" />
          </div>
          {platformData.some(item => item.posts > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={platformData} dataKey="posts" nameKey="name" cx="50%" cy="50%" innerRadius={44} outerRadius={82} paddingAngle={3}>
                  {platformData.map(item => <Cell key={item.key} fill={item.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: chartColors.tooltip, border: '1px solid #2d2d4e', borderRadius: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-white/30 text-sm">No published posts yet</div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            {platformData.map(item => (
              <div key={item.key} className="rounded-2xl border border-surface-border p-3 text-center bg-surface-50">
                <div className="text-xs font-semibold mb-1" style={{ color: item.color }}>{item.short}</div>
                <div className="text-lg font-bold text-white">{formatNumber(item.posts)}</div>
                <div className="text-xs text-white/40">{item.name}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-white">Views by Platform</h3>
              <p className="text-xs text-white/40 mt-1">Clear view totals from posted content</p>
            </div>
            <span className="text-xs text-emerald-300/80">Auto-updating</span>
          </div>
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={platformData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="name" tick={{ fill: chartColors.text, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: chartColors.text, fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: chartColors.tooltip, border: '1px solid #2d2d4e', borderRadius: 10 }} formatter={value => [formatNumber(value), 'Views']} />
              <Bar dataKey="views" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">
        {platformData.map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => setPlatform(item.key)}
            className={`glass-card p-5 text-left transition-all ${activePlatform === item.key ? 'ring-1 ring-brand-500/60 border-brand-500/40' : ''}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold" style={{ color: item.color }}>{item.name}</div>
                <div className="text-xs text-white/40 mt-1">Live platform totals</div>
              </div>
              <div
                className="w-10 h-10 rounded-2xl border border-white/10 flex items-center justify-center text-sm font-bold"
                style={{ background: item.soft, color: item.color }}
              >
                {item.short}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <MetricMini label="Posts" value={item.posts} />
              <MetricMini label="Likes" value={item.likes} />
              <MetricMini label="Views" value={item.views} />
              <MetricMini label="Shares" value={item.shares} />
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-white/45">
        <span>Selected platform:</span>
        <span className="inline-flex items-center rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-brand-300">
          {getPlatformLabel(activePlatform)}
        </span>
      </div>

      <div className="grid xl:grid-cols-[1.55fr,1fr] gap-6">
        {filteredTimelineData.length > 0 ? (
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-white">Live Post Insights</h3>
                <p className="text-xs text-white/40 mt-1">{getPlatformLabel(activePlatform)} posts only</p>
              </div>
              <span className="text-xs text-white/35">Posted content only</span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={filteredTimelineData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="name" tick={{ fill: chartColors.text, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: chartColors.text, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: chartColors.tooltip, border: '1px solid #2d2d4e', borderRadius: 10 }} />
                <Bar dataKey="likes" name="Likes" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="views" name="Views" fill="#22c55e" radius={[6, 6, 0, 0]} />
                <Bar dataKey="shares" name="Shares" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="glass-card p-5 flex items-center justify-center text-sm text-white/40">
            Click Instagram, Facebook, LinkedIn, or YouTube to see live post insights for that platform.
          </div>
        )}

        <div className="glass-card p-5 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-white">Posted Updates</h3>
              <p className="text-xs text-white/40 mt-1">{getPlatformLabel(activePlatform)} updates only</p>
            </div>
            <Clock3 className="w-4 h-4 text-white/30" />
          </div>
          <div className="space-y-3 flex-1 min-h-0 max-h-[520px] overflow-y-auto pr-1">
            {filteredRecentUpdates.length ? (
              filteredRecentUpdates.map(post => (
                <div key={post.id} className="rounded-2xl border border-surface-border bg-surface-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{post.title}</div>
                      <div className="text-xs text-white/40 mt-1">{post.platform}</div>
                    </div>
                    <div className="text-xs text-white/35 whitespace-nowrap">
                      {formatSafeDistance(post.publishedAtRaw)}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <UpdateMetric label="Likes" value={post.likes} color="text-green-400" />
                    <UpdateMetric label="Views" value={post.views} color="text-blue-400" />
                    <UpdateMetric label="Shares" value={post.shares} color="text-purple-400" />
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-surface-border bg-surface-50 p-4 text-sm text-white/40">
                Click Instagram, Facebook, LinkedIn, or YouTube to see posted updates for that platform.
              </div>
            )}
          </div>
        </div>
      </div>

      {notificationLog.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-white">Notification Log</h3>
              <p className="text-xs text-white/40 mt-1">Detailed log for the selected notification</p>
            </div>
            <span className="text-xs text-brand-300 uppercase tracking-[0.18em]">{selectedEvent}</span>
          </div>
          <div className="space-y-3">
            {notificationLog.map(log => (
              <div key={log.id} className="rounded-2xl border border-surface-border bg-surface-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{log.title}</div>
                    <div className="text-xs text-white/40 mt-1">{log.description}</div>
                  </div>
                  <div className="text-sm font-semibold text-white">{log.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {filteredPostInsights.length > 0 && (
        <div className="glass-card p-6 flex flex-col min-h-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div>
              <h3 className="font-semibold text-white">Platform Post Details</h3>
              <p className="text-xs text-white/40 mt-1">All updates from the selected platform in one clean table</p>
            </div>
            <div className="text-right flex flex-col items-end gap-1.5">
              <button
                onClick={handleForceRefresh}
                disabled={forceRefreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600/20 border border-brand-500/30 text-brand-300 text-xs font-semibold hover:bg-brand-600/30 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${forceRefreshing ? 'animate-spin' : ''}`}/>
                {forceRefreshing ? 'Fetching from YouTube...' : 'Refresh Stats'}
              </button>
              <div className="text-xs text-emerald-300/80">
                {summaryQuery.isFetching || postsQuery.isFetching ? 'Refreshing now...' : 'Live data active'}
              </div>
              {activePlatform === 'linkedin' && (
                <div className="mt-1 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/40">
                  {linkedInShareSource.label}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 h-[42vh] lg:h-[48vh] overflow-y-scroll overflow-x-auto pr-1 overscroll-contain" style={{ scrollbarGutter: 'stable' }}>
            <table className="w-full min-w-[860px] border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.18em] text-white/35 border-b border-surface-border">
                  <th className="sticky top-0 z-10 bg-surface-card pb-3 pr-4 font-medium">Post</th>
                  <th className="sticky top-0 z-10 bg-surface-card pb-3 pr-4 font-medium">Platform</th>
                  <th className="sticky top-0 z-10 bg-surface-card pb-3 pr-4 font-medium">Published</th>
                  <th className="sticky top-0 z-10 bg-surface-card pb-3 pr-4 font-medium">Profile</th>
                  <th className="sticky top-0 z-10 bg-surface-card pb-3 pr-4 font-medium">Likes</th>
                  <th className="sticky top-0 z-10 bg-surface-card pb-3 pr-4 font-medium">Views</th>
                  <th className="sticky top-0 z-10 bg-surface-card pb-3 pr-4 font-medium">Comments</th>
                  <th className="sticky top-0 z-10 bg-surface-card pb-3 font-medium">Shares</th>
                </tr>
              </thead>
              <tbody>
                {filteredPostInsights.map(post => (
                  <tr
                    key={post.id}
                    className="border-b border-surface-border/70 last:border-0 hover:bg-white/[0.02] transition"
                  >
                    <td className="py-4 pr-4">
                      <div className="text-sm font-medium text-white">{post.title}</div>
                    </td>
                    <td className="py-4 pr-4">
                      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                        {post.platform}
                      </span>
                    </td>
                    <td className="py-4 pr-4 text-sm text-white/50">{post.publishedAt}</td>
                    <td className="py-4 pr-4 text-sm text-white/60">{post.profileName}</td>
                    <td className="py-4 pr-4">
                      <MetricPill icon={Heart} value={post.likes} color="text-green-400" />
                    </td>
                    <td className="py-4 pr-4">
                      <MetricPill icon={Eye} value={post.views} color="text-blue-400" />
                    </td>
                    <td className="py-4 pr-4">
                      <MetricPill icon={MessageCircle} value={post.comments} color="text-amber-400" />
                    </td>
                    <td className="py-4 pr-4">
                      <div className="flex flex-col items-start gap-1">
                        <MetricPill
                          icon={Share2}
                          value={post.shares}
                          color="text-purple-400"
                          title={getLinkedInShareTooltip(post)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!visiblePosts.length && (
        <div className="glass-card p-12 text-center">
          <TrendingUp className="w-12 h-12 text-brand-400/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No analytics yet</h3>
          <p className="text-white/40 text-sm">Publish some posts and analytics will appear here</p>
        </div>
      )}
    </div>
    </SubscriptionGate>
  )
}

function HighlightCard({ label, value, note, icon: Icon, accent }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-50 p-4">
      <div className={`flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] ${accent}`}>
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="text-white font-semibold mt-2 line-clamp-1">{value}</div>
      <div className="text-xs text-white/35 mt-1">{note}</div>
    </div>
  )
}

function MetricMini({ label, value }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-50 p-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className="text-lg font-semibold text-white mt-2">{formatNumber(value)}</div>
    </div>
  )
}

function UpdateMetric({ label, value, color }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className={`text-sm font-semibold mt-2 ${color}`}>{formatNumber(value)}</div>
    </div>
  )
}

function MetricPill({ icon: Icon, value, color, onClick, title, suffixIcon: SuffixIcon }) {
  const classes = `inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 transition ${
    onClick
      ? 'cursor-pointer hover:border-white/20 hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-brand-500/60'
      : ''
  }`

  const content = (
    <>
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      <span className="text-sm font-medium text-white">{formatNumber(value)}</span>
      {SuffixIcon && <SuffixIcon className="w-3 h-3 text-white/30" />}
    </>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title} className={classes}>
        {content}
      </button>
    )
  }

  return <div className={classes} title={title}>{content}</div>
}

function buildNotificationLog(post, event, notification, fallbackActor) {
  if (!event) return []

  const metricMap = {
    like: { label: 'Likes', value: post.likes },
    view: { label: 'Views', value: post.views },
    comment: { label: 'Comments', value: post.comments },
    share: { label: 'Shares', value: post.shares },
  }

  const activeMetric = metricMap[event]
  if (!activeMetric) return []

  const actorName = formatHandle(notification?.username || notification?.profileName || fallbackActor || '')
  const sharePlatform = getPlatformLabel(notification?.platformKey || notification?.platform || post.platformKey || post.platform)

  if (event === 'share') {
    const log = [
      {
        id: 'sharer',
        title: 'Username',
        description: 'Who shared this post',
        value: actorName || 'LinkedIn member',
      },
      {
        id: 'shared-via',
        title: 'Shared Via',
        description: 'Target platform used for the share',
        value: sharePlatform,
      },
      {
        id: 'profile',
        title: 'Profile',
        description: 'Profile receiving this social activity',
        value: post.profileName,
      },
      {
        id: 'platform',
        title: 'Platform',
        description: 'Platform where this activity happened',
        value: post.platform,
      },
      {
        id: 'post',
        title: 'Post Title',
        description: 'Post linked with this notification',
        value: post.title,
      },
      {
        id: 'metric',
        title: activeMetric.label,
        description: `Current total ${activeMetric.label.toLowerCase()} for this post`,
        value: formatNumber(activeMetric.value),
      },
      {
        id: 'published',
        title: 'Published Time',
        description: 'When this post was published',
        value: post.publishedAt,
      },
    ]

    return log
  }

  return [
    {
      id: 'profile',
      title: 'Profile',
      description: 'Profile receiving this social activity',
      value: post.profileName,
    },
    {
      id: 'platform',
      title: 'Platform',
      description: 'Platform where this activity happened',
      value: post.platform,
    },
    {
      id: 'post',
      title: 'Post Title',
      description: 'Post linked with this notification',
      value: post.title,
    },
    {
      id: 'metric',
      title: activeMetric.label,
      description: `Current total ${activeMetric.label.toLowerCase()} for this post`,
      value: formatNumber(activeMetric.value),
    },
    {
      id: 'published',
      title: 'Published Time',
      description: 'When this post was published',
      value: post.publishedAt,
    },
  ]
}

function getPlatformLabel(platform) {
  switch (platform) {
    case 'instagram':
      return 'Instagram'
    case 'facebook':
      return 'Facebook'
    case 'linkedin':
      return 'LinkedIn'
    case 'youtube':
      return 'YouTube'
    case 'whatsapp':
      return 'WhatsApp'
    case 'x':
    case 'twitter':
      return 'X'
    case 'email':
      return 'Email'
    default:
      return 'Unknown'
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0))
}

function formatHandle(value) {
  const raw = String(value || '').trim()
  if (!raw) return '@unknown'
  if (raw.startsWith('@')) return raw
  const localPart = raw.includes('@') ? raw.split('@')[0] : raw
  const normalized = localPart.replace(/\s+/g, '').trim()
  return `@${normalized || 'unknown'}`
}

function formatSafeDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (!isValid(date)) return '-'
  return format(date, 'MMM d, yyyy h:mm a')
}

function formatSafeDistance(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (!isValid(date)) return '-'
  return formatDistanceToNow(date, { addSuffix: true })
}

function formatLinkedInDebugLabel(debug) {
  if (!debug || typeof debug !== 'object') return ''
  const source = String(debug.source || '').toLowerCase()
  const status = String(debug.status || '').toLowerCase()

  if (source === 'membercreatorpostanalytics') {
    if (status === 'ok') return 'LinkedIn member reshare analytics'
    if (status === 'no_rows') return 'LinkedIn member analytics returned no rows'
    return 'LinkedIn member analytics access limited'
  }

  if (source === 'organizationalentitynotifications') {
    if (status === 'share_rows') return 'LinkedIn returned SHARE rows'
    if (status === 'share_mention_rows') return 'LinkedIn returned SHARE_MENTION rows'
    if (status === 'access_limited') return 'LinkedIn no rows because of permission/access limits'
    if (status === 'no_rows') return 'LinkedIn may hide row-level shares; totals still sync'
  }

  if (source === 'organizationalentitysharestatistics') {
    if (status === 'ok') return 'LinkedIn share statistics synced'
    if (status === 'access_limited') return 'LinkedIn share stats access limited'
    if (status === 'no_rows') return 'LinkedIn share stats totals only'
  }

  return ''
}

function getLinkedInShareTooltip(post) {
  if (!post || String(post.platformKey || post.platform || '').toLowerCase() !== 'linkedin') {
    return 'Shares count'
  }

  const debug = post.analyticsDebug || {}
  const label = formatLinkedInDebugLabel(debug)
  if (label) {
    return `Shares count - ${label}`
  }

  return 'Shares count - LinkedIn analytics synced'
}

function summarizeLinkedInDebug(debugList) {
  const items = Array.isArray(debugList) ? debugList.filter(Boolean) : []
  if (!items.length) return {}

  const priority = [
    ['organizationalEntityNotifications', 'share_rows'],
    ['organizationalEntityNotifications', 'share_mention_rows'],
    ['organizationalEntityNotifications', 'access_limited'],
    ['memberCreatorPostAnalytics', 'ok'],
    ['organizationalEntityShareStatistics', 'ok'],
  ]

  for (const [source, status] of priority) {
    const match = items.find(item =>
      String(item.source || '').toLowerCase() === source.toLowerCase() &&
      String(item.status || '').toLowerCase() === status.toLowerCase()
    )
    if (match) return match
  }

  return items[0] || {}
}