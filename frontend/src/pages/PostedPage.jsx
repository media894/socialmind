import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Clock, ExternalLink, Calendar } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { schedulingApi } from '@/api/client'
import { EmptyState } from '@/components/ui'
import { useAuthStore } from '@/store/auth'
import SubscriptionGate from '@/components/SubscriptionGate'

const PLATFORM_LABELS = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  twitter: 'Twitter/X',
}

function isRemovedPost(post) {
  const textMatch = /removed from the platform|was removed from the platform|deleted from the platform/i.test(post?.error_message || post?.errorMessage || '')
  return textMatch
}

export default function PostedPage() {
  const { user } = useAuthStore()
  const accountId = user?.id || 'guest'
  const { isLoading, data: publishedPosts } = useQuery({
    queryKey: ['posts', accountId, 'posted', 'published-live'],
    queryFn: () => schedulingApi.list({ status: 'published', page_size: 500 }).then(r => Array.isArray(r.data) ? r.data : (r.data?.results || [])),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  const visiblePosts = useMemo(() => {
    return (Array.isArray(publishedPosts) ? publishedPosts : []).filter(post => {
      const status = String(post?.status || '').toLowerCase()
      return status === 'published'
    })
  }, [publishedPosts])

  const postedCount = visiblePosts.length

  return (
    <SubscriptionGate feature="schedule">
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Posted — {postedCount}</h1>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="glass-card h-24 shimmer" />)}
        </div>
      ) : !visiblePosts.length ? (
        <EmptyState
          icon={CheckCircle2}
          title="No posted videos yet"
          description="When a scheduled video is published successfully, it will appear here."
        />
      ) : (
        <div className="space-y-3">
          {visiblePosts.map(post => (
            <div key={post.id} className="glass-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-white font-semibold text-sm truncate">{post.project_title}</h3>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold border bg-emerald-500/15 border-emerald-500/30 text-emerald-400">
                      posted
                    </span>
                    {isRemovedPost(post) && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold border bg-red-500/15 border-red-500/30 text-red-400">
                        removed from platform
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-white/60">
                      {PLATFORM_LABELS[post.platform] || post.platform}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-3 text-xs text-white/40">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Posted {post.published_at ? format(new Date(post.published_at), 'MMM d, yyyy · h:mm a') : 'just now'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Scheduled {format(new Date(post.scheduled_at), 'MMM d, yyyy · h:mm a')}
                    </span>
                    <span>
                      {post.published_at ? formatDistanceToNow(new Date(post.published_at), { addSuffix: true }) : ''}
                    </span>
                  </div>

                  {post.social_account_username && (
                    <div className="text-xs text-white/30 mt-2">@{post.social_account_username}</div>
                  )}
                </div>

                <div className="flex flex-col gap-2 flex-shrink-0">
                  {post.platform_url && (
                    <a
                      href={post.platform_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition text-xs font-medium"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open Post
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </SubscriptionGate>
  )
}