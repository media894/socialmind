import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart3,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Download,
  Eye,
  Heart,
  HelpCircle,
  LayoutDashboard,
  Loader2,
  LogOut,
  MessageCircle,
  Menu,
  Moon,
  Plus,
  Settings,
  Share2,
  Sun,
  UserCircle2,
  Video,
  X,
  Zap,
} from 'lucide-react'

import { authApi, schedulingApi, videosApi } from '@/api/client'
import { useAuthStore } from '@/store/auth'
import { getLocalVideosKey } from '@/utils/accountStorage'
import CreateVideoChoiceModal from '@/components/CreateVideoChoiceModal'
import AIChatWidget from '@/components/AIChatWidget'
import PricingModal from '@/components/PricingModal'
import ProActivatedBanner from '@/components/ProActivatedBanner'
import { monthlyVideoQuota } from '@/utils/subscription'

function TouchIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 4.5a2 2 0 1 1 4 0V11l1.25-.78a2 2 0 0 1 2.65.46l.38.5.5-.22a2 2 0 0 1 2.57.9l.35.7a4 4 0 0 1 .25 3.04l-.75 2.5A4 4 0 0 1 15.38 21h-3.7a4 4 0 0 1-3.23-1.65L4.4 13.78a1.9 1.9 0 0 1 .26-2.55 1.9 1.9 0 0 1 2.62.09L8 12.1V4.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 3.5 18 1m.5 6.5H22m-4.2-2.9 2.7-1.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/videos', icon: Video, label: 'Videos' },
  { to: '/schedule', icon: Calendar, label: 'Schedule' },
  { to: '/posted', icon: CheckCircle2, label: 'Posted' },
  { to: '/downloads', icon: Download, label: 'Downloads' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/how-it-works', icon: TouchIcon, label: 'How it Works' },
]

