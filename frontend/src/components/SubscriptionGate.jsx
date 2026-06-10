import { Lock, Sparkles, BarChart3, Calendar, Download } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { getAccessLevel } from '@/utils/trialAccess'

const FEATURE_META = {
  schedule: {
    icon: Calendar,
    title: 'Schedule & Auto-Publish',
    description: 'Automatically publish your videos to Instagram, Facebook, LinkedIn, YouTube and more on any schedule you choose.',
    perks: ['Schedule posts in advance', 'Auto-publish to 5+ platforms', 'Calendar view & management'],
  },
  analytics: {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    description: 'Track views, likes, shares, and comments across every platform in one live dashboard.',
    perks: ['Real-time engagement stats', 'Platform-by-platform breakdown', 'Post performance history'],
  },
  downloads: {
    icon: Download,
    title: 'Video Downloads',
    description: 'Download your AI-generated videos in full quality to use anywhere you like.',
    perks: ['Full-resolution downloads', 'MP4 export for any platform', 'No watermark'],
  },
}

export default function SubscriptionGate({ feature = 'schedule', onUpgrade, children }) {
  const { user } = useAuthStore()
  const access = getAccessLevel(user)
  const locked =
    (feature === 'downloads' && !access.downloadsEnabled) ||
    (feature === 'analytics' && !access.analyticsEnabled)

  if (!locked) return children

  const meta = FEATURE_META[feature] || FEATURE_META.schedule
  const Icon = meta.icon

  function handleUpgradeClick() {
    if (onUpgrade) {
      onUpgrade()
    } else {
      window.dispatchEvent(new Event('sm:open-plans'))
    }
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Blurred background preview */}
      <div className="pointer-events-none select-none opacity-20 blur-sm scale-[0.98] origin-top">
        {children}
      </div>

      {/* Paywall overlay */}
      <div className="absolute inset-0 flex items-start justify-center pt-16 px-4 z-20">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d0b1f]/95 backdrop-blur-2xl shadow-[0_32px_80px_rgba(0,0,0,0.7)] p-8 text-center">
          {/* Icon */}
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500/20 via-violet-500/15 to-cyan-400/10 border border-brand-500/25 shadow-[0_12px_30px_rgba(139,92,246,0.18)]">
            <Lock className="w-7 h-7 text-brand-300" />
          </div>

          <div className="mb-1 text-[11px] font-black uppercase tracking-[0.22em] text-brand-400">
            Pro Feature
          </div>
          <h2 className="mt-2 text-xl font-bold text-white">{meta.title}</h2>
          <p className="mt-2 text-sm text-white/50 leading-relaxed">{meta.description}</p>

          {/* Perks */}
          <ul className="mt-5 space-y-2 text-left">
            {meta.perks.map((perk) => (
              <li key={perk} className="flex items-center gap-2.5 text-sm text-white/70">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500/20 text-brand-300 flex-shrink-0">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {perk}
              </li>
            ))}
          </ul>

          {/* CTA */}
          <button
            onClick={handleUpgradeClick}
            className="mt-7 w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 via-violet-500 to-cyan-500 px-6 py-3.5 text-sm font-bold text-white shadow-[0_14px_34px_rgba(139,92,246,0.35)] hover:shadow-[0_18px_42px_rgba(139,92,246,0.48)] hover:scale-[1.02] transition-all"
          >
            <Sparkles className="w-4 h-4" />
            Upgrade to Pro — Unlock Everything
          </button>
          <p className="mt-3 text-[11px] text-white/30">Cancel anytime · No hidden fees · Instant access after payment</p>
        </div>
      </div>
    </div>
  )
}
