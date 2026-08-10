import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Video, Lock, Download, Calendar, BarChart3, CheckCircle2, Play, Zap } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { getAccessLevel, saveSubscription, TRIAL_VIDEO_LIMIT } from '@/utils/trialAccess.js'
import PricingSection from '@/components/PricingSection'
import PayPalCheckoutModal from '@/components/PayPalCheckoutModal'
import toast from 'react-hot-toast'

// ─── Plan constants (mirrors SettingsPage) ───────────────────────────────────

const PLAN_BENEFITS = {
  'Pro Plan': {
    perks: [
      { icon: '🎬', label: '50 AI-generated videos per month' },
      { icon: '🤖', label: 'AI-powered caption generation' },
      { icon: '#️⃣', label: 'AI-powered hashtag suggestions' },
      { icon: '📅', label: 'Automated post scheduling' },
      { icon: '✨', label: 'Smart content optimization' },
      { icon: '📱', label: '1 dedicated SocialMind account' },
    ],
  },
  'Enterprise Plan': {
    perks: [
      { icon: '👥', label: 'Up to 5 team members' },
      { icon: '🔐', label: 'Single Sign-On (SSO)' },
      { icon: '📦', label: 'Bulk schedule up to 250 posts at once' },
      { icon: '🤖', label: 'AI-powered caption & hashtag generation' },
      { icon: '⚡', label: 'Priority support' },
      { icon: '📊', label: 'Advanced analytics dashboard' },
    ],
  },
}

// ─── Main TrialPage ───────────────────────────────────────────────────────────

export default function TrialPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const access = getAccessLevel(user)
  const [showPlans, setShowPlans] = useState(false)
  const [payingFor, setPayingFor] = useState(null)

  const handlePaymentSuccess = (data) => {
    if (payingFor) {
      // updateUser is already called inside PayPalCheckoutModal after backend verify
      saveSubscription(user?.id, payingFor.name)
      toast.success('🎉 Subscription active! Full access unlocked.')
    }
    setPayingFor(null)
    setShowPlans(false)
    navigate('/dashboard')
  }

  const features = [
    { icon: Video, label: 'AI Video Creation', locked: false, desc: 'Create up to 5 trial videos' },
    { icon: Download, label: 'Video Downloads', locked: true, desc: 'Subscribe to download your videos' },
    { icon: Calendar, label: 'Schedule & Auto-Publish', locked: false, desc: 'Available during your trial' },
    { icon: BarChart3, label: 'Analytics Dashboard', locked: true, desc: 'Subscribe to view analytics' },
  ]

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 animate-fade-in">
      {/* Background glows */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-[20%] top-20 h-72 w-72 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="absolute right-10 top-32 h-80 w-80 rounded-full bg-cyan-400/8 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-2xl">
        {/* Hero card */}
        <div className="rounded-3xl border border-white/[0.1] bg-gradient-to-br from-white/[0.06] to-white/[0.02] backdrop-blur-xl shadow-[0_32px_80px_rgba(0,0,0,0.4)] p-8 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 via-violet-500 to-cyan-400 flex items-center justify-center shadow-[0_8px_24px_rgba(139,92,246,0.35)]">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">SocialMind Trial</h1>
              <p className="text-sm text-white/40">Welcome, {user?.username || user?.email?.split('@')[0] || 'Creator'}</p>
            </div>
          </div>

          {/* Trial progress */}
          <div className="rounded-2xl border border-brand-500/20 bg-brand-500/[0.08] p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-white">Trial Videos</span>
              <span className="text-sm font-bold text-brand-300">
                {access.trialVideosUsed} / {TRIAL_VIDEO_LIMIT} used
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-white/10 overflow-hidden mb-3">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400 transition-all"
                style={{ width: `${(access.trialVideosUsed / TRIAL_VIDEO_LIMIT) * 100}%` }}
              />
            </div>
            {access.trialExhausted ? (
              <p className="text-xs text-amber-300">
                Trial limit reached. Subscribe to continue creating and view your video library.
              </p>
            ) : (
              <p className="text-xs text-white/45">
                {access.trialVideosRemaining} free video{access.trialVideosRemaining !== 1 ? 's' : ''} remaining in your trial.
              </p>
            )}
          </div>

          {/* Feature list */}
          <div className="space-y-3 mb-6">
            {features.map(({ icon: Icon, label, locked, desc }) => (
              <div
                key={label}
                className={`flex items-center gap-4 rounded-xl p-3.5 border transition ${
                  locked
                    ? 'border-white/[0.06] bg-white/[0.02] opacity-60'
                    : 'border-emerald-500/20 bg-emerald-500/[0.05]'
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  locked ? 'bg-white/5' : 'bg-emerald-500/15'
                }`}>
                  {locked
                    ? <Lock className="w-4 h-4 text-white/30" />
                    : <Icon className="w-4 h-4 text-emerald-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${locked ? 'text-white/40' : 'text-white'}`}>{label}</p>
                  <p className="text-xs text-white/30 mt-0.5">{desc}</p>
                </div>
                {!locked && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={() => setShowPlans(true)}
            className="w-full rounded-2xl bg-gradient-to-r from-brand-500 to-violet-500 py-4 text-sm font-bold text-white hover:from-brand-400 hover:to-violet-400 transition shadow-[0_8px_24px_rgba(90,76,224,0.4)] flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Subscribe for Full Access
          </button>
          <p className="text-center text-xs text-white/25 mt-3">
            Cancel anytime · No hidden fees · Instant access after payment
          </p>
        </div>

        {/* Trial videos shortcut — only show if not exhausted */}
        {!access.trialExhausted && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-white">Continue with trial</p>
              <p className="text-xs text-white/40 mt-0.5">
                You can still create {access.trialVideosRemaining} more video{access.trialVideosRemaining !== 1 ? 's' : ''} for free.
              </p>
            </div>
            <a
              href="/videos/new"
              className="shrink-0 flex items-center gap-2 rounded-xl border border-brand-500/40 bg-brand-500/10 px-4 py-2 text-sm font-semibold text-brand-300 hover:bg-brand-500/20 transition"
            >
              <Play className="w-4 h-4" />
              Create Video
            </a>
          </div>
        )}
      </div>

      {/* Pricing Plans Modal */}
      {showPlans && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto"
          onClick={e => { if (e.target === e.currentTarget) setShowPlans(false) }}
        >
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md pointer-events-none" />
          <div className="relative min-h-full flex items-center justify-center p-4 py-10">
            <div
              className="w-full max-w-5xl rounded-[28px] border border-white/[0.08] overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <PricingSection
                onClose={() => setShowPlans(false)}
                onSelectPlan={plan => { setPayingFor(plan); setShowPlans(false) }}
                onViewDemo={() => setShowPlans(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Payment / Checkout Modal */}
      <PayPalCheckoutModal
        open={!!payingFor}
        plan={payingFor}
        onClose={() => setPayingFor(null)}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  )
}
