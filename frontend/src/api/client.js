import axios from 'axios'

const getBaseURL = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8000/api/v1'
    }
  }
  return '/api/v1'
}

export const BACKEND_URL = getBaseURL()

const api = axios.create({
  baseURL: BACKEND_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token to every request
api.interceptors.request.use(config => {
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh on 401
api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config
    const requestUrl = original?.url || ''
    const isAuthRequest =
      requestUrl.includes('/auth/login/') ||
      requestUrl.includes('/auth/register/') ||
      requestUrl.includes('/auth/token/refresh/')

    if (err.response?.status === 401 && !original?._retry && !isAuthRequest) {
      original._retry = true
      try {
        const refresh = localStorage.getItem('refresh_token')
        const { data } = await axios.post(`${BACKEND_URL}/auth/token/refresh/`, { refresh })
        localStorage.setItem('access_token', data.access)
        original.headers.Authorization = `Bearer ${data.access}`
        return api(original)
      } catch {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.location.href = '/login'
      }
    }
    // Auto retry on Network Error (e.g. backend cold start on Render free tier)
    if (err.message === 'Network Error' && !original?._noRetry) {
   if (original.data instanceof FormData) {
  const retryCount = parseInt(original.headers['X-Retry-Count'] || '0', 10)
  if (retryCount < 3) {
    if (retryCount === 0) {
      import('react-hot-toast').then(m => m.default('Server is waking up, please wait...', { icon: '⏳', duration: 15000 }))
    }
    original.headers['X-Retry-Count'] = (retryCount + 1).toString()
    return new Promise(resolve => setTimeout(() => resolve(api(original)), 15000))
  }
  return Promise.reject(err)
}

      const retryCount = parseInt(original.headers['X-Retry-Count'] || '0', 10)
      if (retryCount < 5) {
        if (retryCount === 0) {
          import('react-hot-toast').then(m => m.default('Server is waking up, please wait a moment...', { icon: '⏳', duration: 8000 }))
        }
        original.headers['X-Retry-Count'] = (retryCount + 1).toString()
        console.warn(`Network Error - retrying request (${retryCount + 1}/5) in 10s...`)
        return new Promise(resolve => setTimeout(() => resolve(api(original)), 10000))
      }
    }

    return Promise.reject(err)
  }
)

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  checkEmail: (email) => api.post('/auth/check-email/', { email }),
  checkUsername: (username) => api.post('/auth/check-username/', { username }),
  startEmailOtp: (data) => api.post('/auth/email-otp/start/', data),
  register: (data) => api.post('/auth/register/', data),
  verifyRegisterOtp: (data) => api.post('/auth/register/verify-otp/', data),
  login: (email, password, otp_channel = 'email') => api.post('/auth/login/', { email, password, otp_channel }),
  loginWithPassword: (email, password) => api.post('/auth/login/', { email, password }),
  verifyLoginOtp: (data) => api.post('/auth/login/verify-otp/', data),
  passwordResetStart: (email) => api.post('/auth/password-reset/start/', { email }),
  passwordResetConfirm: (data) => api.post('/auth/password-reset/confirm/', data),
  refreshToken: (refresh) => api.post('/auth/token/refresh/', { refresh }),
  getProfile: () => api.get('/auth/profile/'),
  updateProfile: (data) => api.patch('/auth/profile/', data),
  deleteAccount: () => api.delete('/auth/account/'),
  consumeVideoQuota: () => api.post('/auth/profile/consume-video-quota/'),
  requestProfileEmailOtp: (contact) => api.post('/auth/profile/email/request-otp/', { contact }),
  verifyProfileEmailOtp: (data) => api.post('/auth/profile/email/verify-otp/', data),
  sendDemoInvite: (email) => api.post('/auth/demo-invite/', { email }),
  setupPasswordFromInvite: (data) => api.post('/auth/demo-invite/setup-password/', data),
}

// ── API Keys ──────────────────────────────────────────────────────────────────
export const billingApi = {
  paypalConfig: () => api.get('/auth/paypal/config/'),
  approvePayPalSubscription: (data) => api.post('/auth/paypal/subscription/approve/', data),
  activateLocalSubscription: (data) => api.post('/auth/subscription/local-activate/', data),
  cancelSubscription: () => api.post('/auth/paypal/subscription/cancel/'),
  activity: (params) => api.get('/auth/activity/', { params }),
}

export const apiKeysApi = {
  list: () => api.get('/auth/api-keys/'),
  create: (data) => api.post('/auth/api-keys/', data),
  update: (id, data) => api.patch(`/auth/api-keys/${id}/`, data),
  delete: (id) => api.delete(`/auth/api-keys/${id}/`),
  test: (id) => api.post(`/auth/api-keys/${id}/test/`),
}

// ── Social Accounts ───────────────────────────────────────────────────────────
export const socialAccountsApi = {
  list: () => api.get('/auth/social-accounts/'),
  connectOAuth: (data) => api.post('/auth/social-accounts/connect_oauth/', data),
  googleAuthStart: () => api.get('/auth/oauth/google/'),
  facebookAuthStart: () => api.get('/auth/oauth/facebook-login/'),
  instagramOAuthStart: () => api.get('/auth/oauth/instagram/'),
  youtubeOAuthStart: () => api.get('/auth/oauth/youtube/'),
  twitterOAuthStart: () => api.get('/auth/oauth/twitter/'),
  linkedinOAuthStart: () => api.get('/auth/oauth/linkedin/'),
  disconnect: (id) => api.post(`/auth/social-accounts/${id}/disconnect/`),
  byPlatform: (platform) => api.get('/auth/social-accounts/by_platform/', { params: { platform } }),
  publishStatus: (id) => api.get(`/auth/social-accounts/${id}/publish_status/`),
}

// ── Videos ────────────────────────────────────────────────────────────────────
export const videosApi = {
  list: (params) => api.get('/videos/projects/', { params }),
  get: (id) => api.get(`/videos/projects/${id}/`),
  create: (data) => api.post('/videos/projects/', data),
  importLocalVideo: (formData) => api.post('/videos/projects/import_local/', formData),
  scheduleLocalVideo: (formData) => api.post('/videos/projects/schedule_local/', formData),
  update: (id, data) => api.patch(`/videos/projects/${id}/`, data),
  delete: (id) => api.delete(`/videos/projects/${id}/`),
  generate: (id) => api.post(`/videos/projects/${id}/generate/`),
  approve: (id, data) => api.post(`/videos/projects/${id}/approve/`, data),
  reject: (id) => api.post(`/videos/projects/${id}/reject/`),
  status: (id) => api.get(`/videos/projects/${id}/status/`),
  uploadAsset: (id, formData) => api.post(`/videos/projects/${id}/upload_asset/`, formData),
  templates: () => api.get('/videos/templates/'),
  previewVariants: (id) => api.get(`/videos/projects/${id}/preview_variants/`),
  scheduleMulti: (id, data) => api.post(`/videos/projects/${id}/schedule_multi/`, data),
  generateCaption: (data) => api.post('/videos/projects/generate_caption/', data),
}

// ── Scheduling ────────────────────────────────────────────────────────────────
export const schedulingApi = {
  list: (params) => api.get('/social/posts/', { params }),
  create: (data) => api.post('/social/posts/', data),
  update: (id, data) => api.patch(`/social/posts/${id}/`, data),
  delete: (id) => api.delete(`/social/posts/${id}/`),
  publishNow: (id) => api.post(`/social/posts/${id}/publish_now/`),
  markAsPosted: (id) => api.post(`/social/posts/${id}/mark_as_posted/`),
  cancel: (id) => api.post(`/social/posts/${id}/cancel/`),
  triggerDue: (data = { direct: true }) => api.post('/social/posts/trigger_due/', data),
  recordShare: (id, data) => api.post(`/social/posts/${id}/record_share/`, data),
  calendar: (params) => api.get('/social/posts/calendar/', { params }),
  analyticsSummary: () => api.get('/social/posts/analytics_summary/'),
  notifications: () => api.get('/social/posts/notifications/'),
  forceRefreshAnalytics: () => api.post('/social/posts/force_refresh_analytics/'),
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
export const tasksApi = {
  status: (taskId) => api.get(`/tasks/${taskId}/`),
}

export default api
