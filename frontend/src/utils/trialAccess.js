/**
 * Trial & Subscription Access Control
 *
 * Rules:
 *  - demo@socialmind.dev is the admin account and has unlimited access.
 *  - Every other user starts with 5 video creations and 10 scheduled posts per month.
 *  - Downloads and Analytics require subscription.
 *  - After the 5-video quota is used, Videos and Posted also require subscription.
 */

export const ADMIN_EMAIL = 'demo@socialmind.dev'
export const TRIAL_VIDEO_LIMIT = 5
export const TRIAL_SCHEDULE_LIMIT = 10
export const SUBSCRIPTION_KEY_PREFIX = 'sm_subscription:'
export const TRIAL_CANCELLED_KEY_PREFIX = 'sm_trial_cancelled:'

export function isAdminAccount(userOrEmail) {
  const email = typeof userOrEmail === 'string' ? userOrEmail : userOrEmail?.email
  return String(email || '').trim().toLowerCase() === ADMIN_EMAIL
}

function readSubscription(userId) {
  try {
    const raw = localStorage.getItem(`${SUBSCRIPTION_KEY_PREFIX}${userId}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveSubscription(userId, plan) {
  const record = {
    plan,
    subscribedAt: new Date().toISOString(),
    status: 'active',
  }
  localStorage.setItem(`${SUBSCRIPTION_KEY_PREFIX}${userId}`, JSON.stringify(record))
  return record
}

export function cancelSubscription(userId) {
  const existing = readSubscription(userId)
  if (!existing) return

  const record = {
    ...existing,
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
  }
  localStorage.setItem(`${SUBSCRIPTION_KEY_PREFIX}${userId}`, JSON.stringify(record))

  const scheduleKey = `sm_schedules:${userId}`
  try {
    const schedules = JSON.parse(localStorage.getItem(scheduleKey) || '[]')
    const updated = schedules.map(schedule =>
      schedule.status === 'scheduled' || schedule.status === 'pending'
        ? { ...schedule, status: 'cancelled', cancelledAt: new Date().toISOString() }
        : schedule
    )
    localStorage.setItem(scheduleKey, JSON.stringify(updated))
  } catch {
    // Local schedule cleanup is best-effort.
  }

  return record
}

export function getAccessLevel(user) {
  const userId = user?.id || 'guest'
  const videosUsed = Number(user?.videos_generated_this_month || 0)

  if (isAdminAccount(user)) {
    return {
      isDemo: true,
      isAdmin: true,
      isSubscribed: true,
      isTrial: false,
      isCancelled: false,
      trialVideosUsed: 0,
      trialVideosRemaining: Number.POSITIVE_INFINITY,
      trialExhausted: false,
      downloadsEnabled: true,
      analyticsEnabled: true,
      videosEnabled: true,
      scheduleEnabled: true,
      postedEnabled: true,
      fullAccess: true,
      subscription: { plan: 'admin', status: 'active' },
    }
  }

  const sub = readSubscription(userId)
  const backendPlan = String(user?.subscription_plan || 'free').toLowerCase()
  const hasBackendSubscription = backendPlan !== 'free' && backendPlan !== ''
  const isSubscribed = sub?.status === 'active' || hasBackendSubscription
  const isCancelled = sub?.status === 'cancelled'
  const trialVideosUsed = Math.min(videosUsed, TRIAL_VIDEO_LIMIT)
  const trialVideosRemaining = Math.max(0, TRIAL_VIDEO_LIMIT - videosUsed)
  const trialExhausted = videosUsed >= TRIAL_VIDEO_LIMIT

  return {
    isDemo: false,
    isAdmin: false,
    isSubscribed,
    isTrial: !isSubscribed && !isCancelled,
    isCancelled,
    trialVideosUsed,
    trialVideosRemaining,
    trialExhausted,
    downloadsEnabled: isSubscribed,
    analyticsEnabled: isSubscribed,
    videosEnabled: isSubscribed || !trialExhausted,
    scheduleEnabled: !isCancelled,
    postedEnabled: isSubscribed || !trialExhausted,
    fullAccess: isSubscribed,
    subscription: sub,
  }
}