const SEEN_NOTIFICATIONS_KEY_PREFIX = 'sm_seen_notifications:'
const DISMISSED_NOTIFICATIONS_KEY_PREFIX = 'sm_dismissed_notifications:'

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout, savedAccounts = [], switchAccount, activeAccountId } = useAuthStore()
  const qc = useQueryClient()
  const accountId = user?.id || 'guest'

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [plansOpen, setPlansOpen] = useState(false)
  const [seenNotificationIds, setSeenNotificationIds] = useState(() => loadSeenNotifications(user?.id))
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState(() => loadDismissedNotifications(user?.id))
  const [switchReauth, setSwitchReauth] = useState(null)
  const notificationsRef = useRef(null)
  const accountRef = useRef(null)
  const duePublishRef = useRef(false)

  const switchableAccounts = useMemo(() => {
    const seen = new Set()
    return (savedAccounts || []).filter(account => {
      if (!account?.access || !account?.refresh) return false
      if (String(account.id) === String(activeAccountId)) return false
      const key = String(account.id || account.email || account.username || '').trim().toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [savedAccounts, activeAccountId])
  const accountDisplayName = user?.username || user?.first_name || user?.email || 'Account'
  const accountInitial = accountDisplayName?.[0]?.toUpperCase() || 'U'

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('theme-light', theme === 'light')
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    setNotificationsOpen(false)
    setAccountOpen(false)
    setMobileOpen(false)
  }, [location.key])

  useEffect(() => {
    function handlePointerDown(event) {
      const target = event.target
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false)
      }
      if (accountRef.current && !accountRef.current.contains(target)) {
        setAccountOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [])

  useEffect(() => {
    if (!notificationsOpen) return
    const timer = window.setTimeout(() => setNotificationsOpen(false), 8000)
    return () => window.clearTimeout(timer)
  }, [notificationsOpen])

  useEffect(() => {
    setSeenNotificationIds(loadSeenNotifications(user?.id))
  }, [user?.id])

  useEffect(() => {
    setDismissedNotificationIds(loadDismissedNotifications(user?.id))
  }, [user?.id])

  const postsQuery = useQuery({
    queryKey: ['layout', accountId, 'notifications', 'published'],
    queryFn: () => schedulingApi.list({ status: 'published' }).then(r => r.data.results || r.data || []),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  })

  const activityQuery = useQuery({
    queryKey: ['layout', accountId, 'notifications', 'activity'],
    queryFn: () => schedulingApi.notifications().then(r => r.data || []),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  })

  const videosQuery = useQuery({
    queryKey: ['layout', accountId, 'videos', 'recent'],
    queryFn: () => videosApi.list({ page: 1 }).then(r => (Array.isArray(r.data) ? r.data : (r.data?.results || []))).then(items => items.filter(item => !item?.is_demo_seed)),
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  const notifications = useMemo(() => {
    const apiNotifications = Array.isArray(activityQuery.data) ? activityQuery.data.filter(Boolean) : []
    const normalizedActivityNotifications = apiNotifications.map(item => ({
      ...item,
      username: item.username || item.profileName || 'Someone',
      profileName: item.profileName || item.username || 'Someone',
      platform: item.platform || 'LinkedIn',
      detail: item.detail || '',
      message: item.message || '',
      targetUrl: item.targetUrl || item.analyticsTarget || '',
      total: Number(item.total || 1),
      count: Number(item.total || 1),
      icon: item.type,
    }))

    const combinedNotifications = normalizedActivityNotifications.filter(item => !dismissedNotificationIds.has(item.id))
    const dedupedNotifications = []
    const seenIds = new Set()
    combinedNotifications.forEach(item => {
      if (!item?.id || seenIds.has(item.id)) return
      seenIds.add(item.id)
      dedupedNotifications.push(item)
    })

    return dedupedNotifications.sort((a, b) => {
      const dateDiff = new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
      return dateDiff || (b.total - a.total)
    })
  }, [activityQuery.data, dismissedNotificationIds])

  const unreadCount = notifications.filter(item => !seenNotificationIds.has(item.id)).length
  const monthlyQuota = monthlyVideoQuota(user)
  const videosUsed = Number(user?.videos_generated_this_month || 0)
  const isQuotaExceeded = monthlyQuota > 0 && videosUsed >= monthlyQuota
  const focusOverlayOpen = notificationsOpen || accountOpen

  useEffect(() => {
    if (!notificationsOpen || !notifications.length) return
    const unreadIds = notifications.filter(item => !seenNotificationIds.has(item.id)).map(item => item.id)
    if (!unreadIds.length) return
    markNotificationsAsSeen(user?.id, unreadIds)
    setSeenNotificationIds(prev => {
      const next = new Set(prev)
      unreadIds.forEach(id => next.add(id))
      return next
    })
  }, [notificationsOpen, notifications, user?.id])

  useEffect(() => {
    if (!user?.id) return

    async function triggerDuePosts() {
      if (duePublishRef.current) return
      duePublishRef.current = true
      try {
        const { data } = await schedulingApi.triggerDue({ direct: true })
        if (data?.triggered) {
          qc.invalidateQueries({ queryKey: ['posts', accountId] })
          qc.invalidateQueries({ queryKey: ['layout', accountId] })
        }
      } catch {
        // The normal Celery scheduler may still handle publishing.
      } finally {
        duePublishRef.current = false
      }
    }

    triggerDuePosts()
    const interval = window.setInterval(triggerDuePosts, 30000)
    return () => window.clearInterval(interval)
  }, [user?.id, accountId, qc])

  // Listen for subscription gate "Upgrade" button across the app
  useEffect(() => {
    const handler = () => setPlansOpen(true)
    window.addEventListener('sm:open-plans', handler)
    return () => window.removeEventListener('sm:open-plans', handler)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleSwitchAccount = (accountId) => {
    if (String(accountId) === String(activeAccountId)) return
    const account = switchableAccounts.find(a => String(a.id) === String(accountId))
    const email = account?.email || ''
    setSwitchReauth({ accountId, email, password: '', error: '', loading: false, showPwd: false })
    setAccountOpen(false)
  }

  const handleSwitchReauthSubmit = async () => {
    if (!switchReauth) return
    const { accountId, email, password } = switchReauth
    setSwitchReauth(prev => ({ ...prev, error: '', loading: true }))
    try {
      // Verify password AND get fresh tokens (old stored tokens may be stale after a reset)
      const { data } = await authApi.loginWithPassword(email, password)

      // Update the stored account's tokens with the fresh ones returned by login
      // so switchAccount uses valid tokens, not the old potentially-expired ones
      const SAVED_KEY = 'sm_saved_accounts'
      try {
        const stored = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]')
        const updated = stored.map(acc =>
          String(acc.id) === String(accountId)
            ? { ...acc, access: data.access, refresh: data.refresh }
            : acc
        )
        localStorage.setItem(SAVED_KEY, JSON.stringify(updated))
      } catch { /* non-fatal */ }

      setSwitchReauth(null)
      const result = await switchAccount?.(accountId)
      if (result) {
        qc.invalidateQueries()
        navigate('/dashboard')
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Wrong password. Please try again.'
      setSwitchReauth(prev => ({ ...prev, error: msg, loading: false }))
    }
  }

  const navigateFromNotification = (target) => {
    setNotificationsOpen(false)
    setAccountOpen(false)
    setMobileOpen(false)
    const currentUrl = `${location.pathname}${location.search || ''}`
    if (target === currentUrl) return
    qc.invalidateQueries({ queryKey: ['analytics', accountId] })
    qc.invalidateQueries({ queryKey: ['posts', accountId] })
    window.setTimeout(() => navigate(target, { replace: true }), 0)
  }

  const markNotificationRead = (notificationId) => {
    if (!notificationId) return
    setSeenNotificationIds(prev => {
      const next = new Set(prev)
      next.add(notificationId)
      persistSeenNotifications(user?.id, next)
      return next
    })
  }

  const dismissNotification = (notificationId) => {
    if (!notificationId) return
    setDismissedNotificationIds(prev => {
      const next = new Set(prev)
      next.add(notificationId)
      persistDismissedNotifications(user?.id, next)
      return next
    })
    setSeenNotificationIds(prev => {
      const next = new Set(prev)
      next.delete(notificationId)
      persistSeenNotifications(user?.id, next)
      return next
    })
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <button
        onClick={() => { setNotificationsOpen(false); setAccountOpen(false); setMobileOpen(false); handleLogout() }}
        className={`relative flex items-center gap-3 p-5 border-b border-white/10 w-full hover:bg-white/5 transition overflow-hidden ${collapsed ? 'justify-center' : ''}`}
      >
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/45 to-transparent" />
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 via-violet-500 to-cyan-400 flex items-center justify-center flex-shrink-0 shadow-[0_10px_24px_rgba(139,92,246,0.3)]">
          <Zap className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0 text-left">
            <span className="block font-bold text-white text-lg tracking-tight leading-none">SocialMind</span>
            <span className="mt-1 block text-[10px] uppercase tracking-[0.22em] text-cyan-200/55">AI Studio</span>
          </div>
        )}
      </button>

      <div className="p-3">
        <button
          onClick={() => { setNotificationsOpen(false); setAccountOpen(false); setMobileOpen(false); setCreateModalOpen(true) }}
          className={`btn-primary w-full flex items-center gap-2 justify-center shadow-[0_14px_34px_rgba(139,92,246,0.28)] ${collapsed ? 'px-2' : ''}`}
        >
          <Plus className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Create Video</span>}
        </button>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {NAV.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to || location.pathname.startsWith(`${to}/`)
          const isHowItWorks = to === '/how-it-works'
          const showNewBadge = isHowItWorks && !localStorage.getItem('sm_visited_howto')
          return (
            <NavLink
              key={to}
              to={to}
              onClick={() => { setNotificationsOpen(false); setAccountOpen(false); setMobileOpen(false) }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
                ${isActive
                  ? 'bg-gradient-to-r from-brand-500/20 via-violet-500/14 to-cyan-400/10 text-white border border-brand-500/35 shadow-[0_10px_28px_rgba(139,92,246,0.14)]'
                  : 'text-white/50 hover:text-white hover:bg-white/5 hover:border-white/10 border border-transparent'
                } ${collapsed ? 'justify-center' : ''}`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-cyan-200' : ''}`} />
              {!collapsed && (
                <span className="flex-1 flex items-center justify-between">
                  {label}
                  {showNewBadge && (
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-brand-500 text-white px-1.5 py-0.5 rounded-full">
                      NEW
                    </span>
                  )}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="p-3 border-t border-white/10 bg-black/[0.08]">
        {!collapsed && user && (
          <div className="px-3 py-2 mb-2 rounded-xl border border-white/10 bg-white/[0.035]">
              <div className="text-xs text-white/45 mb-1">
                {videosUsed}/{monthlyQuota || 50} videos this month
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all bg-gradient-to-r from-brand-500 via-violet-300 to-cyan-300"
                  style={{ width: `${Math.min(100, (monthlyQuota || 50) ? (videosUsed / (monthlyQuota || 50)) * 100 : 0)}%` }}
                />
              </div>
            {isQuotaExceeded && (
              <button
                onClick={() => { setNotificationsOpen(false); setAccountOpen(false); setPlansOpen(true); setMobileOpen(false) }}
                className="mt-2 text-xs text-amber-300 hover:text-amber-200 transition-colors"
              >
                Monthly limit reached. Upgrade to continue.
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setNotificationsOpen(false)
            setAccountOpen(false)
            setMobileOpen(false)
            window.dispatchEvent(new Event('sm:open-help'))
          }}
          className={`group relative flex items-center gap-3 w-full px-3 py-2.5 mb-1 overflow-hidden rounded-xl border border-brand-500/20 bg-gradient-to-r from-brand-500/10 via-violet-500/12 to-cyan-400/10 text-sm text-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:text-white hover:border-cyan-300/35 hover:shadow-[0_10px_28px_rgba(139,92,246,0.16)] transition-all ${collapsed ? 'justify-center' : ''}`}
          title="Help & Support"
        >
          <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/45 to-transparent opacity-70" />
          <span className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/20 text-cyan-100 ring-1 ring-white/10 group-hover:bg-cyan-300/15 group-hover:text-white transition">
            <HelpCircle className="w-4 h-4 flex-shrink-0" />
          </span>
          {!collapsed && (
            <span className="relative flex-1 text-left font-medium">Help & Support</span>
          )}
        </button>
        <button
          onClick={() => { setNotificationsOpen(false); setAccountOpen(false); handleLogout() }}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-white/40
                     hover:text-red-400 hover:bg-red-500/10 transition-all ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && 'Logout'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <aside
        style={{ width: collapsed ? 64 : 240, transition: 'width 0.2s' }}
        className={`hidden md:flex flex-col flex-shrink-0 relative z-40 overflow-visible border-r border-white/10 bg-surface-50/85 backdrop-blur-2xl shadow-[18px_0_60px_rgba(0,0,0,0.18)] transition-all duration-300 ${focusOverlayOpen ? 'scale-[0.985] blur-[2px] opacity-60' : ''}`}
      >
        <SidebarContent />
        <button
          onClick={() => setCollapsed(value => !value)}
          className="absolute right-0 top-16 z-50 flex h-7 w-7 translate-x-1/2 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-brand-500 to-cyan-400 text-white shadow-[0_8px_20px_rgba(139,92,246,0.3)] transition hover:scale-105"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft className={`h-3.5 w-3.5 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
          <aside className="fixed inset-y-0 left-0 w-64 bg-surface-50/95 backdrop-blur-2xl border-r border-white/10 z-50 md:hidden">
            <div className="absolute top-3 right-3">
              <button onClick={() => setMobileOpen(false)} className="p-1 text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarContent />
          </aside>
        </>
      )}

      {switchReauth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSwitchReauth(null)}>
          <div
            className="w-full max-w-sm mx-4 rounded-2xl border border-white/10 bg-surface/90 backdrop-blur-md p-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-base font-semibold text-white">Verify your identity</div>
                <div className="text-xs text-white/40 mt-0.5 truncate max-w-[260px]">
                  Enter the password for <span className="text-white/70">{switchReauth.email}</span>
                </div>
              </div>
              <button onClick={() => setSwitchReauth(null)} className="text-white/30 hover:text-white transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <input
                  type={switchReauth.showPwd ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={switchReauth.password}
                  onChange={e => setSwitchReauth(prev => ({ ...prev, password: e.target.value, error: '' }))}
                  onKeyDown={e => e.key === 'Enter' && handleSwitchReauthSubmit()}
                  autoFocus
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-11 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-brand-500/50 focus:bg-white/[0.07] transition"
                />
                <button
                  type="button"
                  onClick={() => setSwitchReauth(prev => ({ ...prev, showPwd: !prev.showPwd }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition"
                  tabIndex={-1}
                >
                  {switchReauth.showPwd
                    ? <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>

              {switchReauth.error && (
                <p className="text-xs text-red-400">{switchReauth.error}</p>
              )}

              <button
                onClick={handleSwitchReauthSubmit}
                disabled={!switchReauth.password || switchReauth.loading}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {switchReauth.loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {switchReauth.loading ? 'Verifying…' : 'Switch Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {focusOverlayOpen && (
        <button
          type="button"
          aria-label="Close focused menu"
          onClick={() => {
            setNotificationsOpen(false)
            setAccountOpen(false)
          }}
          className="fixed inset-0 z-20 bg-black/35 backdrop-blur-[3px] transition-all duration-300"
        />
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="relative z-30 h-14 border-b border-white/10 flex items-center justify-between px-4 md:px-6 flex-shrink-0 bg-surface/72 backdrop-blur-2xl shadow-[0_10px_34px_rgba(0,0,0,0.12)]">
          <button className="md:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5 text-white/60" />
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-3">
            <button
              onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
              className="w-9 h-9 rounded-xl bg-white/[0.055] border border-white/10 flex items-center justify-center hover:bg-white/10 hover:border-cyan-300/25 transition"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-300" />
              ) : (
                <Moon className="w-4 h-4 text-brand-500" />
              )}
            </button>

            <div className="relative" ref={notificationsRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setNotificationsOpen(value => !value)
                  setAccountOpen(false)
                }}
                className={`relative w-9 h-9 rounded-xl bg-white/[0.055] border border-white/10 flex items-center justify-center hover:bg-white/10 hover:border-cyan-300/25 transition ${notificationsOpen ? 'z-40 border-cyan-300/55 bg-white/10 ring-2 ring-cyan-300/25 shadow-[0_0_28px_rgba(34,211,238,0.18)]' : ''}`}
                title="Notifications"
              >
                <Bell className="w-4 h-4 text-white/70" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-gradient-to-br from-brand-500 to-cyan-400 text-[10px] text-white flex items-center justify-center px-1 shadow-[0_6px_14px_rgba(139,92,246,0.3)]">
                    {Math.min(unreadCount, 9)}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div
                  className="absolute right-0 mt-3 w-[340px] max-w-[88vw] rounded-2xl border border-white/10 bg-surface/88 backdrop-blur-2xl shadow-[0_24px_70px_rgba(0,0,0,0.42)] p-4 z-40"
                  onMouseDown={e => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-sm font-semibold text-white">Notifications</div>
                      <div className="text-xs text-white/40">Real activity updates from your social posts</div>
                    </div>
                    <button
                      onClick={() => setNotificationsOpen(false)}
                      className="text-xs text-brand-400 hover:text-brand-300"
                    >
                      Close
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                    {notifications.length ? notifications.map(item => (
                      <div key={item.id} className={`rounded-2xl border bg-surface/60 p-3.5 ${seenNotificationIds.has(item.id) ? 'border-surface-border opacity-70' : 'border-brand-500/30'}`}>
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${notificationTone(item.type).shell}`}>
                            <NotificationIcon type={item.type} className={`w-4 h-4 ${notificationTone(item.type).icon}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 text-sm text-white/90 leading-6">
                                <div className="truncate text-white" title={notificationHeadline(item)}>
                                  {notificationHeadline(item)}
                                </div>
                                <div className="truncate text-xs text-white/40" title={notificationSubline(item)}>
                                  {notificationSubline(item)}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => {
                                    markNotificationRead(item.id)
                                    if (item.targetUrl) navigateFromNotification(item.targetUrl)
                                  }}
                                  className="text-[11px] text-brand-400 hover:text-brand-300"
                                >
                                  Open
                                </button>
                                <button
                                  type="button"
                                  onClick={() => dismissNotification(item.id)}
                                  className="text-white/35 hover:text-red-300 transition"
                                  title="Dismiss notification"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-2 text-xs text-white/45">
                              <span className={`inline-flex items-center rounded-full px-2.5 py-1 border ${notificationTone(item.type).tag}`}>
                                {item.platform}
                              </span>
                              <span>{item.detail}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-2xl border border-surface-border bg-surface-50 p-4 text-sm text-white/40">
                        No notifications yet. When someone likes, comments, or shares your post, it will show here.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="relative" ref={accountRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setAccountOpen(value => !value)
                  setNotificationsOpen(false)
                }}
                className={`flex items-center gap-2 rounded-xl bg-white/[0.055] border border-white/10 px-2.5 h-9 hover:bg-white/10 hover:border-cyan-300/25 transition ${accountOpen ? 'relative z-40 border-cyan-300/55 bg-white/10 ring-2 ring-cyan-300/25 shadow-[0_0_28px_rgba(34,211,238,0.18)]' : ''}`}
                title="Account"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500/35 to-cyan-400/25 border border-cyan-300/25 flex items-center justify-center">
                  <span className="text-xs font-bold text-cyan-50">
                    {accountInitial}
                  </span>
                </div>
                <span className="hidden md:block text-sm text-white/70 max-w-[120px] truncate">
                  {accountDisplayName}
                </span>
              </button>

              {accountOpen && (
                <div className="absolute right-0 mt-3 w-64 rounded-2xl border border-white/10 bg-surface/88 backdrop-blur-2xl shadow-[0_24px_70px_rgba(0,0,0,0.42)] p-3 z-40" onMouseDown={e => e.stopPropagation()}>
                  <div className="px-3 py-2 border-b border-surface-border mb-2">
                    <div className="text-sm font-semibold text-white">{accountDisplayName}</div>
                    <div className="text-xs text-white/40 truncate">{user?.email}</div>
                  </div>

                  {switchableAccounts.length > 0 && (
                    <div className="px-1 py-1 mb-2">
                      <div className="px-2 pb-2 text-[10px] uppercase tracking-[0.18em] text-white/35">Switch account</div>
                      <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                        {switchableAccounts.map(account => {
                          const displayName = account.username || account.first_name || account.email || 'Account'
                          return (
                            <button
                              key={account.id}
                              type="button"
                              onClick={() => handleSwitchAccount(account.id)}
                              className="w-full text-left rounded-xl px-3 py-2 border border-white/10 bg-white/[0.02] hover:bg-white/5 transition"
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-brand-600/20 border border-brand-600/30 flex items-center justify-center">
                                  <span className="text-xs font-bold text-brand-300">
                                    {displayName?.[0]?.toUpperCase() || 'A'}
                                  </span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm text-white truncate">{displayName}</div>
                                  <div className="text-[11px] text-white/40 truncate">{account.email}</div>
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setAccountOpen(false)
                      navigate('/settings')
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/70 hover:bg-white/5 hover:text-white transition"
                  >
                    <UserCircle2 className="w-4 h-4" />
                    Account settings
                  </button>
                  <button
                    onClick={() => {
                      setAccountOpen(false)
                      handleLogout()
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/70 hover:bg-white/5 hover:text-white transition"
                  >
                    <Plus className="w-4 h-4" />
                    Add account
                  </button>
                  <button
                    onClick={() => {
                      setAccountOpen(false)
                      handleLogout()
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-300 hover:bg-red-500/10 hover:text-red-200 transition"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className={`relative flex-1 overflow-y-auto transition-all duration-300 ${focusOverlayOpen ? 'scale-[0.985] blur-[2px] opacity-60' : ''}`}>
          <div className="pointer-events-none fixed inset-0 z-0">
            <div className="absolute left-[22%] top-16 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl" />
            <div className="absolute right-8 top-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
          </div>
          <Outlet />
        </main>
      </div>

      <AIChatWidget userName={user?.username || user?.first_name} />
      <PricingModal open={plansOpen} onClose={() => setPlansOpen(false)} checkoutEnabled />
      {createModalOpen && <CreateVideoChoiceModal onClose={() => setCreateModalOpen(false)} />}
      <ProActivatedBanner />
    </div>
  )
}

function NotificationIcon({ type, className }) {
  switch (type) {
    case 'like':
      return <Heart className={className} />
    case 'view':
      return <Eye className={className} />
    case 'comment':
      return <MessageCircle className={className} />
    case 'share':
      return <Share2 className={className} />
    default:
      return <Bell className={className} />
  }
}

function notificationActionText(type) {
  switch (type) {
    case 'like':
      return 'liked'
    case 'view':
      return 'viewed'
    case 'comment':
      return 'commented on'
    case 'share':
      return 'shared'
    default:
      return 'updated'
  }
}

function notificationTone(type) {
  switch (type) {
    case 'like':
      return {
        shell: 'bg-emerald-500/10 border-emerald-500/20',
        icon: 'text-violet-400',
        tag: 'border-emerald-500/20 bg-emerald-500/10 text-violet-300',
      }
    case 'view':
      return {
        shell: 'bg-blue-500/10 border-blue-500/20',
        icon: 'text-blue-400',
        tag: 'border-blue-500/20 bg-blue-500/10 text-blue-300',
      }
    case 'comment':
      return {
        shell: 'bg-amber-500/10 border-amber-500/20',
        icon: 'text-amber-400',
        tag: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
      }
    case 'share':
      return {
        shell: 'bg-cyan-500/10 border-cyan-500/20',
        icon: 'text-cyan-400',
        tag: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300',
      }
    default:
      return {
        shell: 'bg-white/5 border-white/10',
        icon: 'text-white/70',
        tag: 'border-white/10 bg-white/5 text-white/70',
      }
  }
}

function formatCount(value, label) {
  return `${value} ${label}${value === 1 ? '' : 's'}`
}

function notificationHeadline(item) {
  const type = item?.type || 'updated'
  const username = item?.username || item?.profileName || 'Someone'
  const title = item?.title || 'your post'
  const platform = item?.platform || 'LinkedIn'

  switch (type) {
    case 'like':
      return `${username} liked your post "${title}"`
    case 'comment':
      return `${username} commented on your post "${title}"`
    case 'share':
      return `${username} shared your post "${title}"`
    case 'view':
      return `${formatNumber(item?.count || item?.total || 0)} views on ${platform}`
    default:
      return item?.message || `${username} updated "${title}"`
  }
}

function notificationSubline(item) {
  const type = item?.type || 'updated'
  const platform = item?.platform || 'LinkedIn'
  const detail = item?.detail || ''

  switch (type) {
    case 'like':
    case 'comment':
    case 'share':
      return `${platform} • ${detail || 'new activity'}`
    case 'view':
      return `${platform} • ${detail || 'view activity'}`
    default:
      return `${platform} • ${detail || 'update'}`
  }
}

function seenNotificationsKey(accountId) {
  return `${SEEN_NOTIFICATIONS_KEY_PREFIX}${accountId || 'guest'}`
}

function loadSeenNotifications(accountId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(seenNotificationsKey(accountId)) || '[]')
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

function persistSeenNotifications(accountId, seenSet) {
  try {
    localStorage.setItem(seenNotificationsKey(accountId), JSON.stringify([...seenSet]))
  } catch {
    // Ignore storage failures
  }
}

function dismissedNotificationsKey(accountId) {
  return `${DISMISSED_NOTIFICATIONS_KEY_PREFIX}${accountId || 'guest'}`
}

function loadDismissedNotifications(accountId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(dismissedNotificationsKey(accountId)) || '[]')
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

function persistDismissedNotifications(accountId, dismissedSet) {
  try {
    localStorage.setItem(dismissedNotificationsKey(accountId), JSON.stringify([...dismissedSet]))
  } catch {
    // Ignore storage failures
  }
}

function markNotificationsAsSeen(accountId, ids) {
  const seen = loadSeenNotifications(accountId)
  ids.filter(Boolean).forEach(id => seen.add(id))
  persistSeenNotifications(accountId, seen)
}

function NotificationMetric({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className="text-sm font-semibold text-white mt-1">{value}</div>
    </div>
  )
}

function formatProfileName(user, post) {
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
  return (
    post?.social_account_username ||
    fullName ||
    user?.first_name ||
    user?.username ||
    'Your profile'
  )
}

function formatPlatform(platform) {
  switch (platform) {
    case 'instagram':
      return 'Instagram'
    case 'facebook':
      return 'Facebook'
    case 'linkedin':
      return 'LinkedIn'
    case 'youtube':
      return 'YouTube Shorts'
    default:
      return 'Unknown'
  }
}
