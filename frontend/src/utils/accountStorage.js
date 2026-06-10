const DEFAULT_ACCOUNT_ID = 'guest'

export function getActiveAccountId() {
  return localStorage.getItem('sm_active_account_id') || DEFAULT_ACCOUNT_ID
}

export function setActiveAccountId(accountId) {
  localStorage.setItem('sm_active_account_id', String(accountId || DEFAULT_ACCOUNT_ID))
}

export function getLocalVideosKey(accountId = getActiveAccountId()) {
  return `sm_local_videos:${accountId || DEFAULT_ACCOUNT_ID}`
}

export function readLocalVideos(accountId = getActiveAccountId()) {
  try {
    return JSON.parse(localStorage.getItem(getLocalVideosKey(accountId)) || '[]')
  } catch {
    return []
  }
}

export function writeLocalVideos(videos, accountId = getActiveAccountId()) {
  localStorage.setItem(getLocalVideosKey(accountId), JSON.stringify(Array.isArray(videos) ? videos : []))
}

export function readLocalVideoBlobKey(videoId, accountId = getActiveAccountId()) {
  return `sm_stitched_${accountId || DEFAULT_ACCOUNT_ID}_${videoId}`
}

