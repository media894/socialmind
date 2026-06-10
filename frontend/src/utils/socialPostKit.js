const PLATFORM_LIMITS = {
  instagram: 2200,
  facebook: 63206,
  linkedin: 3000,
  youtube: 5000,
  twitter: 280,
}

const PLATFORM_PREVIEW_META = {
  instagram: {
    label: 'Instagram',
    titleLabel: 'Profile title',
    bodyLabel: 'Caption',
    subtitle: 'Caption + hashtags',
    titleLimit: 100,
    hashtagLimit: 30,
  },
  facebook: {
    label: 'Facebook',
    titleLabel: 'Post title',
    bodyLabel: 'Caption',
    subtitle: 'Caption + hashtags',
    titleLimit: 100,
    hashtagLimit: 10,
  },
  linkedin: {
    label: 'LinkedIn',
    titleLabel: 'Post title',
    bodyLabel: 'Post copy',
    subtitle: 'Post copy + hashtags',
    titleLimit: 100,
    hashtagLimit: 5,
  },
  youtube: {
    label: 'YouTube',
    titleLabel: 'Shorts title',
    bodyLabel: 'Description',
    subtitle: 'Shorts title + description',
    titleLimit: 100,
    hashtagLimit: 15,
  },
  twitter: {
    label: 'Twitter/X',
    titleLabel: 'Title',
    bodyLabel: 'Post',
    subtitle: 'Post copy + hashtags',
    titleLimit: 100,
    hashtagLimit: 3,
  },
}

const PLATFORM_ASPECT_GUIDES = {
  instagram: {
    label: 'Instagram',
    idealRatio: '9/16',
    acceptedRatios: ['9/16', '1/1'],
    note: 'Reels and stories are strongest in vertical format.',
  },
  facebook: {
    label: 'Facebook',
    idealRatio: '1/1',
    acceptedRatios: ['1/1', '16/9', '9/16'],
    note: 'Square or landscape keeps the feed clean and readable.',
  },
  linkedin: {
    label: 'LinkedIn',
    idealRatio: '16/9',
    acceptedRatios: ['16/9', '1/1'],
    note: 'Landscape performs best for professional feeds, with square as a solid fallback.',
  },
  youtube: {
    label: 'YouTube',
    idealRatio: '9/16',
    acceptedRatios: ['9/16', '16/9'],
    note: 'Shorts are vertical; long-form videos can stay landscape.',
  },
  twitter: {
    label: 'Twitter/X',
    idealRatio: '16/9',
    acceptedRatios: ['16/9', '1/1', '9/16'],
    note: 'Landscape is safest, but square still works well in-feed.',
  },
}

function toText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function trimToLimit(text, limit) {
  const value = toText(text)
  if (!value || !limit || value.length <= limit) return value

  const slice = value.slice(0, Math.max(0, limit - 1))
  const lastSpace = slice.lastIndexOf(' ')
  if (lastSpace > Math.max(20, Math.floor(limit * 0.6))) {
    return `${slice.slice(0, lastSpace).trimEnd()}…`
  }
  return `${slice.trimEnd()}…`
}

function collectSeeds(video) {
  const sceneText = Array.isArray(video?.scenes)
    ? video.scenes.flatMap(scene => [
        scene?.overlayText,
        scene?.voiceover,
        ...(Array.isArray(scene?.tags) ? scene.tags : []),
      ])
    : []

  return [
    video?.title,
    video?.topic,
    video?.description,
    video?.ai_caption,
    video?.caption,
    video?.script,
    video?.fullScript,
    ...sceneText,
  ]
    .map(toText)
    .filter(Boolean)
}

function isGenericTitle(value) {
  const normalized = toText(value).toLowerCase()
  return [
    'video ad',
    'generated video',
    'untitled',
    'untitled video',
    'video',
    'short video',
  ].includes(normalized)
}

export function getPlatformPreviewMeta(platformId) {
  return PLATFORM_PREVIEW_META[platformId] || {
    label: platformId,
    titleLabel: 'Title',
    bodyLabel: 'Caption',
    subtitle: 'Caption + hashtags',
    titleLimit: 100,
    hashtagLimit: 10,
  }
}

