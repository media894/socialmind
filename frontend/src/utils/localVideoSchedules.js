function normalizePlatforms(platforms) {
  return Array.isArray(platforms) ? platforms.filter(Boolean) : []
}

function normalizeBackendPost(post) {
  if (!post?.id) return null

  return {
    id: String(post.id),
    project: post.project != null ? String(post.project) : null,
    platform: post.platform || 'social',
    platformSubtype: post.platform_subtype || post.platformSubtype || '',
    status: post.status || 'scheduled',
    scheduledAt: post.scheduled_at || post.scheduledAt || null,
    publishedAt: post.published_at || post.publishedAt || null,
    platformUrl: post.platform_url || post.platformUrl || '',
    errorMessage: post.error_message || post.errorMessage || '',
    likes_count: Number(post.likes_count || post.likesCount || 0),
    comments_count: Number(post.comments_count || post.commentsCount || 0),
    shares_count: Number(post.shares_count || post.sharesCount || 0),
    views_count: Number(post.views_count || post.viewsCount || 0),
  }
}

function createFallbackScheduleId(video, scheduledAt) {
  return `legacy_${video?.id || 'video'}_${scheduledAt || 'unscheduled'}`
}

function isSameScheduleEntry(a, b) {
  if (!a || !b) return false
  if (a.id && b.id) return a.id === b.id

  const aPlatforms = normalizePlatforms(a.scheduledPlatforms).join('|')
  const bPlatforms = normalizePlatforms(b.scheduledPlatforms).join('|')

  return (
    a.scheduledAt === b.scheduledAt &&
    aPlatforms === bPlatforms &&
    (a.scheduledTitle || '') === (b.scheduledTitle || '') &&
    (a.scheduledCaption || '') === (b.scheduledCaption || '') &&
    (a.backendProjectId || null) === (b.backendProjectId || null)
  )
}

function normalizeScheduleEntry(video, entry) {
  if (!entry?.scheduledAt) return null

  return {
    id: entry.id || createFallbackScheduleId(video, entry.scheduledAt),
    scheduledAt: entry.scheduledAt,
    scheduledPlatforms: normalizePlatforms(entry.scheduledPlatforms),
    scheduledTitle: entry.scheduledTitle || '',
    scheduledDescription: entry.scheduledDescription || '',
    scheduledCaption: entry.scheduledCaption || '',
    scheduledHashtags: entry.scheduledHashtags || '',
    scheduledCopyKit: entry.scheduledCopyKit || null,
    scheduledFormatPlan: entry.scheduledFormatPlan || null,
    platformSubtype: entry.platformSubtype || {},
    postStatus: entry.postStatus || 'scheduled',
    backendProjectId: entry.backendProjectId || null,
    backendPosts: Array.isArray(entry.backendPosts)
      ? entry.backendPosts.map(normalizeBackendPost).filter(Boolean)
      : [],
    publishedAt: entry.publishedAt || null,
    platformUrl: entry.platformUrl || '',
    errorMessage: entry.errorMessage || '',
    createdAt: entry.createdAt || video?.created_at || new Date().toISOString(),
  }
}

function sortScheduleEntries(entries) {
  return [...entries].sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt))
}

function isStaleFailedEntry(entry) {
  if (String(entry?.postStatus || '').toLowerCase() !== 'failed' && String(entry?.status || '').toLowerCase() !== 'failed') return false
  const referenceTime = new Date(entry?.createdAt || entry?.publishedAt || entry?.scheduledAt || 0).getTime()
  if (!referenceTime) return false
  const staleWindowMs = 7 * 24 * 60 * 60 * 1000
  return (Date.now() - referenceTime) > staleWindowMs
}

function deriveEntryStatus(entry, backendPosts) {
  const statuses = (Array.isArray(backendPosts) ? backendPosts : [])
    .map(post => String(post?.status || '').toLowerCase())
    .filter(Boolean)

  if (!statuses.length) return entry.postStatus || 'scheduled'
  if (statuses.includes('cancelled')) return 'cancelled'
  if (statuses.includes('published')) return 'published'
  if (statuses.includes('publishing')) return 'publishing'
  if (statuses.includes('scheduled')) return 'scheduled'
  if (statuses.includes('failed')) return 'failed'
  return entry.postStatus || 'scheduled'
}

function pickPrimaryEntry(entries) {
  const sorted = sortScheduleEntries(entries)
  const activeEntry = sorted.find(entry => !['published', 'cancelled'].includes(entry.postStatus))
  return activeEntry || sorted[0] || null
}

