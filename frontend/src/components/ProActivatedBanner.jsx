import { useEffect, useState } from 'react'
import { Sparkles, X, CheckCircle2 } from 'lucide-react'

/**
 * ProActivatedBanner
 *
 * Renders a celebratory toast-style popup in the top-right corner when the user
 * successfully subscribes to a Pro plan.
 *
 * Usage: mount it in AppLayout and listen for the custom 'sm:pro-activated' event.
 * Dispatch the event with: window.dispatchEvent(new CustomEvent('sm:pro-activated', { detail: { planName } }))
 */
export default function ProActivatedBanner() {
  const [visible, setVisible] = useState(false)
  const [planName, setPlanName] = useState('Pro')
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    function handleActivated(e) {
      setPlanName(e.detail?.planName || 'Pro')
      setExiting(false)
      setVisible(true)
    }
    window.addEventListener('sm:pro-activated', handleActivated)
    return () => window.removeEventListener('sm:pro-activated', handleActivated)
  }, [])

  // Auto-dismiss after 6 seconds
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => dismiss(), 6000)
    return () => clearTimeout(timer)
  }, [visible])

  function dismiss() {
    setExiting(true)
    setTimeout(() => {
      setVisible(false)
      setExiting(false)
    }, 400)
  }

  if (!visible) return null

  return (
    <div
      className={`fixed top-4 right-4 z-[200] flex items-start gap-3 rounded-2xl border border-brand-500/40 bg-gradient-to-br from-[#0d0b1f]/96 via-violet-950/90 to-[#0d0b1f]/96 backdrop-blur-2xl shadow-[0_24px_70px_rgba(139,92,246,0.45)] px-5 py-4 min-w-[280px] max-w-[340px] transition-all duration-400 ${
        exiting ? 'opacity-0 translate-x-8 scale-95' : 'opacity-100 translate-x-0 scale-100'
      }`}
      style={{ animation: exiting ? undefined : 'sm-slide-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both' }}
    >
      {/* Glow strip */}
      <span className="absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />

      {/* Icon */}
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-cyan-400 shadow-[0_8px_20px_rgba(139,92,246,0.4)]">
        <Sparkles className="w-5 h-5 text-white" />
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-400">Activated</span>
        </div>
        <p className="mt-0.5 text-sm font-bold text-white leading-snug">
          {planName} Plan is now active!
        </p>
        <p className="mt-0.5 text-[11px] text-white/50 leading-snug">
          Full access unlocked — schedule, analytics &amp; downloads are ready.
        </p>
      </div>

      {/* Close */}
      <button
        onClick={dismiss}
        className="flex-shrink-0 rounded-lg p-1 text-white/30 hover:text-white hover:bg-white/10 transition"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <style>{`
        @keyframes sm-slide-in {
          from { opacity: 0; transform: translateX(40px) scale(0.92); }
          to   { opacity: 1; transform: translateX(0)    scale(1); }
        }
      `}</style>
    </div>
  )
}