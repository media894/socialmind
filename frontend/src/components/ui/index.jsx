import { Loader2 } from 'lucide-react'

// ─── StatusBadge ──────────────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  const labels = {
    draft: 'Draft', created: 'Created', generating: 'Generating', review: 'Rejected',
    approved: 'Approved', scheduled: 'Scheduled', publishing: 'Publishing',
    published: 'Posted', failed: 'Failed', cancelled: 'Cancelled',
  }
  return (
      <span className={`badge badge-${status}`}>
      {(status === 'generating' || status === 'publishing') && <Loader2 className="w-3 h-3 animate-spin" />}
      {labels[status] || status}
    </span>
  )
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
export function StatCard({ label, value, icon: Icon, trend, color = 'brand' }) {
  const colors = {
    brand: 'text-brand-400 bg-brand-500/10',
    green: 'text-green-400 bg-green-500/10',
    blue: 'text-blue-400 bg-blue-500/10',
    yellow: 'text-yellow-400 bg-yellow-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
  }
  return (
    <div className="glass-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-white/50 mb-1">{label}</p>
          <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
          {trend != null && (
            <p className={`text-xs mt-1 ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs last month
            </p>
          )}
        </div>
        {Icon && (
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center mb-4">
          <Icon className="w-8 h-8 text-brand-400/60" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      {description && <p className="text-white/40 text-sm mb-6 max-w-xs">{description}</p>}
      {action}
    </div>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
export function Skeleton({ className = '' }) {
  return <div className={`rounded-lg bg-surface-border shimmer ${className}`} />
}

export function CardSkeleton() {
  return (
    <div className="glass-card p-5 space-y-3">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-32 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg', scrollable = false }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${maxWidth} glass-card animate-slide-up ${scrollable ? 'flex flex-col max-h-[90vh] overflow-hidden' : 'p-6'}`}>
        {title && (
          <div className={`flex items-center justify-between ${scrollable ? 'px-6 pt-6 pb-4 border-b border-white/[0.07] shrink-0' : 'mb-5'}`}>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <button onClick={onClose} className="text-white/40 hover:text-white transition">✕</button>
          </div>
        )}
        {scrollable ? (
          <div className="overflow-y-auto flex-1 p-6">
            {children}
          </div>
        ) : children}
      </div>
    </div>
  )
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────
export function ProgressBar({ value, label, color = 'bg-brand-500' }) {
  return (
    <div>
      {label && (
        <div className="flex justify-between text-xs text-white/50 mb-1">
          <span>{label}</span>
          <span>{value}%</span>
        </div>
      )}
      <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  )
}

// ─── Select ───────────────────────────────────────────────────────────────────
export function Select({ label, value, onChange, options, className = '' }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input appearance-none cursor-pointer"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

// ─── Textarea ─────────────────────────────────────────────────────────────────
export function Textarea({ label, rows = 4, ...props }) {
  return (
    <div>
      {label && <label className="label">{label}</label>}
      <textarea rows={rows} className="input resize-none" {...props} />
    </div>
  )
}

// ─── Input ────────────────────────────────────────────────────────────────────
export function Input({ label, ...props }) {
  return (
    <div>
      {label && <label className="label">{label}</label>}
      <input className="input" {...props} />
    </div>
  )
}

// ─── PlatformIcon ────────────────────────────────────────────────────────────
export function PlatformIcon({ platform, size = 16 }) {
  const icons = {
    instagram: '📸',
    facebook: '👥',
    linkedin: '💼',
  }
  return <span style={{ fontSize: size }}>{icons[platform] || '🌐'}</span>
}