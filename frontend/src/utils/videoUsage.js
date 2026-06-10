function normalizeCreatedAt(video) {
  return video?.created_at || video?.createdAt || video?.updated_at || video?.updatedAt || null
}

export function isCreatedThisMonth(video, referenceDate = new Date()) {
  const createdAt = normalizeCreatedAt(video)
  if (!createdAt) return false

  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return false

  return created.getMonth() === referenceDate.getMonth() && created.getFullYear() === referenceDate.getFullYear()
}

export function countVideosCreatedThisMonth(videos, referenceDate = new Date()) {
  const seen = new Set()

  return (Array.isArray(videos) ? videos : []).filter(video => {
    if (video?.is_demo_seed) return false
    if (!isCreatedThisMonth(video, referenceDate)) return false

    const identity = String(
      video?.id ||
      video?.backendProjectId ||
      video?.project ||
      video?.videoId ||
      video?.title ||
      normalizeCreatedAt(video) ||
      ''
    ).trim().toLowerCase()

    if (!identity) return true
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  }).length
}
