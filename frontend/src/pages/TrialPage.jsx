import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Video, Lock, Download, Calendar, BarChart3, CheckCircle2, Play, Zap, Shield, Check, X, CreditCard, BadgeCheck, Key } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { billingApi } from '@/api/client'
import { getAccessLevel, saveSubscription, TRIAL_VIDEO_LIMIT } from '@/utils/trialAccess.js'
import PricingSection from '@/components/PricingSection'
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

const PRO_PLAN_BASE = {
  label: 'Pro Plan',
  monthly: 20,
  annual: 16,
  period: '/month',
  quota: '50 videos / month',
  note: '1 SocialMind account · AI-powered',
  currency: '$',
}

const ENT_PLAN_BASE = {
  label: 'Enterprise Plan',
  monthly: 79,
  annual: 63,
  period: '/month',
  quota: 'Unlimited videos',
  note: 'Up to 5 team members · SSO included',
  currency: '$',
}

function makePlan(base, billing) {
  const isAnnual = billing === 'annual'
  const price = isAnnual ? base.annual : base.monthly
  return {
    ...base,
    price,
    total: price,
    billing,
    savings: isAnnual ? 'Annual billing — 20% off' : null,
    note: base.note + (isAnnual ? ' · Billed annually' : ' · Billed monthly'),
  }
}

// ─── Payment Modal (copied from SettingsPage) ─────────────────────────────────

function loadPayPalOrdersSdk(clientId) {
  if (!clientId) return Promise.reject(new Error('PayPal client ID is missing.'))

  const scriptId = 'socialmind-paypal-orders-sdk'
  const source = `https://www.paypal.com/sdk/js?${new URLSearchParams({
    'client-id': clientId,
    currency: 'USD',
    intent: 'capture',
  }).toString()}`
  const existing = document.getElementById(scriptId)

  if (existing?.src === source && window.paypal) return Promise.resolve(window.paypal)
  if (existing) existing.remove()

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = scriptId
    script.src = source
    script.async = true
    script.onload = () => {
      if (window.paypal) resolve(window.paypal)
      else reject(new Error('PayPal SDK loaded without window.paypal.'))
    }
    script.onerror = () => reject(new Error('Unable to load PayPal.'))
    document.body.appendChild(script)
  })
}

