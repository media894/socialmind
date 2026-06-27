import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  Loader2,
  Plus,
  Send,
  Trash2,
  Youtube,
} from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'
import { socialAccountsApi, videosApi } from '@/api/client'

const PLATFORM_ICONS = {
  instagram: Instagram,
  facebook:  Facebook,
  linkedin:  Linkedin,
  youtube:   Youtube,
  tiktok:    Globe,
}

const PLATFORM_COLORS = {
  instagram: 'from-fuchsia-500 to-rose-500',
  facebook:  'from-blue-500 to-indigo-600',
  linkedin:  'from-sky-500 to-blue-700',
  youtube:   'from-red-500 to-rose-700',
  tiktok:    'from-slate-700 to-slate-900',
}

function defaultSchedule() {
  const base = new Date()
  base.setMinutes(base.getMinutes() + 30 - (base.getMinutes() % 15))
  return base
}

function toInputValue(date) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toISOFromLocal(value) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

export default function MultiPlatformSchedulePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const accountId = user?.id || 'guest'

  const [entries, setEntries] = useState([])

  const variantsQuery = useQuery({
    queryKey: ['preview-variants', id],
    queryFn: () => videosApi.previewVariants(id).then(r => r.data),
    enabled: !!id,
  })

  const accountsQuery = useQuery({
    queryKey: ['social-accounts', accountId],
    queryFn: () => socialAccountsApi.list().then(r => r.data),
  })

  const accounts = useMemo(() => {
    const rows = accountsQuery.data
    const list = Array.isArray(rows) ? rows : (rows?.results || [])
    return list.filter(a => a.is_active !== false)
  }, [accountsQuery.data])

  const variantsByContentKey = useMemo(() => {
    const map = {}
    ;(variantsQuery.data?.variants || []).forEach(v => {
      if (!map[v.content_key]) map[v.content_key] = v
    })
    return map
  }, [variantsQuery.data])

  const scheduleMutation = useMutation({
    mutationFn: () => {
      const schedules = entries.map(entry => ({
        social_account: entry.social_account_id,
        scheduled_at:   toISOFromLocal(entry.scheduled_at_local),
        caption:        entry.caption,
        hashtags:       entry.hashtags,
      }))
      return videosApi.scheduleMulti(id, { schedules })
    },
    onSuccess: () => {
      toast.success(`Scheduled ${entries.length} post${entries.length === 1 ? '' : 's'}`)
      qc.invalidateQueries({ queryKey: ['posts'] })
      qc.invalidateQueries({ queryKey: ['videos'] })
      navigate('/schedule')
    },
    onError: err => {
      const msg = err?.response?.data?.error || 'Could not schedule posts'
      toast.error(msg)
    },
  })

  function addEntry(account) {
    if (!account) return
    const variant = variantsByContentKey[account.platform]
    setEntries(curr => [
      ...curr,
      {
        key:                `${account.id}-${Date.now()}`,
        social_account_id:  account.id,
        platform:           account.platform,
        account_username:   account.platform_username || account.username || account.email,
        scheduled_at_local: toInputValue(defaultSchedule()),
        caption:            variant?.caption || '',
        hashtags:           Array.isArray(variant?.hashtags) ? variant.hashtags : [],
      },
    ])
  }

  function removeEntry(key) {
    setEntries(curr => curr.filter(e => e.key !== key))
  }

  function updateEntry(key, patch) {
    setEntries(curr => curr.map(e => (e.key === key ? { ...e, ...patch } : e)))
  }

  const readyToSchedule = entries.length > 0 && entries.every(e => e.scheduled_at_local && e.social_account_id)

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <button
            onClick={() => navigate(`/videos/${id}`)}
            className="text-xs text-white/40 hover:text-white inline-flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to video
          </button>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            Schedule Across Platforms
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Pick a date &amp; time for each connected account. Each platform will receive
            its optimal aspect ratio automatically.
          </p>
        </div>
        <button
          disabled={!readyToSchedule || scheduleMutation.isPending}
          onClick={() => scheduleMutation.mutate()}
          className="btn-primary inline-flex items-center gap-2"
        >
          {scheduleMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Schedule {entries.length > 0 ? `(${entries.length})` : ''}
        </button>
      </div>

      {/* Platform variant info */}
      {variantsQuery.data?.variants?.length > 0 && (
        <div className="glass-card p-4">
          <p className="text-xs text-white/40 mb-3 uppercase tracking-[0.15em]">Auto-generated platform versions</p>
          <div className="flex flex-wrap gap-2">
            {variantsQuery.data.variants.map(v => (
              <div key={v.platform}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <span className="text-xs font-medium text-white capitalize">{v.label}</span>
                <span className="text-[10px] text-white/40 bg-white/10 rounded px-1.5 py-0.5">{v.aspect_ratio}</span>
                <span className="text-[10px] text-white/30">{v.resolution}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Account picker */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Connected accounts</h2>
            <p className="text-xs text-white/45 mt-0.5">
              Tap an account to add it to the schedule list below.
            </p>
          </div>
          <button
            onClick={() => navigate('/settings')}
            className="text-xs text-brand-400 hover:text-brand-300"
          >
            Manage connections →
          </button>
        </div>

        {accountsQuery.isLoading ? (
          <div className="text-sm text-white/50 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading accounts…
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            No connected social accounts yet. Head to Settings to link Instagram, YouTube, LinkedIn, or others.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {accounts.map(account => {
              const Icon = PLATFORM_ICONS[account.platform] || Globe
              const gradient = PLATFORM_COLORS[account.platform] || 'from-slate-600 to-slate-800'
              const used = entries.some(e => e.social_account_id === account.id)
              return (
                <button
                  key={account.id}
                  onClick={() => addEntry(account)}
                  className={`group flex items-center gap-2 rounded-xl border px-3 py-2 transition
                    ${used
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                      : 'border-white/10 bg-white/5 hover:bg-white/10 text-white/80'
                    }`}
                >
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                    <Icon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-semibold">
                      {account.platform_username || account.username || account.email || account.platform}
                    </div>
                    <div className="text-[10px] opacity-70 capitalize">{account.platform}</div>
                  </div>
                  {used ? (
                    <CheckCircle2 className="w-3.5 h-3.5 ml-1 text-emerald-300" />
                  ) : (
                    <Plus className="w-3.5 h-3.5 ml-1 opacity-70" />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Schedule entries */}
      {entries.length === 0 ? (
        <div className="glass-card p-8 text-center text-white/50">
          <Calendar className="w-8 h-8 mx-auto mb-3 text-white/30" />
          <p className="text-sm">
            Pick one or more connected accounts above to build your schedule.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map(entry => {
            const Icon = PLATFORM_ICONS[entry.platform] || Globe
            const gradient = PLATFORM_COLORS[entry.platform] || 'from-slate-600 to-slate-800'
            const variant = variantsByContentKey[entry.platform]
            const prettyWhen = entry.scheduled_at_local
              ? format(new Date(entry.scheduled_at_local), 'PPpp')
              : 'Pick a date & time'

            return (
              <div key={entry.key} className="glass-card p-5 flex flex-col md:flex-row gap-5">
                {/* Platform column */}
                <div className="md:w-[220px] flex md:flex-col md:items-start items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white capitalize">{entry.platform}</div>
                    <div className="text-xs text-white/50 truncate max-w-[180px]">
                      @{entry.account_username}
                    </div>
                    {variant?.aspect_ratio && (
                      <div className="text-[10px] uppercase tracking-[0.18em] text-white/35 mt-1">
                        {variant.aspect_ratio} · {variant.label}
                      </div>
                    )}
                  </div>
                </div>

                {/* Scheduling + metadata */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Date &amp; time
                    </label>
                    <input
                      type="datetime-local"
                      value={entry.scheduled_at_local}
                      min={toInputValue(defaultSchedule())}
                      onChange={e => updateEntry(entry.key, { scheduled_at_local: e.target.value })}
                      className="input"
                    />
                    <div className="text-[11px] text-white/45 mt-1">{prettyWhen}</div>
                  </div>

                  <div>
                    <label className="label">Caption override (optional)</label>
                    <textarea
                      rows={2}
                      value={entry.caption}
                      onChange={e => updateEntry(entry.key, { caption: e.target.value })}
                      placeholder={variant?.caption || 'Use default caption'}
                      className="input resize-none text-sm"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="label">Hashtags</label>
                    <input
                      value={(entry.hashtags || []).join(' ')}
                      onChange={e =>
                        updateEntry(entry.key, {
                          hashtags: e.target.value
                            .split(/[\s,]+/)
                            .map(t => t.trim())
                            .filter(Boolean)
                            .map(t => (t.startsWith('#') ? t : `#${t}`)),
                        })
                      }
                      placeholder="#launch #ai"
                      className="input text-sm"
                    />
                  </div>
                </div>

                {/* Remove */}
                <div className="md:self-start">
                  <button
                    onClick={() => removeEntry(entry.key)}
                    className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:bg-red-500/15 hover:text-red-300 hover:border-red-500/30 flex items-center justify-center transition"
                    title="Remove from schedule"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Bottom bar CTA */}
      {entries.length > 0 && (
        <div className="glass-card p-5 flex flex-col md:flex-row items-start md:items-center md:justify-between gap-4 sticky bottom-4 z-10">
          <div className="text-sm text-white/70">
            {entries.length} post{entries.length === 1 ? '' : 's'} ready to schedule
            &nbsp;·&nbsp; earliest&nbsp;
            <span className="text-white">
              {format(
                new Date(
                  entries.reduce(
                    (acc, cur) =>
                      !acc || new Date(cur.scheduled_at_local) < new Date(acc)
                        ? cur.scheduled_at_local
                        : acc,
                    '',
                  ),
                ),
                'PPpp',
              )}
            </span>
          </div>
          <button
            disabled={!readyToSchedule || scheduleMutation.isPending}
            onClick={() => scheduleMutation.mutate()}
            className="btn-primary inline-flex items-center gap-2 w-full md:w-auto justify-center"
          >
            {scheduleMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Schedule All Posts
          </button>
        </div>
      )}
    </div>
  )
}