export function formatPlatformPreviewBody(platformId, text) {
  const value = String(text ?? '').trim()
  if (!value) return ''

  if (platformId !== 'youtube') {
    return value.replace(/\r\n/g, '\n')
  }

  const normalized = value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  if (normalized.includes('\n')) return normalized

  const sentences = normalized
    .match(/[^.!?]+[.!?]?/g)
    ?.map(sentence => sentence.trim())
    .filter(Boolean) || []

  if (sentences.length >= 3) {
    return sentences.slice(0, 4).join('\n\n')
  }

  if (normalized.length > 160) {
    const midpoint = Math.floor(normalized.length / 2)
    const leftBreak = normalized.lastIndexOf(' ', midpoint)
    const breakPoint = leftBreak > 40 ? leftBreak : midpoint
    return `${normalized.slice(0, breakPoint).trim()}\n\n${normalized.slice(breakPoint).trim()}`
  }

  return normalized
}

export function getPlatformAspectGuide(platformId) {
  return PLATFORM_ASPECT_GUIDES[platformId] || {
    label: platformId,
    idealRatio: '1/1',
    acceptedRatios: ['1/1'],
    note: 'Use the safest native export for this platform.',
  }
}

export function assessPlatformAspectRatio(videoFormat, platformId) {
  const guide = getPlatformAspectGuide(platformId)
  const normalizedRatio = toText(videoFormat || '').replace(/:/g, '/')

  if (!normalizedRatio) {
    return {
      ...guide,
      currentRatio: '',
      status: 'warn',
      message: 'No ratio selected yet.',
    }
  }

  if (normalizedRatio === guide.idealRatio) {
    return {
      ...guide,
      currentRatio: normalizedRatio,
      status: 'good',
      message: `Matches the recommended ${guide.idealRatio} format.`,
    }
  }

  if (guide.acceptedRatios.includes(normalizedRatio)) {
    return {
      ...guide,
      currentRatio: normalizedRatio,
      status: 'warn',
      message: `Works for ${guide.label}, but ${guide.idealRatio} is the safest native fit.`,
    }
  }

  return {
    ...guide,
    currentRatio: normalizedRatio,
    status: 'bad',
    message: `Not ideal for ${guide.label}. Recommended format is ${guide.idealRatio}.`,
  }
}

export function buildPlatformAspectPlan(videoFormat, platforms = []) {
  return platforms.reduce((acc, platformId) => {
    acc[platformId] = assessPlatformAspectRatio(videoFormat, platformId)
    return acc
  }, {})
}

export function deriveGeneratedHashtags(video, maxCount = 12) {
  const tokens = collectSeeds(video)
    .flatMap(value => value.split(/[^a-zA-Z0-9]+/))
    .map(token => token.trim())
    .filter(token => token.length >= 3)
    .map(token => `#${token.replace(/^#+/, '').toLowerCase()}`)

  return [...new Set(tokens)].slice(0, maxCount)
}

export function deriveGeneratedTitle(video) {
  const rawTitle = collectSeeds(video).find(candidate => candidate && !isGenericTitle(candidate)) || 'Video Ad'
  return trimToLimit(rawTitle, 95)
}

export function deriveGeneratedDescription(video) {
  const candidates = [
    video?.description,
    video?.ai_caption,
    video?.caption,
    video?.script,
    video?.fullScript,
    collectSeeds(video).slice(0, 4).join('. '),
  ]

  const text = candidates.map(toText).find(Boolean) || 'Ready to publish.'
  return trimToLimit(text, 1000)
}

export function buildSocialPostKit(video) {
  const title = deriveGeneratedTitle(video)
  const description = deriveGeneratedDescription(video)
  const hashtags = deriveGeneratedHashtags(video)

  const platformCopy = Object.fromEntries(
    Object.entries(PLATFORM_LIMITS).map(([platform, limit]) => [
      platform,
      {
        title,
        caption: trimToLimit(description, limit),
        hashtags,
        limits: {
          title: getPlatformPreviewMeta(platform).titleLimit,
          caption: limit,
          hashtags: getPlatformPreviewMeta(platform).hashtagLimit,
        },
      },
    ])
  )

  return {
    title,
    description,
    caption: description,
    hashtags,
    hashtagsText: hashtags.join(' '),
    platformCopy,
  }
}
