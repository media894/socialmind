import { create } from 'zustand'
import { authApi } from '@/api/client'
import { setActiveAccountId } from '@/utils/accountStorage'

const SAVED_ACCOUNTS_KEY = 'sm_saved_accounts'

function readSavedAccounts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_ACCOUNTS_KEY) || '[]')
    return normalizeSavedAccounts(Array.isArray(parsed) ? parsed : [])
  } catch {
    return []
  }
}

function persistSavedAccounts(accounts) {
  localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(normalizeSavedAccounts(accounts)))
}

function accountKey(account) {
  return String(
    account?.id ||
    account?.email ||
    account?.username ||
    account?.first_name ||
    ''
  ).trim().toLowerCase()
}

function normalizeSavedAccounts(accounts) {
  const seen = new Set()
  return (Array.isArray(accounts) ? accounts : []).filter(account => {
    if (!account?.access || !account?.refresh) return false
    const key = accountKey(account)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function snapshotAccount(user, access, refresh) {
  if (!user?.id) return null
  return {
    id: String(user.id),
    email: user.email || '',
    username: user.username || '',
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    avatar: user.avatar || '',
    access: access || localStorage.getItem('access_token') || '',
    refresh: refresh || localStorage.getItem('refresh_token') || '',
    user,
    updated_at: new Date().toISOString(),
  }
}

export const useAuthStore = create((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  savedAccounts: readSavedAccounts(),
  activeAccountId: localStorage.getItem('sm_active_account_id') || null,

  refreshUser: async () => {
    try {
      const { data } = await authApi.getProfile()
      set(state => ({
        user: data,
        isAuthenticated: state.isAuthenticated || true,
        savedAccounts: (() => {
          const next = readSavedAccounts().filter(account => String(account.id) !== String(data.id))
          const snapshot = snapshotAccount(data)
          if (snapshot) {
            next.unshift(snapshot)
            persistSavedAccounts(next)
            setActiveAccountId(data.id)
          }
          return normalizeSavedAccounts(next)
        })(),
        activeAccountId: String(data.id),
      }))
      return data
    } catch {
      return null
    }
  },

  init: async () => {
    const token = localStorage.getItem('access_token')
    if (!token) { set({ isLoading: false }); return }
    try {
      const { data } = await authApi.getProfile()
      const snapshot = snapshotAccount(data)
      const savedAccounts = readSavedAccounts().filter(account => String(account.id) !== String(data.id))
      if (snapshot) {
        savedAccounts.unshift(snapshot)
        persistSavedAccounts(savedAccounts)
        setActiveAccountId(data.id)
      }
      set({ user: data, isAuthenticated: true, isLoading: false, savedAccounts: normalizeSavedAccounts(savedAccounts), activeAccountId: String(data.id) })
    } catch {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('sm_active_account_id')
      set({ isLoading: false })
    }
  },

  completeAuth: (data) => {
    localStorage.setItem('access_token', data.access)
    localStorage.setItem('refresh_token', data.refresh)
    const snapshot = snapshotAccount(data.user, data.access, data.refresh)
    const savedAccounts = readSavedAccounts().filter(account => String(account.id) !== String(data.user?.id))
    if (snapshot) {
      savedAccounts.unshift(snapshot)
      persistSavedAccounts(savedAccounts)
      setActiveAccountId(data.user.id)
    }
    set({ user: data.user, isAuthenticated: true, savedAccounts: normalizeSavedAccounts(savedAccounts), activeAccountId: String(data.user?.id || '') })
    return data
  },

  login: async (email, password, otpChannel = 'email') => {
    const { data } = await authApi.login(email, password, otpChannel)
    return data
  },

  verifyLoginOtp: async (payload) => {
    const { data } = await authApi.verifyLoginOtp(payload)
    return get().completeAuth(data)
  },

  register: async (formData) => {
    const { data } = await authApi.register(formData)
    return data
  },

  verifyRegisterOtp: async (payload) => {
    const { data } = await authApi.verifyRegisterOtp(payload)
    return get().completeAuth(data)
  },

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('sm_active_account_id')
    set({ user: null, isAuthenticated: false, activeAccountId: null })
  },

  updateUser: (updates) => set(state => ({ user: { ...state.user, ...updates } })),

  switchAccount: async (accountId) => {
    const savedAccounts = readSavedAccounts()
    const account = savedAccounts.find(entry => String(entry.id) === String(accountId))
    if (!account?.refresh) return false

    localStorage.setItem('access_token', account.access || '')
    localStorage.setItem('refresh_token', account.refresh)
    setActiveAccountId(account.id)
    set({ isLoading: true, activeAccountId: String(account.id) })

    try {
      // Try refreshing the token first so we always get a valid access token
      try {
        const { data: refreshData } = await authApi.refreshToken(account.refresh)
        if (refreshData?.access) {
          localStorage.setItem('access_token', refreshData.access)
          if (refreshData.refresh) localStorage.setItem('refresh_token', refreshData.refresh)
        }
      } catch (_) { /* access token may still be valid */ }

      const { data } = await authApi.getProfile()
      const newAccess = localStorage.getItem('access_token') || account.access
      const newRefresh = localStorage.getItem('refresh_token') || account.refresh
      const snapshot = snapshotAccount(data, newAccess, newRefresh)
      const nextAccounts = readSavedAccounts().filter(entry => String(entry.id) !== String(data.id))
      if (snapshot) {
        nextAccounts.unshift(snapshot)
        persistSavedAccounts(nextAccounts)
      }
      set({ user: data, isAuthenticated: true, isLoading: false, savedAccounts: normalizeSavedAccounts(nextAccounts), activeAccountId: String(data.id) })
      return data
    } catch (error) {
      set({ isLoading: false })
      return false
    }
  },
}))