function rebuildVideoFromEntries(video, entries) {
  const sortedEntries = sortScheduleEntries(entries)
  const primary = pickPrimaryEntry(sortedEntries)

  if (!primary) {
    return {
      ...video,
      status: 'approved',
      scheduleId: null,
      scheduledAt: null,
      scheduledPlatforms: [],
      scheduledTitle: '',
      scheduledDescription: '',
      scheduledCaption: '',
      scheduledHashtags: '',
      scheduledCopyKit: null,
      scheduledFormatPlan: null,
      platformSubtype: {},
      postStatus: null,
      backendProjectId: null,
      scheduleHistory: [],
    }
  }

  return {
    ...video,
    status: primary.postStatus || 'scheduled',
    scheduleId: primary.id,
    scheduledAt: primary.scheduledAt,
    scheduledPlatforms: primary.scheduledPlatforms,
    scheduledTitle: primary.scheduledTitle,
    scheduledDescription: primary.scheduledDescription,
    scheduledCaption: primary.scheduledCaption,
    scheduledHashtags: primary.scheduledHashtags,
    scheduledCopyKit: primary.scheduledCopyKit,
    scheduledFormatPlan: primary.scheduledFormatPlan,
    postStatus: primary.postStatus,
    backendProjectId: primary.backendProjectId,
    scheduleHistory: sortedEntries,
  }
}

export function getScheduleEntries(video) {
  if (!video) return []

  const history = Array.isArray(video.scheduleHistory)
    ? video.scheduleHistory
        .map(entry => normalizeScheduleEntry(video, entry))
        .filter(entry => entry && !isStaleFailedEntry(entry))
    : []

  const legacy = normalizeScheduleEntry(video, {
    id: video.scheduleId,
    scheduledAt: video.scheduledAt,
    scheduledPlatforms: video.scheduledPlatforms,
    scheduledTitle: video.scheduledTitle,
    scheduledDescription: video.scheduledDescription,
    scheduledCaption: video.scheduledCaption,
    scheduledHashtags: video.scheduledHashtags,
    scheduledCopyKit: video.scheduledCopyKit,
    scheduledFormatPlan: video.scheduledFormatPlan || null,
    postStatus: video.postStatus || video.status,
    backendProjectId: video.backendProjectId,
    createdAt: video.updated_at || video.created_at,
  })

  const merged = [...history]
  if (legacy && !isStaleFailedEntry(legacy) && !merged.some(entry => isSameScheduleEntry(entry, legacy))) {
    merged.push(legacy)
  }

  return sortScheduleEntries(merged)
}