function PayPalButton({ plan, onSuccess, onError }) {
  const containerRef = useRef(null)
  const buttonsRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const envClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID || ''

  useEffect(() => {
    let active = true
    const container = containerRef.current
    if (!container || !plan) return undefined

    container.innerHTML = ''
    setLoading(true)
    setMessage('')

    const amountUSD = Number(plan.price || 0).toFixed(2)

    const loadClientId = envClientId
      ? Promise.resolve(envClientId)
      : billingApi.paypalConfig().then(response => response.data?.client_id || '')

    loadClientId
      .then(clientId => loadPayPalOrdersSdk(clientId))
      .then(paypal => {
        if (!active || !containerRef.current) return

        const buttons = paypal.Buttons({
          style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'paypal', height: 45 },
          createOrder: (_data, actions) => actions.order.create({
            purchase_units: [{
              amount: { value: amountUSD, currency_code: 'USD' },
              description: plan?.label || 'SocialMind Plan',
            }],
          }),
          onApprove: async (_data, actions) => {
            const order = await actions.order.capture()
            if (order?.status === 'COMPLETED') onSuccess?.(order)
            else throw new Error('PayPal payment was not completed.')
          },
          onError: error => {
            setMessage(error?.message || 'PayPal checkout failed. Please try again.')
            onError?.(error)
          },
          onCancel: () => setMessage('PayPal checkout was cancelled.'),
        })

        buttonsRef.current = buttons
        buttons.render(containerRef.current)
      })
      .catch(error => {
        if (!active) return
        const detail = error?.message || 'PayPal is not configured yet.'
        onError?.(error)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      try {
        buttonsRef.current?.close?.()
      } catch {
        // PayPal may already have removed the iframe.
      }
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [onError, onSuccess, plan])

  return (
    <div className="space-y-3">
      {loading && <div className="h-12 rounded-xl bg-white/[0.04] animate-pulse" />}
      <div ref={containerRef} className={loading ? 'min-h-[50px] opacity-0' : 'min-h-[50px]'} />
      {message && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/[0.06] px-4 py-3 text-[11px] text-yellow-300/70 text-center">
          {message}
        </div>
      )}
    </div>
  )
}

function PaymentModal({ open, plan, onClose, onSuccess }) {
  const [step, setStep] = useState('form')
  const [payMethod, setPayMethod] = useState('card')
  const [form, setForm] = useState({ name: '', card: '', expiry: '', cvv: '', email: '' })
  const [errors, setErrors] = useState({})
  const [cardType, setCardType] = useState('')

  useEffect(() => {
    if (open) {
      setStep('form')
      setPayMethod('card')
      setForm({ name: '', card: '', expiry: '', cvv: '', email: '' })
      setErrors({})
      setCardType('')
    }
  }, [open])

  if (!open || !plan) return null

  const detectCard = (n) => {
    if (/^4/.test(n)) return 'Visa'
    if (/^5[1-5]/.test(n)) return 'Mastercard'
    if (/^3[47]/.test(n)) return 'Amex'
    return ''
  }

  const handleCardChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 16)
    const formatted = raw.replace(/(.{4})/g, '$1 ').trim()
    setForm(f => ({ ...f, card: formatted }))
    setCardType(detectCard(raw))
    setErrors(er => ({ ...er, card: '' }))
  }

  const handleExpiryChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 4)
    const formatted = raw.length >= 3 ? raw.slice(0, 2) + '/' + raw.slice(2) : raw
    setForm(f => ({ ...f, expiry: formatted }))
    setErrors(er => ({ ...er, expiry: '' }))
  }

  const validate = () => {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Cardholder name required'
    if (form.card.replace(/\s/g, '').length !== 16) errs.card = 'Enter a valid 16-digit card number'
    if (!form.expiry || form.expiry.length < 5) errs.expiry = 'Enter MM/YY'
    if (form.cvv.length < 3) errs.cvv = 'Enter 3–4 digit CVV'
    if (!form.email.includes('@')) errs.email = 'Enter a valid email'
    return errs
  }

  const handlePay = () => {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setStep('processing')
    setTimeout(() => { setStep('success'); onSuccess?.() }, 2800)
  }

  const topPerks = PLAN_BENEFITS[plan.label]?.perks?.slice(0, 4) || []
  const cur = plan.currency ?? '$'
  const totalAmount = plan.total && plan.total !== plan.price ? `${cur}${plan.total} once` : `${cur}${plan.price}/month`

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={step !== 'processing' ? onClose : undefined} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#0d0d18] shadow-[0_28px_90px_rgba(0,0,0,0.75)] overflow-hidden">

        {/* ── Processing ── */}
        {step === 'processing' && (
          <div className="p-10 flex flex-col items-center gap-5 text-center">
            <div className="w-14 h-14 rounded-full border-4 border-brand-500/20 border-t-brand-400 animate-spin" />
            <div>
              <h3 className="text-lg font-bold text-white">Processing Payment</h3>
              <p className="text-xs text-white/40 mt-1">Securely verifying your card — please wait…</p>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-white/25">
              <Shield className="w-3.5 h-3.5" /> 256-bit SSL encrypted
            </div>
          </div>
        )}

        {/* ── Success ── */}
        {step === 'success' && (
          <div className="p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center">
              <Check className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Payment Successful!</h3>
              <p className="text-sm text-white/45 mt-1">{plan.label} plan is now active on your account</p>
            </div>
            <div className="w-full rounded-xl border border-emerald-500/15 bg-emerald-500/[0.06] p-4 text-left space-y-2.5">
              <p className="text-[10px] uppercase tracking-widest text-emerald-400/60 font-semibold">Benefits Unlocked</p>
              {topPerks.map((p, i) => (
                <div key={i} className="flex items-center gap-2.5 text-xs text-white/70">
                  <span className="text-base shrink-0">{p.icon}</span>
                  <span>{p.label}</span>
                </div>
              ))}
              <p className="text-[11px] text-white/30 pt-1">+ all remaining {plan.label} plan benefits active</p>
            </div>
            <div className="w-full rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-xs text-white/40 text-center">
              Receipt sent to <span className="text-white/65 font-medium">{form.email}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-brand-500 py-3 text-sm font-bold text-white hover:bg-brand-400 transition shadow-[0_4px_16px_rgba(90,76,224,0.4)]"
            >
              Start Creating Videos →
            </button>
          </div>
        )}

        {/* ── Payment Form ── */}
        {step === 'form' && (
          <>
            <div className="px-6 pt-5 pb-4 border-b border-white/[0.07] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Secure Checkout</h3>
                <p className="text-[11px] text-white/35 mt-0.5">
                  {plan.label} subscription · {totalAmount}
                  {plan.billing === 'annual' && (
                    <span className="ml-2 rounded-full bg-emerald-500/20 border border-emerald-500/25 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300 uppercase tracking-wide">Annual −20%</span>
                  )}
                </p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/5 text-white/30 hover:text-white transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Payment method tabs */}
              <div className="flex rounded-xl border border-white/[0.08] p-1 gap-1">
                {[{ id: 'card', label: '💳 Credit Card' }, { id: 'paypal', label: '🅿 PayPal' }].map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPayMethod(m.id)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${payMethod === m.id ? 'bg-brand-500 text-white shadow' : 'text-white/40 hover:text-white/70'}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Order summary */}
              <div className="rounded-xl border border-brand-500/20 bg-brand-500/[0.07] px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-white">{plan.label}</p>
                  <p className="text-[11px] text-white/40 mt-0.5">{plan.quota} · {plan.note}</p>
                  {plan.savings && (
                    <span className="inline-block mt-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                      {plan.savings}
                    </span>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-bold text-white">{cur}{plan.total && plan.total !== plan.price ? plan.total : plan.price}</p>
                  <p className="text-[10px] text-white/35">{plan.total && plan.total !== plan.price ? 'one time' : '/month'}</p>
                </div>
              </div>

              {/* PayPal */}
              {payMethod === 'paypal' && (
                <div className="space-y-3">
                  <p className="text-[11px] text-white/40 text-center">You'll be redirected to PayPal to complete the payment securely.</p>
                  <PayPalButton
                    plan={plan}
                    onSuccess={onSuccess}
                    onError={error => console.error('PayPal error:', error)}
                  />
                </div>
              )}

              {/* Card flow */}
              {payMethod === 'card' && (<>
              {/* Cardholder name */}
              <div>
                <label className="block text-[11px] text-white/45 mb-1.5 font-medium">Cardholder Name</label>
                <input
                  className={`w-full rounded-xl border bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none transition focus:ring-1 ${errors.name ? 'border-red-500/50 focus:ring-red-500/20' : 'border-white/[0.08] focus:border-brand-500/50 focus:ring-brand-500/20'}`}
                  placeholder="Name exactly as on card"
                  value={form.name}
                  onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setErrors(er => ({ ...er, name: '' })) }}
                />
                {errors.name && <p className="mt-1 text-[10px] text-red-400">{errors.name}</p>}
              </div>

              {/* Card number */}
              <div>
                <label className="block text-[11px] text-white/45 mb-1.5 font-medium">
                  Card Number {cardType && <span className="text-brand-300 font-normal">· {cardType}</span>}
                </label>
                <div className="relative">
                  <input
                    className={`w-full rounded-xl border bg-white/[0.04] px-4 py-2.5 pr-12 text-sm text-white placeholder-white/20 outline-none font-mono tracking-widest transition focus:ring-1 ${errors.card ? 'border-red-500/50 focus:ring-red-500/20' : 'border-white/[0.08] focus:border-brand-500/50 focus:ring-brand-500/20'}`}
                    placeholder="1234  5678  9012  3456"
                    value={form.card}
                    inputMode="numeric"
                    onChange={handleCardChange}
                  />
                  <CreditCard className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                </div>
                {errors.card && <p className="mt-1 text-[10px] text-red-400">{errors.card}</p>}
              </div>

              {/* Expiry + CVV */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-white/45 mb-1.5 font-medium">Expiry Date</label>
                  <input
                    className={`w-full rounded-xl border bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none transition focus:ring-1 ${errors.expiry ? 'border-red-500/50 focus:ring-red-500/20' : 'border-white/[0.08] focus:border-brand-500/50 focus:ring-brand-500/20'}`}
                    placeholder="MM / YY"
                    value={form.expiry}
                    inputMode="numeric"
                    onChange={handleExpiryChange}
                  />
                  {errors.expiry && <p className="mt-1 text-[10px] text-red-400">{errors.expiry}</p>}
                </div>
                <div>
                  <label className="block text-[11px] text-white/45 mb-1.5 font-medium">CVV / CVC</label>
                  <input
                    className={`w-full rounded-xl border bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none transition focus:ring-1 ${errors.cvv ? 'border-red-500/50 focus:ring-red-500/20' : 'border-white/[0.08] focus:border-brand-500/50 focus:ring-brand-500/20'}`}
                    placeholder="• • •"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={form.cvv}
                    onChange={e => { setForm(f => ({ ...f, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })); setErrors(er => ({ ...er, cvv: '' })) }}
                  />
                  {errors.cvv && <p className="mt-1 text-[10px] text-red-400">{errors.cvv}</p>}
                </div>
              </div>

              {/* Billing email */}
              <div>
                <label className="block text-[11px] text-white/45 mb-1.5 font-medium">Billing Email</label>
                <input
                  className={`w-full rounded-xl border bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none transition focus:ring-1 ${errors.email ? 'border-red-500/50 focus:ring-red-500/20' : 'border-white/[0.08] focus:border-brand-500/50 focus:ring-brand-500/20'}`}
                  placeholder="you@example.com"
                  type="email"
                  value={form.email}
                  onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setErrors(er => ({ ...er, email: '' })) }}
                />
                {errors.email && <p className="mt-1 text-[10px] text-red-400">{errors.email}</p>}
              </div>

              {/* Security badges */}
              <div className="flex items-center justify-center gap-5 py-1">
                <div className="flex items-center gap-1.5 text-[10px] text-white/25">
                  <Shield className="w-3 h-3" /> SSL Encrypted
                </div>
                <div className="w-px h-3 bg-white/10" />
                <div className="flex items-center gap-1.5 text-[10px] text-white/25">
                  <BadgeCheck className="w-3 h-3" /> PCI DSS Safe
                </div>
                <div className="w-px h-3 bg-white/10" />
                <div className="flex items-center gap-1.5 text-[10px] text-white/25">
                  <Key className="w-3 h-3" /> Data Encrypted
                </div>
              </div>

              {/* Pay button */}
              <button
                type="button"
                onClick={handlePay}
                className="w-full rounded-xl bg-brand-500 py-3.5 text-sm font-bold text-white hover:bg-brand-400 transition shadow-[0_4px_20px_rgba(90,76,224,0.45)] flex items-center justify-center gap-2"
              >
                <Shield className="w-4 h-4" />
                Pay {totalAmount} Securely
              </button>

              <p className="text-center text-[10px] text-white/20">
                By subscribing you agree to our Terms of Service. Refunds within 7 days.
              </p>
              </>)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main TrialPage ───────────────────────────────────────────────────────────

export default function TrialPage() {
  const { user, updateUser } = useAuthStore()
  const navigate = useNavigate()
  const access = getAccessLevel(user)
  const [showPlans, setShowPlans] = useState(false)
  const [payingFor, setPayingFor] = useState(null)

  const handlePaymentSuccess = () => {
    if (payingFor) {
      saveSubscription(user?.id, payingFor.label)
      updateUser({
        subscription_plan: payingFor.label,
        monthly_video_quota: 50,
        effective_monthly_video_quota: 50,
        quota_remaining: Math.max(0, 50 - Number(user?.videos_generated_this_month || 0)),
      })
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
                onStartTrial={billing => setPayingFor(makePlan(PRO_PLAN_BASE, billing))}
                onContactSales={billing => setPayingFor(makePlan(ENT_PLAN_BASE, billing))}
                onViewDemo={() => setShowPlans(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Payment / Checkout Modal */}
      <PaymentModal
        open={!!payingFor}
        plan={payingFor}
        onClose={() => setPayingFor(null)}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  )
}
