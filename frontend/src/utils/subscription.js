/**
 * SocialMind subscription / trial helpers
 *
 * Trial:  subscription_plan === 'free'  AND  videos_generated_this_month < TRIAL_VIDEO_LIMIT
 * Locked: subscription_plan === 'free'  AND  videos_generated_this_month >= TRIAL_VIDEO_LIMIT
 * Pro:    subscription_plan !== 'free'  (individual, team, …)
 */

export const TRIAL_VIDEO_LIMIT = 5
export const TRIAL_SCHEDULE_LIMIT = 10
export const PRO_VIDEO_LIMIT = 50
export const ADMIN_EMAIL = 'demo@socialmind.dev'
export const ADMIN_VIDEO_LIMIT = 1000000

function readLocalSubscription(userId) {
  try {
    const raw = localStorage.getItem(`sm_subscription:${userId || 'guest'}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Returns true when the user has an active paid subscription.
 */
export function isPro(user) {
  if (String(user?.email || '').trim().toLowerCase() === ADMIN_EMAIL) return true
  const plan = String(user?.subscription_plan || 'free').toLowerCase()
  const localSubscription = readLocalSubscription(user?.id)
  return (plan !== 'free' && plan !== '') || localSubscription?.status === 'active'
}

export function monthlyVideoQuota(user) {
  if (String(user?.email || '').trim().toLowerCase() === ADMIN_EMAIL) {
    return ADMIN_VIDEO_LIMIT
  }
  if (isPro(user)) {
    return Math.max(PRO_VIDEO_LIMIT, Number(user?.effective_monthly_video_quota || user?.monthly_video_quota || 0))
  }
  return TRIAL_VIDEO_LIMIT
}

/**
 * Returns true when the user is on the free tier and has exhausted their trial quota.
 * Premium features (analytics, downloads) should be blocked.
 */
export function isTrialExhausted(user) {
  if (!user) return false
  if (isPro(user)) return false
  const used = Number(user.videos_generated_this_month || 0)
  return used >= TRIAL_VIDEO_LIMIT
}

/**
 * Returns how many trial videos remain (0 once exhausted).
 */
export function trialVideosRemaining(user) {
  if (isPro(user)) return Infinity
  const used = Number(user?.videos_generated_this_month || 0)
  return Math.max(0, TRIAL_VIDEO_LIMIT - used)
}