export function appendScheduleEntry(video, scheduleInput) {
  const nextEntry = normalizeScheduleEntry(video, {
    ...scheduleInput,
    id: scheduleInput?.id || `schedule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  })

  const entries = sortScheduleEntries([...getScheduleEntries(video), nextEntry])

  return {
    ...video,
    status: nextEntry.postStatus || 'scheduled',
    scheduleId: nextEntry.id,
    scheduledAt: nextEntry.scheduledAt,
    scheduledPlatforms: nextEntry.scheduledPlatforms,
    scheduledTitle: nextEntry.scheduledTitle,
    scheduledDescription: nextEntry.scheduledDescription,
    scheduledCaption: nextEntry.scheduledCaption,
    scheduledHashtags: nextEntry.scheduledHashtags,
    scheduledCopyKit: nextEntry.scheduledCopyKit,
    scheduledFormatPlan: nextEntry.scheduledFormatPlan,
    platformSubtype: nextEntry.platformSubtype,
    postStatus: nextEntry.postStatus,
    backendProjectId: nextEntry.backendProjectId,
    scheduleHistory: entries,
  }
}

export function removeScheduleEntry(video, scheduleId) {
  const remaining = getScheduleEntries(video).filter(entry => entry.id !== scheduleId)

  if (!remaining.length) {
    return {
      ...video,
      status: video.status === 'scheduled' || video.status === 'publishing' ? 'approved' : video.status,
      scheduleId: null,
      scheduledAt: null,
      scheduledPlatforms: [],
      scheduledTitle: '',
      scheduledDescription: '',
      scheduledCaption: '',
      scheduledHashtags: '',
      scheduledCopyKit: null,
      scheduledFormatPlan: null,
      platformSubtype: {},
      postStatus: null,
      backendProjectId: null,
      scheduleHistory: [],
    }
  }

  return rebuildVideoFromEntries(video, remaining)
}

export function cancelScheduleEntry(video, scheduleId) {
  const entries = getScheduleEntries(video)
  const nextEntries = entries.map(entry => {
    if (String(entry.id) !== String(scheduleId)) return entry
    return {
      ...entry,
      postStatus: 'cancelled',
      backendPosts: [],
      publishedAt: null,
      platformUrl: '',
      errorMessage: 'Schedule cancelled',
    }
  })

  return rebuildVideoFromEntries(video, nextEntries)
}

export function flattenLocalScheduledVideos(videos) {
  return flattenLocalPostEntries(videos, ['scheduled', 'publishing', 'failed', 'cancelled'])
}

export function flattenLocalPostEntries(videos, statuses = null) {
  return (Array.isArray(videos) ? videos : [])
    .flatMap(video =>
      getScheduleEntries(video).map(entry => ({
        id: `${video.id}:${entry.id}`,
        videoId: video.id,
        scheduleId: entry.id,
        title: video.title,
        scheduledTitle: entry.scheduledTitle,
        scheduledDescription: entry.scheduledDescription,
        scenes: video.scenes,
        duration_seconds: video.duration_seconds,
        status: entry.postStatus || 'scheduled',
        scheduledAt: entry.scheduledAt,
        scheduledPlatforms: entry.scheduledPlatforms,
        scheduledTitle: entry.scheduledTitle,
        scheduledDescription: entry.scheduledDescription,
        scheduledCaption: entry.scheduledCaption,
        scheduledHashtags: entry.scheduledHashtags,
        scheduledCopyKit: entry.scheduledCopyKit,
        scheduledFormatPlan: entry.scheduledFormatPlan,
        platformSubtype: entry.platformSubtype,
        backendProjectId: entry.backendProjectId,
        backendPosts: Array.isArray(entry.backendPosts) ? entry.backendPosts : [],
        publishedAt: entry.publishedAt,
        platformUrl: entry.platformUrl,
        errorMessage: entry.errorMessage,
        likes_count: (entry.backendPosts || []).reduce((sum, post) => sum + Number(post?.likes_count || 0), 0),
        comments_count: (entry.backendPosts || []).reduce((sum, post) => sum + Number(post?.comments_count || 0), 0),
        shares_count: (entry.backendPosts || []).reduce((sum, post) => sum + Number(post?.shares_count || 0), 0),
        views_count: (entry.backendPosts || []).reduce((sum, post) => sum + Number(post?.views_count || 0), 0),
      }))
    )
    .filter(entry => !Array.isArray(statuses) || statuses.includes(entry.status))
    .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt))
}

export function syncLocalVideoPostStatuses(videos, backendPosts) {
  if (!Array.isArray(videos) || !Array.isArray(backendPosts) || !backendPosts.length) return videos

  const normalizedPosts = backendPosts.map(normalizeBackendPost).filter(Boolean)
  const postsById = new Map(normalizedPosts.map(post => [post.id, post]))

  return videos.map(video => {
    const entries = getScheduleEntries(video)
    if (!entries.length) return video

    let changed = false
    const nextEntries = entries.map(entry => {
      const existingBackendPosts = Array.isArray(entry.backendPosts)
        ? entry.backendPosts.map(normalizeBackendPost).filter(Boolean)
        : []

      const matchedById = existingBackendPosts
        .map(post => postsById.get(post.id))
        .filter(Boolean)

      const matchedFallback = normalizedPosts.filter(post => {
        if (!entry.backendProjectId || post.project !== String(entry.backendProjectId)) return false
        if (!entry.scheduledAt || !post.scheduledAt) return true
        return new Date(post.scheduledAt).toISOString() === new Date(entry.scheduledAt).toISOString()
      })

      const mergedBackendPosts = [...existingBackendPosts]
      for (const matchedPost of [...matchedById, ...matchedFallback]) {
        const existingIndex = mergedBackendPosts.findIndex(post => post.id === matchedPost.id)
        if (existingIndex >= 0) mergedBackendPosts[existingIndex] = matchedPost
        else mergedBackendPosts.push(matchedPost)
      }

      if (!mergedBackendPosts.length) {
        if (existingBackendPosts.length && ['published', 'publishing'].includes(entry.postStatus)) {
          changed = true
          return {
            ...entry,
            backendPosts: [],
            postStatus: 'approved',
            publishedAt: null,
            platformUrl: '',
            errorMessage: '',
          }
        }
        return entry
      }

      const nextStatus = deriveEntryStatus(entry, mergedBackendPosts)
      const nextPublishedAt =
        mergedBackendPosts
          .map(post => post.publishedAt)
          .filter(Boolean)
          .sort((a, b) => new Date(b) - new Date(a))[0] ||
        entry.publishedAt ||
        null
      const nextPlatformUrl =
        mergedBackendPosts.find(post => post.platformUrl)?.platformUrl ||
        entry.platformUrl ||
        ''
      const nextErrorMessage =
        mergedBackendPosts.find(post => post.errorMessage)?.errorMessage ||
        entry.errorMessage ||
        ''

      const entryChanged =
        nextStatus !== entry.postStatus ||
        nextPublishedAt !== entry.publishedAt ||
        nextPlatformUrl !== entry.platformUrl ||
        nextErrorMessage !== entry.errorMessage ||
        JSON.stringify(mergedBackendPosts) !== JSON.stringify(existingBackendPosts)

      if (!entryChanged) return entry

      changed = true
      return {
        ...entry,
        backendPosts: mergedBackendPosts,
        postStatus: nextStatus,
        publishedAt: nextPublishedAt,
        platformUrl: nextPlatformUrl,
        errorMessage: nextErrorMessage,
      }
    })

    return changed ? rebuildVideoFromEntries(video, nextEntries) : video
  })
}
