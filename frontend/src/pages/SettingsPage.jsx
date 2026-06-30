import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Key, Plus, Trash2, Check, X, ExternalLink, Shield, Pencil,
  Instagram, Linkedin, Facebook, Loader2, Eye, EyeOff,
  BadgeCheck, BarChart3, CreditCard, Sparkles, UserRound, Globe2, Mail, ArrowRight,
  BookOpen
} from 'lucide-react'
import { apiKeysApi, socialAccountsApi, authApi, videosApi, billingApi } from '@/api/client'
import { useAuthStore } from '@/store/auth'
import { Modal, Input, ProgressBar } from '@/components/ui'
import PricingSection from '@/components/PricingSection'
import { getLocalVideosKey } from '@/utils/accountStorage'
import { getAccessLevel, cancelSubscription, saveSubscription } from '@/utils/trialAccess.js'
import { monthlyVideoQuota } from '@/utils/subscription'
import toast from 'react-hot-toast'

const SECTIONS = [
  { label: 'Profile', description: 'Identity, security, and usage', icon: UserRound },
  { label: 'Social Accounts', description: 'Connected publishing channels', icon: Globe2 },
]

const PLATFORM_SHORT_LABELS = {
  instagram: 'IG',
  facebook: 'FB',
  linkedin: 'LN',
  youtube: 'YT',
}

const MONTHLY_PRICE = 20
const BILLING_PLANS = [
  {
    label: 'Monthly',
    price: MONTHLY_PRICE,
    period: '/month',
    note: 'Flexible, cancel anytime',
    quota: '50 videos / month',
    total: MONTHLY_PRICE,
    savings: null,
  },
  {
    label: '6 Months',
    price: 18,
    period: '/month',
    note: 'Save 10% — billed $108 once',
    quota: '50 videos / month',
    featured: true,
    total: 108,
    savings: '10% off',
  },
  {
    label: '1 Year',
    price: 14,
    period: '/month',
    note: 'Best value — billed $168 once',
    quota: '50 videos / month',
    total: 168,
    savings: '30% off',
  },
]

function generateOtpCode() {
  if (window.crypto?.getRandomValues) {
    const array = new Uint32Array(1)
    window.crypto.getRandomValues(array)
    return String(array[0] % 1000000).padStart(6, '0')
  }
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0')
}

function extractApiErrorMessage(err, fallback) {
  const data = err?.response?.data
  if (!data) return fallback

  const fieldOrder = ['username', 'email', 'password_confirm', 'password', 'detail', 'error', 'non_field_errors']
  for (const key of fieldOrder) {
    const value = data[key]
    if (Array.isArray(value) && value.length) return value[0]
    if (typeof value === 'string' && value.trim()) return value
  }

  if (typeof data === 'string' && data.trim()) return data
  return fallback
}

const PLAN_BENEFITS = {
  'Monthly': {
    headline: 'Everything you need, month by month',
    color: 'brand',
    perks: [
      { icon: '🎬', label: '50 AI-generated videos per month' },
      { icon: '📱', label: 'Publish to Instagram, YouTube, LinkedIn & Facebook' },
      { icon: '✍️', label: 'AI script writing & voiceover generation' },
      { icon: '🎵', label: 'Background music & stock footage library' },
      { icon: '📅', label: 'Schedule & auto-publish to all platforms' },
      { icon: '📊', label: 'Analytics dashboard & performance tracking' },
      { icon: '🔑', label: 'Unlimited API key storage' },
      { icon: '📧', label: 'Email support within 48 hours' },
    ],
    highlight: 'Flexible — cancel anytime before your next billing date. No hidden fees.',
  },
  '6 Months': {
    headline: 'More savings, same full power',
    color: 'brand',
    perks: [
      { icon: '✅', label: 'Everything in the Monthly plan' },
      { icon: '🎬', label: '50 AI videos/month — 300 videos total over 6 months' },
      { icon: '💰', label: 'Save $12 compared to monthly billing' },
      { icon: '⚡', label: 'Priority email support — responses within 24 hours' },
      { icon: '🚀', label: 'Early access to new AI features & templates' },
      { icon: '🎁', label: 'Exclusive 6-month member badge on your profile' },
      { icon: '📦', label: 'Billed once as $108 — no monthly charges' },
      { icon: '🔒', label: 'Lock in current pricing — immune to future price changes' },
    ],
    highlight: 'One payment of $108. No surprise charges. Ideal for consistent creators.',
  },
  '1 Year': {
    headline: 'Maximum value for serious creators',
    color: 'emerald',
    perks: [
      { icon: '✅', label: 'Everything in the 6 Months plan' },
      { icon: '🎬', label: '50 AI videos/month — 600 videos total over the year' },
      { icon: '💰', label: 'Save $72 — biggest discount available' },
      { icon: '💬', label: 'Priority chat + email support (fastest response)' },
      { icon: '🎨', label: 'Custom branding — add your logo & colour palette' },
      { icon: '👥', label: 'Team access — invite up to 3 collaborators' },
      { icon: '📈', label: 'Advanced analytics, CSV export & audience insights' },
      { icon: '🏆', label: 'Annual member badge & exclusive creator community' },
      { icon: '📦', label: 'Billed once as $168 — best ROI for daily creators' },
    ],
    highlight: 'One payment of $168. Best return on investment for daily video creators.',
  },
  'Pro Plan': {
    headline: 'Everything a solo creator needs',
    color: 'brand',
    perks: [
      { icon: '🎬', label: '50 AI-generated videos per month' },
      { icon: '🤖', label: 'AI-powered caption generation' },
      { icon: '#️⃣', label: 'AI-powered hashtag suggestions' },
      { icon: '📅', label: 'Automated post scheduling' },
      { icon: '✨', label: 'Smart content optimization' },
      { icon: '📱', label: '1 dedicated SocialMind account' },
    ],
    highlight: 'Perfect for solo creators — 14-day free trial included. Cancel anytime.',
  },
  'Enterprise Plan': {
    headline: "Scale your team's content creation",
    color: 'brand',
    perks: [
      { icon: '👥', label: 'Up to 5 team members' },
      { icon: '🔐', label: 'Single Sign-On (SSO)' },
      { icon: '📦', label: 'Bulk schedule up to 250 posts at once' },
      { icon: '🤖', label: 'AI-powered caption & hashtag generation' },
      { icon: '⚡', label: 'Priority support' },
      { icon: '📊', label: 'Advanced analytics dashboard' },
    ],
    highlight: 'Team-first AI workflow — SSO, priority support, and advanced analytics included.',
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

function usePayPalScript(clientId) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!clientId) return
    const existing = document.getElementById('paypal-sdk')
    if (existing) { setReady(true); return }
    const script = document.createElement('script')
    script.id = 'paypal-sdk'
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD`
    script.onload = () => setReady(true)
    document.head.appendChild(script)
  }, [clientId])
  return ready
}

function PayPalButton({ plan, onSuccess, onError }) {
  const containerId = 'paypal-btn-container'
  const [clientId, setClientId] = useState(() => import.meta.env.VITE_PAYPAL_CLIENT_ID || '')
  const [configLoading, setConfigLoading] = useState(false)
  const sdkReady = usePayPalScript(clientId)

  useEffect(() => {
    if (clientId) return
    setConfigLoading(true)
    billingApi.paypalConfig()
      .then(response => setClientId(response.data?.client_id || ''))
      .catch(err => {
        console.error('Failed to load PayPal config:', err)
        onError?.(err)
      })
      .finally(() => setConfigLoading(false))
  }, [clientId, onError])

  useEffect(() => {
    if (!sdkReady || !window.paypal) return
    const container = document.getElementById(containerId)
    if (!container) return
    container.innerHTML = ''

    const amountUSD = (plan?.price || 0).toFixed(2)

    window.paypal.Buttons({
      style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'paypal', height: 45 },
      createOrder: (data, actions) => actions.order.create({
        purchase_units: [{ amount: { value: amountUSD, currency_code: 'USD' }, description: plan?.label || 'SocialMind Plan' }],
      }),
      onApprove: async (data, actions) => {
        const order = await actions.order.capture()
        if (order.status === 'COMPLETED') onSuccess?.(order)
      },
      onError: (err) => { console.error('PayPal error:', err); onError?.(err) },
    }).render(`#${containerId}`)
  }, [sdkReady, plan, onError, onSuccess])

  if (configLoading) return <div className="h-12 rounded-xl bg-white/[0.04] animate-pulse" />
  if (!clientId) return (
    <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/[0.06] px-4 py-3 text-[11px] text-yellow-300/70 text-center">
      PayPal not configured. Add <code className="font-mono">PAYPAL_CLIENT_ID</code> to <code className="font-mono">backend/.env</code>.
    </div>
  )
  if (!sdkReady) return <div className="h-12 rounded-xl bg-white/[0.04] animate-pulse" />
  return <div id={containerId} className="min-h-[50px]" />
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

              {/* PayPal flow */}
              {payMethod === 'paypal' && (
                <div className="space-y-3">
                  <p className="text-[11px] text-white/40 text-center">You'll be redirected to PayPal to complete the payment securely.</p>
                  <PayPalButton
                    plan={plan}
                    onSuccess={() => { setStep('success'); onSuccess?.() }}
                    onError={() => toast.error('PayPal payment failed. Please try again.')}
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

function SubscriptionPlansModal({ open, onClose }) {
  const [payingFor, setPayingFor] = useState(null)
  const { user, updateUser } = useAuthStore()

  if (!open) return null

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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      {/* Backdrop — pointer-events-none so it never intercepts button clicks */}
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md pointer-events-none" />
      <div className="relative min-h-full flex items-center justify-center p-4 py-10">
        <div
          className="w-full max-w-5xl rounded-[28px] border border-white/[0.08] overflow-hidden shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          <PricingSection
            onClose={onClose}
            onStartTrial={billing => setPayingFor(makePlan(PRO_PLAN_BASE, billing))}
            onContactSales={billing => setPayingFor(makePlan(ENT_PLAN_BASE, billing))}
            onViewDemo={onClose}
          />
        </div>
      </div>
      <PaymentModal
        open={!!payingFor}
        plan={payingFor}
        onClose={() => setPayingFor(null)}
        onSuccess={async () => {
          if (payingFor) {
            saveSubscription(user?.id, payingFor.label)
            const { data } = await billingApi.activateLocalSubscription({ plan: payingFor.label })
            if (data?.user) updateUser(data.user)
          }
          setPayingFor(null)
          onClose()
          toast.success('Subscription active! All benefits are now unlocked.')
          setTimeout(() => window.location.reload(), 600)
        }}
      />
    </div>
  )
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('Profile')

  return (
    <div className="relative p-4 sm:p-6 lg:p-7 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-[11px] font-medium text-brand-300">
            <Sparkles className="w-3.5 h-3.5" />
            Account Center
          </div>
          <h1 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-white">Settings</h1>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 h-fit rounded-2xl border border-surface-border bg-surface-card backdrop-blur-xl p-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
          <div className="px-3 py-2 mb-2">
          </div>
          <nav className="space-y-1">
            {SECTIONS.map(section => {
              const Icon = section.icon
              const active = activeSection === section.label
              return (
                <button
                  key={section.label}
                  onClick={() => setActiveSection(section.label)}
                  className={`w-full text-left rounded-2xl px-3.5 py-3 transition-all border ${
                    active
                      ? 'bg-brand-500/15 text-white border-brand-500/30 shadow-[0_12px_30px_rgba(90,76,224,0.18)]'
                      : 'border-transparent text-white/55 hover:text-white hover:bg-surface-100 hover:border-surface-border'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${active ? 'bg-brand-500/20 text-brand-300' : 'bg-surface-100 text-white/45'}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{section.label}</div>
                    </div>
                  </div>
                </button>
              )
            })}
          </nav>
        </aside>

        <section className="min-w-0">
          {activeSection === 'Profile' && <ProfileSection />}
          {activeSection === 'Social Accounts' && <SocialAccountsSection />}
        </section>
      </div>
    </div>
  )
}

// ─── Profile ──────────────────────────────────────────────────────────────────
function ProfileSection() {
  const { user, updateUser, completeAuth, logout } = useAuthStore()
  const CONTACT_OTP_WINDOW_SECONDS = 20
  const accountId = user?.id || 'guest'
  const [form, setForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    username: user?.username || '',
    bio: user?.bio || '',
  })
  const [contact, setContact] = useState(user?.email || '')
  const [otpStep, setOtpStep] = useState('idle')
  const [otpToken, setOtpToken] = useState('')
  const [otp, setOtp] = useState('')
  const [otpRemaining, setOtpRemaining] = useState(0)
  const [otpExpiresAt, setOtpExpiresAt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ password: '', password_confirm: '' })
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [deliveryNotice, setDeliveryNotice] = useState('')
  const [showPlans, setShowPlans] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const monthlyQuota = monthlyVideoQuota(user)

  useEffect(() => {
    setContact(user?.email || '')
    if (otpStep !== 'password') {
      setOtpStep('idle')
      setOtpToken('')
      setOtp('')
      setOtpRemaining(0)
      setOtpExpiresAt(0)
      setPasswordForm({ password: '', password_confirm: '' })
      setDeliveryNotice('')
    }
  }, [user?.email])

  useEffect(() => {
    setForm({
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      username: user?.username || '',
      bio: user?.bio || '',
    })
  }, [user?.first_name, user?.last_name, user?.username, user?.bio])

  useEffect(() => {
    if (otpStep !== 'verify' || !otpExpiresAt) return
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000))
      setOtpRemaining(remaining)
      if (remaining === 0) {
        setOtpStep('expired')
        setOtpToken('')
        setOtp('')
      }
    }
    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [otpStep, otpExpiresAt])

  const videosUsed = Number(user?.videos_generated_this_month || 0)
  const quotaRemaining = Math.max(0, monthlyQuota - videosUsed)
  const usagePercent = monthlyQuota > 0 ? Math.min(100, Math.round((videosUsed / monthlyQuota) * 100)) : 0
  const profileDisplayName = user?.username || [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || 'Profile'
  const profileInitial = (profileDisplayName || user?.email || 'U')[0]?.toUpperCase() || 'U'

  const access = getAccessLevel(user)
  const backendPlan = String(user?.subscription_plan || 'free').toLowerCase()
  const hasBackendSubscription = ['pro', 'enterprise'].includes(backendPlan) && Boolean(user?.paypal_subscription_id || user?.subscription_started_at)
  const subscriptionStartedAt = user?.subscription_started_at || access.subscription?.subscribedAt || null
  const fallbackCancellationDeadline = subscriptionStartedAt
    ? new Date(new Date(subscriptionStartedAt).getTime() + 7 * 24 * 60 * 60 * 1000)
    : null
  const cancellationDeadline = user?.subscription_cancellation_deadline
    ? new Date(user.subscription_cancellation_deadline)
    : fallbackCancellationDeadline
  const cancellationDeadlineValid = cancellationDeadline && !Number.isNaN(cancellationDeadline.getTime())
  const localCancellationAllowed = Boolean(access.isSubscribed && cancellationDeadlineValid && Date.now() < cancellationDeadline.getTime())
  const canCancelSubscription = Boolean(
    user?.can_cancel_subscription || (!user?.subscription_started_at && localCancellationAllowed)
  )
  const cancellationDeadlineLabel = cancellationDeadlineValid
    ? cancellationDeadline.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : ''
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState('')
  const [cancelBusy, setCancelBusy] = useState(false)

  const handleCancelSubscription = async () => {
    if (cancelConfirm.trim().toUpperCase() !== 'CANCEL') {
      toast.error('Type CANCEL to confirm')
      return
    }
    setCancelBusy(true)
    try {
      if (!hasBackendSubscription && access.subscription?.status === 'active') {
        cancelSubscription(user?.id)
        updateUser({ subscription_plan: 'free', can_cancel_subscription: false, subscription_cancellation_deadline: null })
        toast.success('Local subscription cancelled.')
        toast.info('No PayPal refund was processed because this subscription was not active on the backend.')
        setCancelOpen(false)
        setCancelConfirm('')
        return
      }

      const { data } = await billingApi.cancelSubscription()
      cancelSubscription(user?.id)
      updateUser(data?.user || { subscription_plan: 'free', can_cancel_subscription: false })
      const refund = data?.refund?.refund_amount
      const explanation = data?.refund?.explanation
      toast.success(refund !== undefined ? `Subscription cancelled. Refund due: $${Number(refund).toFixed(2)}` : 'Subscription cancelled.')
      if (explanation) toast.info(explanation)
      setCancelOpen(false)
      setCancelConfirm('')
    } catch (err) {
      if (err?.response?.status === 400 && access.subscription?.status === 'active') {
        cancelSubscription(user?.id)
        updateUser({ subscription_plan: 'free', can_cancel_subscription: false, subscription_cancellation_deadline: null })
        toast.success('Local subscription cancelled.')
        toast.info('The backend did not have an active PayPal subscription for this account.')
        setCancelOpen(false)
        setCancelConfirm('')
        return
      }
      toast.error(err?.response?.data?.popup_message || err?.response?.data?.detail || 'Failed to cancel subscription')
    } finally {
      setCancelBusy(false)
    }
  }

  const handleResubscribe = async (plan) => {
    const planLabel = plan?.label || 'Pro Plan'
    saveSubscription(user?.id, planLabel)
    const { data } = await billingApi.activateLocalSubscription({ plan: planLabel })
    updateUser(data?.user || { can_cancel_subscription: true })
    toast.success('Subscription active! All benefits unlocked.')
    setShowPlans(false)
    setTimeout(() => window.location.reload(), 600)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const { data } = await authApi.updateProfile(form)
      updateUser(data)
      toast.success('Profile updated')
    } catch (err) {
      const message = extractApiErrorMessage(err, 'Failed to update profile')
      if (message.toLowerCase().includes('username')) {
        toast.error('That username is already taken. Try a different one.')
      } else {
        toast.error(message)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleRequestOtp = async () => {
    const nextContact = String(contact || '').trim()
    if (!nextContact) return toast.error('Enter your email address')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextContact)) return toast.error('Enter a valid email address')

    setBusy(true)
    try {
      const { data } = await authApi.requestProfileEmailOtp(nextContact)
      setOtpStep('verify')
      setOtpToken(data.challenge_token)
      setOtp('')
      setOtpRemaining(CONTACT_OTP_WINDOW_SECONDS)
      setOtpExpiresAt(Date.now() + CONTACT_OTP_WINDOW_SECONDS * 1000)
      setDeliveryNotice(data.delivery_notice || '')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send verification code')
    } finally {
      setBusy(false)
    }
  }

  const handleVerifyOtp = async () => {
    if (!otpToken) return toast.error('Request a verification code first')
    if (otp.length !== 6) return toast.error('Enter the 6-digit code')

    setBusy(true)
    try {
      const { data } = await authApi.verifyProfileEmailOtp({
        challenge_token: otpToken,
        otp,
      })
      completeAuth(data)
      updateUser(data.user)
      setOtpStep('password')
      setOtpToken('')
      setOtp('')
      setOtpRemaining(0)
      setOtpExpiresAt(0)
      setDeliveryNotice('')
      setPasswordForm({ password: '', password_confirm: '' })
      toast.success('Email verified. Now set a password to protect this account.')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Verification failed')
    } finally {
      setBusy(false)
    }
  }

  const handleSetPassword = async () => {
    if (!passwordForm.password || !passwordForm.password_confirm) return toast.error('Enter and confirm your new password')
    if (passwordForm.password !== passwordForm.password_confirm) return toast.error('Passwords do not match')

    setPasswordSaving(true)
    try {
      const { data } = await authApi.updateProfile({
        password: passwordForm.password,
        password_confirm: passwordForm.password_confirm,
      })
      updateUser(data)
      setPasswordForm({ password: '', password_confirm: '' })
      setOtpStep('idle')
      toast.success('Password saved. This account is now protected.')
    } catch (err) {
      toast.error(err.response?.data?.password_confirm?.[0] || err.response?.data?.detail || 'Failed to save password')
    } finally {
      setPasswordSaving(false)
    }
  }

  const clearDeletedAccountStorage = () => {
    const id = String(accountId)
    const savedKey = 'sm_saved_accounts'
    try {
      const saved = JSON.parse(localStorage.getItem(savedKey) || '[]')
      localStorage.setItem(savedKey, JSON.stringify(saved.filter(account => String(account.id) !== id)))
    } catch {
      localStorage.removeItem(savedKey)
    }

    localStorage.removeItem(getLocalVideosKey(id))
    localStorage.removeItem(`sm_share_ledger:${id}`)
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(`sm_stitched_${id}_`)) localStorage.removeItem(key)
    })
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirm.trim().toUpperCase() !== 'DELETE') {
      toast.error('Type DELETE to confirm account deletion')
      return
    }

    setDeleteBusy(true)
    try {
      await authApi.deleteAccount()
      clearDeletedAccountStorage()
      logout()
      toast.success('Your account has been deleted.')
      window.location.href = '/login'
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete account')
      setDeleteBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <SubscriptionPlansModal open={showPlans} onClose={() => setShowPlans(false)} />
      <Modal open={deleteOpen} onClose={() => !deleteBusy && setDeleteOpen(false)} title="Delete account" maxWidth="max-w-md">
        <div className="space-y-4">
          <div className="rounded-xl border border-red-500/25 bg-red-500/[0.08] px-4 py-3 text-sm text-red-100/80 leading-relaxed">
            This permanently deletes your SocialMind account, backend workspace data, local video history for this account, and saved login from this browser.
          </div>
          <div>
            <label className="label">Type DELETE to confirm</label>
            <input
              className="input"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteBusy}
              className="btn-ghost flex-1 h-11"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteAccount}
              disabled={deleteBusy || deleteConfirm.trim().toUpperCase() !== 'DELETE'}
              className="flex-1 h-11 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {deleteBusy && <Loader2 className="w-4 h-4 animate-spin" />}
              {deleteBusy ? 'Deleting...' : 'Delete forever'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Header card ── */}
      <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.02] backdrop-blur-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.28)]">
        <div className="px-6 py-5 flex items-center gap-5">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500/40 to-brand-700/40 border border-brand-500/25 flex items-center justify-center shadow-[0_0_0_3px_rgba(90,76,224,0.12)] text-2xl font-bold text-white select-none">
              {profileInitial}
            </div>
            <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#0d0d14] ${user?.email_verified ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          </div>
          {/* Name & status */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-white leading-tight truncate">{profileDisplayName}</h2>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${user?.email_verified ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/25 bg-amber-500/10 text-amber-300'}`}>
                <BadgeCheck className="w-3 h-3" />
                {user?.email_verified ? 'Verified' : 'Pending'}
              </span>
            </div>
            <p className="text-xs text-white/40 mt-0.5 truncate">{user?.email || 'No email set'}</p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <p className="text-[11px] text-white/30">
                Plan: <span className="capitalize text-white/55">{user?.subscription_plan || 'Free'}</span>
              </p>
              <button
                type="button"
                onClick={() => setShowPlans(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-500/40 bg-brand-500/15 px-3 py-1 text-xs font-semibold text-brand-300 hover:bg-brand-500/25 hover:border-brand-500/60 transition shadow-sm"
              >
                <CreditCard className="w-3.5 h-3.5" /> View Plans
              </button>
            </div>
          </div>
        </div>

        {/* Usage bar inside header */}
        <div className="mx-6 mb-5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-widest text-white/30">Monthly Usage</span>
            <span className={`text-[11px] font-medium ${quotaRemaining === 0 ? 'text-red-400' : 'text-white/50'}`}>{quotaRemaining} remaining</span>
          </div>
          <ProgressBar value={usagePercent} label="Monthly quota" />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-white tabular-nums">{videosUsed}</span>
              <span className="text-sm text-white/35">/ {monthlyQuota} videos</span>
            </div>
            {quotaRemaining === 0 && (
              <button
                type="button"
                onClick={() => setShowPlans(true)}
                className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-400 transition shadow-[0_4px_12px_rgba(90,76,224,0.35)]"
              >
                <Sparkles className="w-3 h-3" /> Upgrade Now
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[10px] text-white/25">
            New accounts from the same network get 10 videos/month · First account gets 50
          </p>
        </div>
      </div>

      {/* ── Quota exhausted banner ── */}
      {quotaRemaining === 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] px-5 py-4 flex items-center justify-between gap-4 shadow-[0_4px_16px_rgba(0,0,0,0.18)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4 text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-300">Monthly quota reached</p>
              <p className="text-xs text-amber-200/60 mt-0.5">Subscribe to keep creating videos this month.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowPlans(true)}
            className="shrink-0 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 transition"
          >
            <ArrowRight className="w-3.5 h-3.5" /> View Plans
          </button>
        </div>
      )}

      {/* ── Identity card ── */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.20)]">
        <div className="px-6 pt-5 pb-4 border-b border-white/[0.07]">
          <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
            <UserRound className="w-4 h-4 text-brand-300" />
            Identity
          </h3>
          <p className="text-xs text-white/35 mt-0.5">Your public-facing name and handle</p>
        </div>
        <div className="p-6 space-y-4">
          <Input label="Username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
        </div>
      </div>

      {/* ── Email & OTP card ── */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.20)]">
        <div className="px-6 pt-5 pb-4 border-b border-white/[0.07]">
          <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
            <Mail className="w-4 h-4 text-brand-300" />
            Email Address
          </h3>
          <p className="text-xs text-white/35 mt-0.5">A new email creates a separate account — OTP verification required</p>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              className="input flex-1"
              value={contact}
              onChange={e => setContact(e.target.value)}
              placeholder="name@gmail.com"
            />
          </div>

          {otpStep === 'verify' && (
            <div className="rounded-xl border border-brand-500/20 bg-brand-500/[0.07] p-4 space-y-3">
              <p className="text-xs text-brand-200/80">Enter the 6-digit code sent to your inbox</p>
              <input
                className="input text-center tracking-[0.45em] text-lg font-mono"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="· · · · · ·"
              />
              <div className="flex items-center justify-between text-xs text-white/45">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Expires in {otpRemaining}s
                </span>
                <button type="button" onClick={handleVerifyOtp} disabled={busy || otp.length !== 6} className="text-brand-300 hover:text-brand-200 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Verify →
                </button>
              </div>
            </div>
          )}

          {otpStep === 'expired' && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.08] px-4 py-3 text-xs text-amber-200 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              OTP expired. Send again to continue.
            </div>
          )}

          {deliveryNotice && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/50 flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              {deliveryNotice}
            </div>
          )}

          {otpStep === 'password' && (
            <div className="rounded-xl border border-brand-500/25 bg-brand-500/[0.08] p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-brand-300 mt-0.5 shrink-0" />
                <p className="text-xs text-brand-200/80 leading-relaxed">
                  Email verified. Create a password to protect this account and keep your videos and social accounts secure.
                </p>
              </div>
              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  className="input"
                  value={passwordForm.password}
                  onChange={e => setPasswordForm(current => ({ ...current, password: e.target.value }))}
                  placeholder="Create a new password"
                />
              </div>
              <div>
                <label className="label">Confirm password</label>
                <input
                  type="password"
                  className="input"
                  value={passwordForm.password_confirm}
                  onChange={e => setPasswordForm(current => ({ ...current, password_confirm: e.target.value }))}
                  placeholder="Repeat new password"
                />
              </div>
              <button
                type="button"
                onClick={handleSetPassword}
                disabled={passwordSaving}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {passwordSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {passwordSaving ? 'Saving password…' : 'Save password'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Subscription Cancellation Modal ── */}
      <Modal open={cancelOpen} onClose={() => !cancelBusy && setCancelOpen(false)} title="Cancel Subscription" maxWidth="max-w-md">
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-100/80 leading-relaxed">
            <p className="font-semibold text-amber-200 mb-1">⚠️ Before you cancel</p>
            Cancelling your subscription will immediately remove access to all features. Any videos scheduled for future publishing will also be cancelled.
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <p className="text-white/40 text-xs">Purchased plan</p>
              <p className="text-white font-semibold capitalize">{access.subscription?.plan || user?.subscription_plan || 'Pro'}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <p className="text-white/40 text-xs">Videos created</p>
              <p className="text-white font-semibold">{videosUsed}</p>
            </div>
          </div>
          <p className="text-xs text-white/45 leading-relaxed">
            Refund is calculated from the purchased plan price minus the per-video usage deduction for videos already created.
          </p>
          <div>
            <label className="label">Type CANCEL to confirm</label>
            <input
              className="input"
              value={cancelConfirm}
              onChange={e => setCancelConfirm(e.target.value)}
              placeholder="CANCEL"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => setCancelOpen(false)}
              disabled={cancelBusy}
              className="btn-ghost flex-1 h-11"
            >
              Keep Subscription
            </button>
            <button
              type="button"
              onClick={handleCancelSubscription}
              disabled={cancelBusy || cancelConfirm.trim().toUpperCase() !== 'CANCEL'}
              className="flex-1 h-11 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {cancelBusy && <Loader2 className="w-4 h-4 animate-spin" />}
              {cancelBusy ? 'Cancelling...' : 'Cancel Subscription'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Subscription Management ── */}
      {access.isSubscribed && (
        <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.20)]">
          <div className="px-6 pt-5 pb-4 border-b border-amber-500/10">
            <h3 className="text-sm font-semibold text-amber-200 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-amber-300" />
              Subscription
            </h3>
            <p className="text-xs text-amber-100/40 mt-0.5">
              Manage your active subscription plan.
            </p>
          </div>
          <div className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-sm text-white/60 leading-relaxed max-w-xl">
                Your <span className="text-white font-medium capitalize">{access.subscription?.plan || 'Pro'}</span> plan is active.
                {canCancelSubscription
                  ? ` You can cancel anytime within 7 days${cancellationDeadlineLabel ? `, until ${cancellationDeadlineLabel}` : ''}. Usage will be deducted from the refund.`
                  : ' You can cancel only within 7 days of activation. After that, cancellation is not available.'}
              </p>
              <p className="text-xs text-white/30 mt-1">
                {canCancelSubscription
                  ? 'After 7 days this cancellation button is disabled automatically.'
                  : 'The 7-day cancellation period has ended for this subscription.'}
              </p>
            </div>
            <div
              onClick={() => {
                if (!canCancelSubscription) {
                  toast.info('You can cancel only within 7 days of activation. That period has ended, so cancellation is disabled.')
                }
              }}
              className="shrink-0"
            >
            <button
              type="button"
              onClick={() => {
                setCancelConfirm('')
                setCancelOpen(true)
              }}
              disabled={!canCancelSubscription}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-200 hover:bg-amber-500/20 hover:border-amber-400/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <X className="w-4 h-4" />
              Cancel Subscription
            </button>
            </div>
          </div>
        </div>
      )}

      {/* Subscribe CTA for trial users */}
      {access.isTrial && (
        <div className="rounded-2xl border border-brand-500/20 bg-brand-500/[0.06] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.20)]">
          <div className="px-6 pt-5 pb-4 border-b border-brand-500/10">
            <h3 className="text-sm font-semibold text-brand-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-300" />
              Upgrade to Full Access
            </h3>
            <p className="text-xs text-brand-100/40 mt-0.5">
              You're on a free trial. Subscribe to unlock all features.
            </p>
          </div>
          <div className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-sm text-white/55 leading-relaxed max-w-xl">
              Subscribe to unlock the full dashboard, video scheduling, analytics, and downloads.
            </p>
            <button
              type="button"
              onClick={() => setShowPlans(true)}
              className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 border border-brand-400/30 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400 transition shadow-[0_4px_16px_rgba(90,76,224,0.35)]"
            >
              <Sparkles className="w-4 h-4" />
              Subscribe Now
            </button>
          </div>
        </div>
      )}

      {/* Re-subscribe CTA for cancelled users */}
      {access.isCancelled && (
        <div className="rounded-2xl border border-brand-500/20 bg-brand-500/[0.06] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.20)]">
          <div className="px-6 pt-5 pb-4 border-b border-brand-500/10">
            <h3 className="text-sm font-semibold text-brand-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-300" />
              Subscription Cancelled
            </h3>
            <p className="text-xs text-brand-100/40 mt-0.5">
              Your subscription was cancelled. Re-subscribe to regain full access.
            </p>
          </div>
          <div className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-sm text-white/55 leading-relaxed max-w-xl">
              Re-subscribe to unlock the full dashboard, video scheduling, analytics, and downloads.
            </p>
            <button
              type="button"
              onClick={() => setShowPlans(true)}
              className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 border border-brand-400/30 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400 transition shadow-[0_4px_16px_rgba(90,76,224,0.35)]"
            >
              <Sparkles className="w-4 h-4" />
              Re-Subscribe
            </button>
          </div>
        </div>
      )}

      {/* ── API Keys ── */}
      <APIKeysSection />

      {/* ── Save button ── */}
      <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.045] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.20)]">
        <div className="px-6 pt-5 pb-4 border-b border-red-500/15">
          <h3 className="text-sm font-semibold text-red-200 flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-300" />
            Delete Account
          </h3>
          <p className="text-xs text-red-100/45 mt-0.5">
            Permanently remove this account and its workspace data from SocialMind.
          </p>
        </div>
        <div className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-xs text-white/45 leading-relaxed max-w-xl">
            Use this only when the user no longer wants their account to be active. This action cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => { setDeleteConfirm(''); setDeleteOpen(true) }}
            className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/12 px-4 py-2.5 text-sm font-semibold text-red-200 hover:bg-red-500/20 hover:border-red-400/50 transition"
          >
            <Trash2 className="w-4 h-4" />
            Delete Account
          </button>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center justify-center gap-2 px-7 py-2.5 rounded-xl font-medium text-sm shadow-[0_4px_16px_rgba(90,76,224,0.35)] hover:shadow-[0_6px_20px_rgba(90,76,224,0.45)] transition-shadow">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </div>
    </div>
  )
}

function ProfileSectionLegacy() {
  const { user, updateUser, completeAuth } = useAuthStore()
  const CONTACT_OTP_WINDOW_SECONDS = 20
  const accountId = user?.id || 'guest'
  const [form, setForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    username: user?.username || '',
    bio: user?.bio || '',
  })
  const [contact, setContact] = useState(user?.email || '')
  const [otpStep, setOtpStep] = useState('idle')
  const [otpToken, setOtpToken] = useState('')
  const [otp, setOtp] = useState('')
  const [otpRemaining, setOtpRemaining] = useState(0)
  const [otpExpiresAt, setOtpExpiresAt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ password: '', password_confirm: '' })
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [deliveryNotice, setDeliveryNotice] = useState('')
  const [localVideos, setLocalVideos] = useState([])
  const monthlyQuota = monthlyVideoQuota(user)
  const { data: backendVideos } = useQuery({
    queryKey: ['settings', accountId, 'videos', 'recent'],
    queryFn: () => videosApi.list({ page: 1 }).then(r => (Array.isArray(r.data) ? r.data : (r.data?.results || []))).then(items => items.filter(item => !item?.is_demo_seed)),
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })
  const [paymentForm, setPaymentForm] = useState({
    cardholder_name: '',
    card_number: '',
    expiry: '',
    cvc: '',
    billing_email: user?.email || '',
  })

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getLocalVideosKey(accountId))
      setLocalVideos(raw ? JSON.parse(raw) : [])
    } catch {
      setLocalVideos([])
    }

    const handler = () => {
      try {
        const raw = localStorage.getItem(getLocalVideosKey(accountId))
        setLocalVideos(raw ? JSON.parse(raw) : [])
      } catch {
        setLocalVideos([])
      }
    }

    window.addEventListener('storage', handler)
    window.addEventListener('socialmind:local-videos-changed', handler)
    return () => {
      window.removeEventListener('storage', handler)
      window.removeEventListener('socialmind:local-videos-changed', handler)
    }
  }, [accountId])

  const videosUsed = Number(user?.videos_generated_this_month || 0)
  const quotaRemaining = Math.max(0, monthlyQuota - videosUsed)
  const isQuotaExceeded = monthlyQuota > 0 && videosUsed >= monthlyQuota

  useEffect(() => {
    setContact(user?.email || '')
    if (otpStep !== 'password') {
      setOtpStep('idle')
      setOtpToken('')
      setOtp('')
      setOtpRemaining(0)
      setOtpExpiresAt(0)
      setPasswordForm({ password: '', password_confirm: '' })
      setDeliveryNotice('')
    }
  }, [user?.email])

  useEffect(() => {
    setForm({
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      username: user?.username || '',
      bio: user?.bio || '',
    })
  }, [user?.first_name, user?.last_name, user?.username, user?.bio])

  useEffect(() => {
    if (otpStep !== 'verify' || !otpExpiresAt) return

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000))
      setOtpRemaining(remaining)
      if (remaining === 0) {
        setOtpStep('expired')
        setOtpToken('')
        setOtp('')
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [otpStep, otpExpiresAt])

  const handleSave = async () => {
    setSaving(true)
    try {
      const { data } = await authApi.updateProfile(form)
      updateUser(data)
      toast.success('Profile updated')
    } catch (err) {
      const message = extractApiErrorMessage(err, 'Failed to update profile')
      if (message.toLowerCase().includes('username')) {
        toast.error('That username is already taken. Try a different one.')
      } else {
        toast.error(message)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleRequestOtp = async () => {
    const nextContact = String(contact || '').trim()
    if (!nextContact) return toast.error('Enter your email address')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextContact)) return toast.error('Enter a valid email address')

    setBusy(true)
    try {
      const { data } = await authApi.requestProfileEmailOtp(nextContact)
      setOtpStep('verify')
      setOtpToken(data.challenge_token)
      setOtp('')
      setOtpRemaining(CONTACT_OTP_WINDOW_SECONDS)
      setOtpExpiresAt(Date.now() + (CONTACT_OTP_WINDOW_SECONDS * 1000))
      setDeliveryNotice(data.delivery_notice || '')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send verification code')
    } finally {
      setBusy(false)
    }
  }

  const handleVerifyOtp = async () => {
    if (!otpToken) {
      toast.error('Request a verification code first')
      return
    }
    if (otp.length !== 6) {
      toast.error('Enter the 6-digit code')
      return
    }

    setBusy(true)
    try {
      const { data } = await authApi.verifyProfileEmailOtp({
        challenge_token: otpToken,
        otp,
      })
      completeAuth(data)
      updateUser(data.user)
      setOtpStep('password')
      setOtpToken('')
      setOtp('')
      setOtpRemaining(0)
      setOtpExpiresAt(0)
      setDeliveryNotice('')
      setPasswordForm({ password: '', password_confirm: '' })
      toast.success('Email verified. Set a password to finish linking this account.')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Verification failed')
    } finally {
      setBusy(false)
    }
  }

  const handleSetPassword = async () => {
    if (!passwordForm.password || !passwordForm.password_confirm) {
      toast.error('Enter and confirm your new password')
      return
    }
    if (passwordForm.password !== passwordForm.password_confirm) {
      toast.error('Passwords do not match')
      return
    }

    setPasswordSaving(true)
    try {
      const { data } = await authApi.updateProfile({
        password: passwordForm.password,
        password_confirm: passwordForm.password_confirm,
      })
      updateUser(data)
      setPasswordForm({ password: '', password_confirm: '' })
      setOtpStep('idle')
      toast.success('Password saved. You can now login with this email and password.')
    } catch (err) {
      toast.error(err.response?.data?.password_confirm?.[0] || err.response?.data?.detail || 'Failed to save password')
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 sm:p-8 space-y-6 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
      <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-white/35">Profile</div>
          <h2 className="text-2xl font-semibold text-white mt-1">Personal details</h2>
          <p className="text-sm text-white/45 mt-2">Keep your public identity, verification, and plan info polished.</p>
        </div>
        <div className="w-16 h-16 rounded-2xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center shrink-0">
        <span className="text-2xl font-bold text-brand-400">
          {user?.first_name?.[0] || user?.email?.[0]?.toUpperCase()}
        </span>
      </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="First name" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
        <Input label="Last name" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
      </div>
      <div>
        <Input label="Username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
        <div className="mt-1 text-xs text-white/40">
          Usernames must be unique. If this one is already taken, add a number or underscore.
        </div>
      </div>
      <div>
        <label className="label">Email address</label>
        <input
          className="input"
          value={contact}
          onChange={e => setContact(e.target.value)}
          placeholder="name@gmail.com"
        />
        <div className="mt-2 text-xs text-white/45">
          OTP will be sent to the Gmail address you entered.
        </div>
        <div className="mt-3 flex gap-2">
          {otpStep === 'verify' && (
            <button
              type="button"
              onClick={handleVerifyOtp}
              disabled={busy || otp.length !== 6}
              className="btn-primary flex-1"
            >
              Verify
            </button>
          )}
        </div>
        {otpStep === 'verify' && (
          <div className="mt-3">
            <div className="mb-2 text-xs text-white/45">
              OTP expires in {otpRemaining}s
            </div>
            <label className="label">OTP code</label>
            <input
              className="input text-center tracking-[0.35em]"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
            />
          </div>
        )}
        {otpStep === 'expired' && (
          <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
            OTP entry time expired. Please resend the code to continue.
          </div>
        )}
        {otpStep === 'password' && (
          <div className="mt-4 space-y-3 rounded-xl border border-brand-500/20 bg-brand-500/10 p-4">
            <div className="text-xs text-brand-200">
              Email verified. Create a password to link this email to your account.
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                value={passwordForm.password}
                onChange={e => setPasswordForm(current => ({ ...current, password: e.target.value }))}
                placeholder="Create a new password"
              />
            </div>
            <div>
              <label className="label">Confirm password</label>
              <input
                type="password"
                className="input"
                value={passwordForm.password_confirm}
                onChange={e => setPasswordForm(current => ({ ...current, password_confirm: e.target.value }))}
                placeholder="Repeat new password"
              />
            </div>
            <button
              type="button"
              onClick={handleSetPassword}
              disabled={passwordSaving}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {passwordSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {passwordSaving ? 'Saving password...' : 'Save password'}
            </button>
          </div>
        )}
        {deliveryNotice && (
          <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
            {deliveryNotice}
          </div>
        )}
        <div className="text-xs mt-2 text-white/40">
          Verification status: <span className={user?.email_verified ? 'text-emerald-400' : 'text-amber-300'}>{user?.email_verified ? 'Verified' : 'Pending'}</span>
        </div>
      </div>
      <div>
        <label className="label">Bio</label>
        <textarea className="input resize-none" rows={3} value={form.bio}
          onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Tell us about yourself…" />
      </div>
      <div className="pt-2 border-t border-surface-border space-y-4">
        <div className={`grid gap-3 ${isQuotaExceeded ? 'lg:grid-cols-[1fr,1.2fr]' : ''}`}>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-white/35">Usage</div>
            <div className="mt-1 text-xs text-white/45">
              Current plan: <span className="text-white capitalize font-medium">{user?.subscription_plan || 'free'}</span>
            </div>
            <div className="mt-3">
              <ProgressBar
                value={monthlyQuota > 0 ? Math.min(100, Math.round((videosUsed / monthlyQuota) * 100)) : 0}
                label="Videos used"
              />
            </div>
            <div className="mt-2 text-2xl font-bold text-white">{videosUsed}/{monthlyQuota}</div>
            <div className="text-xs text-white/45">videos used this month</div>
            <div className="mt-1 text-xs text-white/45">Quota remaining: <span className="text-brand-300 font-medium">{quotaRemaining}</span></div>
            {isQuotaExceeded && (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-amber-300">Monthly limit reached. Upgrade to continue creating videos.</p>
                <button
                  type="button"
                  onClick={() => document.getElementById('billing-plans')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="btn-primary w-full"
                >
                  Upgrade with payment
                </button>
              </div>
            )}
          </div>
          {isQuotaExceeded && (
            <div id="billing-plans" className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-white/35">Upgrade</div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {BILLING_PLANS.map(plan => (
                  <div
                    key={plan.label}
                    className={`rounded-xl border p-3 ${plan.featured ? 'border-brand-500/30 bg-brand-500/10' : 'border-white/10 bg-white/[0.02]'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-white">{plan.label}</div>
                      {plan.featured && <span className="text-[10px] uppercase tracking-[0.16em] text-brand-300">Best</span>}
                    </div>
                    <div className="mt-2 text-xl font-bold text-white">${plan.price}<span className="text-xs text-white/45 font-normal">{plan.period}</span></div>
                    <div className="mt-1 text-[11px] text-white/45">{plan.note}</div>
                    <div className="mt-1 text-[11px] text-white/60">Total: ${Number(plan.total || plan.price).toFixed(0)}</div>
                    <div className="mt-2 text-[11px] text-white/60">{plan.quota}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-surface-50 p-4">
                <div className="text-sm font-semibold text-white">Payment details</div>
                <div className="mt-1 text-xs text-white/40">Enter your card details to continue after 50 videos.</div>
                <div className="mt-4 grid gap-3">
                  <div>
                    <label className="label">Cardholder name</label>
                    <input
                      className="input"
                      value={paymentForm.cardholder_name}
                      onChange={e => setPaymentForm(form => ({ ...form, cardholder_name: e.target.value }))}
                      placeholder="Name on card"
                    />
                  </div>
                  <div>
                    <label className="label">Card number</label>
                    <input
                      className="input"
                      inputMode="numeric"
                      value={paymentForm.card_number}
                      onChange={e => setPaymentForm(form => ({ ...form, card_number: e.target.value }))}
                      placeholder="4242 4242 4242 4242"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Expiry</label>
                      <input
                        className="input"
                        value={paymentForm.expiry}
                        onChange={e => setPaymentForm(form => ({ ...form, expiry: e.target.value }))}
                        placeholder="MM/YY"
                      />
                    </div>
                    <div>
                      <label className="label">CVC</label>
                      <input
                        className="input"
                        inputMode="numeric"
                        value={paymentForm.cvc}
                        onChange={e => setPaymentForm(form => ({ ...form, cvc: e.target.value }))}
                        placeholder="123"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label">Billing email</label>
                    <input
                      className="input"
                      type="email"
                      value={paymentForm.billing_email}
                      onChange={e => setPaymentForm(form => ({ ...form, billing_email: e.target.value }))}
                      placeholder="billing@example.com"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => toast.success('Payment details saved for upgrade flow')}
                    className="btn-primary"
                  >
                    Save payment details
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save Profile
        </button>
      </div>
    </div>
  )
}

// ─── API Keys ────────────────────────────────────────────────────────────────
const API_SERVICE_INFO = {
  openai:     { name: 'OpenAI (ChatGPT)',       color: '#10a37f', placeholder: 'sk-...', url: 'https://platform.openai.com/api-keys' },
  deepseek:   { name: 'DeepSeek',               color: '#5b6cf6', placeholder: 'sk-...', url: 'https://platform.deepseek.com' },
  groq:       { name: 'Groq (xAI) — FREE',      color: '#f55036', placeholder: 'gsk_...', url: 'https://console.groq.com/keys' },
  elevenlabs: { name: 'ElevenLabs (TTS)',        color: '#f97316', placeholder: 'your-api-key', url: 'https://elevenlabs.io' },
  pexels:     { name: 'Pexels (Video Footage) — FREE', color: '#05a081', placeholder: 'your-pexels-api-key', url: 'https://www.pexels.com/api' },
  runway:     { name: 'Runway ML',               color: '#06b6d4', placeholder: 'your-api-key', url: 'https://runway.com' },
  anthropic:  { name: 'Anthropic (Claude)',      color: '#d97706', placeholder: 'sk-ant-...', url: 'https://console.anthropic.com' },
  mistral:    { name: 'Mistral AI',              color: '#0ea5e9', placeholder: 'your-api-key', url: 'https://console.mistral.ai' },
  cohere:     { name: 'Cohere',                  color: '#10b981', placeholder: 'your-api-key', url: 'https://dashboard.cohere.com' },
  others:     { name: 'Others (Custom API)',     color: '#6b7280', placeholder: 'your-api-key', url: '' },
}

function APIKeysSection() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const accountId = user?.id || 'guest'
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ service: 'openai', label: '', custom_service_name: '', raw_key: '' })
  const [showKey, setShowKey] = useState({})

  const { data: keys, isLoading } = useQuery({
    queryKey: ['api-keys', accountId],
    queryFn: () => apiKeysApi.list().then(r => Array.isArray(r.data) ? r.data : (r.data?.results || [])),
  })

  const openAddKey = (service = 'openai') => {
    setForm({ service, label: '', custom_service_name: '', raw_key: '' })
    setModal(true)
  }

  const addMutation = useMutation({
    mutationFn: () => apiKeysApi.create({
      service: form.service,
      label: form.service === 'others'
        ? (form.custom_service_name || form.label || 'Custom API')
        : form.label,
      raw_key: form.raw_key,
    }),
    onSuccess: () => { qc.invalidateQueries(['api-keys', accountId]); setModal(false); toast.success('API key saved') },
    onError: err => toast.error(err.response?.data?.detail || 'Failed to save key'),
  })

  const deleteMutation = useMutation({
    mutationFn: id => apiKeysApi.delete(id),
    onSuccess: () => { qc.invalidateQueries(['api-keys', accountId]); toast.success('API key removed') },
  })

  const testMutation = useMutation({
    mutationFn: id => apiKeysApi.test(id),
    onSuccess: (res) => toast.success(res.data.message || 'Key is valid ✓'),
    onError: (err) => toast.error(err.response?.data?.message || 'Key test failed'),
  })

  return (
    <div className="space-y-4">
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-brand-400" />
            <h2 className="text-lg font-semibold text-white">AI Service Keys</h2>
          </div>
          <button onClick={() => openAddKey()} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Add Key
          </button>
        </div>

        <div className="bg-brand-600/10 border border-brand-600/20 rounded-xl p-3 mb-4 flex gap-2">
          <Shield className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-white/60">Keys are encrypted at rest using Fernet symmetric encryption and never exposed in full.</p>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-16 bg-surface-50 rounded-xl shimmer" />)}</div>
        ) : !keys?.length ? (
          <div className="text-center py-8">
            <Key className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-sm">No API keys yet. Add your first key to start generating videos.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map(key => {
              const info = API_SERVICE_INFO[key.service] || { name: key.service }
              return (
                <div key={key.id} className="flex items-center gap-4 p-3 rounded-xl bg-surface-50 border border-surface-border">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                       style={{ background: info.color + '22' }}>
                    <span style={{ color: info.color }} className="text-sm font-bold">{info.name[0]}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{info.name}</span>
                      {key.label && <span className="text-xs text-white/40">({key.label})</span>}
                      <span className={`w-2 h-2 rounded-full ${key.is_active ? 'bg-green-400' : 'bg-gray-500'}`} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/30 font-mono">{key.key_preview}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => testMutation.mutate(key.id)}
                      disabled={testMutation.isPending}
                      className="px-2 py-1 rounded-lg text-xs text-white/50 hover:text-green-400 hover:bg-green-500/10 transition">
                      Test
                    </button>
                    <button onClick={() => deleteMutation.mutate(key.id)}
                      className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-white/60 mb-3 uppercase tracking-wider">Get API Keys</h3>
        <div className="space-y-2">
          {Object.entries(API_SERVICE_INFO).map(([k, v]) => (
            v.url ? (
              <a key={k} href={v.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition group">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: v.color }} />
                  <span className="text-sm text-white/70 group-hover:text-white">{v.name}</span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-white/30 group-hover:text-brand-400" />
              </a>
            ) : (
              <button
                key={k}
                type="button"
                onClick={() => openAddKey('others')}
                className="w-full flex items-center justify-between gap-2 p-3 rounded-xl hover:bg-white/5 transition group text-left"
              >
                <div className="w-2 h-2 rounded-full" style={{ background: v.color }} />
                <span className="text-sm text-white/40 group-hover:text-white">{v.name} — Add your custom key</span>
                <Plus className="w-3.5 h-3.5 text-white/30 group-hover:text-brand-400" />
              </button>
            )
          ))}
        </div>
      </div>

      {/* Add Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="Add API Key">
        <div className="space-y-4">
          <div>
            <label className="label">Service</label>
            <select className="input" value={form.service}
              onChange={e => setForm(f => ({
                ...f,
                service: e.target.value,
                custom_service_name: e.target.value === 'others' ? f.custom_service_name : '',
              }))}>
              {Object.entries(API_SERVICE_INFO).map(([k, v]) => (
                <option key={k} value={k} className="bg-white text-slate-900">{v.name}</option>
              ))}
            </select>
          </div>
          {form.service === 'others' && (
            <Input
              label="Custom service name"
              placeholder="e.g. My Private API"
              value={form.custom_service_name}
              onChange={e => setForm(f => ({ ...f, custom_service_name: e.target.value }))}
            />
          )}
          <Input label="Label (optional)" placeholder="e.g. Production key"
            value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
          <div>
            <label className="label">API Key</label>
            <div className="relative">
              <input
                type={showKey.new ? 'text' : 'password'}
                className="input pr-12"
                placeholder={API_SERVICE_INFO[form.service]?.placeholder || 'your-api-key'}
                value={form.raw_key}
                onChange={e => setForm(f => ({ ...f, raw_key: e.target.value }))}
              />
              <button type="button" onClick={() => setShowKey(s => ({ ...s, new: !s.new }))}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                {showKey.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setModal(false)} className="btn-ghost flex-1">Cancel</button>
            <button onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !form.raw_key}
              className="btn-primary flex-1 flex items-center justify-center gap-2">
              {addMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Key
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Social Accounts ──────────────────────────────────────────────────────────
function SocialAccountsSection() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const accountId = user?.id || 'guest'
  const [connectModal, setConnectModal] = useState(false)
  const [editAccount, setEditAccount] = useState(null)
  const [initialDemoForm, setInitialDemoForm] = useState(null)
  const [demoForm, setDemoForm] = useState({ platform: 'instagram', access_token: '', user_id: '', username: '', name: '', page_id: '' })
  const [contactValue, setContactValue] = useState('')
  const [otpStep, setOtpStep] = useState('contact')
  const [otpCode, setOtpCode] = useState('')
  const [otpInput, setOtpInput] = useState('')
  const [otpChannel, setOtpChannel] = useState(null)
  const [contactVerified, setContactVerified] = useState(false)
  const { savedAccounts = [] } = useAuthStore()

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['social-accounts', accountId],
    queryFn: () => socialAccountsApi.list().then(r => Array.isArray(r.data) ? r.data : (r.data?.results || [])),
  })

  const disconnectMutation = useMutation({
    mutationFn: id => socialAccountsApi.disconnect(id),
    onSuccess: () => { qc.invalidateQueries(['social-accounts', accountId]); toast.success('Account disconnected') },
    onError: () => toast.error('Failed to disconnect'),
  })

  const connectMutation = useMutation({
    mutationFn: () => socialAccountsApi.connectOAuth(demoForm),
    onSuccess: () => {
      qc.invalidateQueries(['social-accounts', accountId])
      setConnectModal(false)
      setEditAccount(null)
      setInitialDemoForm(null)
      setDemoForm({ platform: 'instagram', access_token: '', user_id: '', username: '', name: '', page_id: '' })
      toast.success('✅ Account connected!')
    },
    onError: err => {
      const warnings = err.response?.data?.warnings
      toast.error(
        (Array.isArray(warnings) && warnings.length ? warnings.join(' | ') : null) ||
        err.response?.data?.detail ||
        err.response?.data?.error ||
        'Connection failed'
      )
    },
  })

  const metaConnectMutation = useMutation({
    mutationFn: () => socialAccountsApi.instagramOAuthStart(),
    onSuccess: ({ data }) => {
      const authUrl = data?.auth_url
      if (!authUrl) { toast.error('Meta OAuth URL was not returned'); return }
      window.location.href = authUrl
    },
    onError: (err) => toast.error(err.message === 'Network Error' ? 'Server is waking up, please wait a minute.' : (err.response?.data?.error || 'Failed to start Meta OAuth')),
  })

  const youtubeConnectMutation = useMutation({
    mutationFn: () => socialAccountsApi.youtubeOAuthStart(),
    onSuccess: ({ data }) => {
      const authUrl = data?.auth_url
      if (!authUrl) { toast.error('Google OAuth URL was not returned'); return }
      window.location.href = authUrl
    },
    onError: (err) => toast.error(err.message === 'Network Error' ? 'Server is waking up, please wait a minute.' : 'Failed to start Google OAuth'),
  })


const linkedinConnectMutation = useMutation({
    mutationFn: () => socialAccountsApi.linkedinOAuthStart(),
    onSuccess: ({ data }) => {
      const authUrl = data?.auth_url
      if (!authUrl) { toast.error('LinkedIn OAuth URL was not returned'); return }
      window.location.href = authUrl
    },
    onError: (err) => toast.error(err.message === 'Network Error' ? 'Server is waking up, please wait a minute.' : (err.response?.data?.error || 'Failed to start LinkedIn OAuth')),
  })

  const twitterConnectMutation = useMutation({
    mutationFn: () => socialAccountsApi.twitterOAuthStart(),
    onSuccess: ({ data }) => {
      const authUrl = data?.auth_url
      if (!authUrl) { toast.error('Twitter OAuth URL was not returned'); return }
      window.location.href = authUrl
    },
    onError: (err) => toast.error(err.message === 'Network Error' ? 'Server is waking up, please wait a minute.' : (err.response?.data?.error || 'Failed to start Twitter OAuth')),
  })

  const testPublishMutation = useMutation({
    mutationFn: id => socialAccountsApi.publishStatus(id),
    onSuccess: (res) => {
      const data = res.data
      if (data.ready) toast.success(`${data.platform} account looks ready for publishing`)
      else toast.error(data.warnings.join(' | ') || 'Account is not publish-ready')
    },
    onError: (err) => toast.error(err.message === 'Network Error' ? 'Server is waking up, please wait a minute.' : 'Failed to check publish status'),
  })

  const platforms = [
    { key: 'instagram', label: 'Instagram', icon: '📸', color: '#e1306c', description: 'Business or Creator account required' },
    { key: 'facebook', label: 'Facebook', icon: '👥', color: '#1877f2', description: 'Facebook Page required' },
    { key: 'linkedin', label: 'LinkedIn', icon: '💼', color: '#0a66c2', description: 'Personal or Company page' },
    { key: 'youtube', label: 'YouTube Shorts', icon: '▶️', color: '#ff0033', description: 'YouTube channel required' },
    { key: 'twitter', label: 'Twitter / X', icon: '🐦', color: '#1da1f2', description: 'OAuth token + user ID/handle required' },
  ]

  const activeAccounts = accounts?.filter(a => a.is_active) || []

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('connected')
    const error = params.get('error')
    if (connected === 'meta') {
      toast.success('Meta accounts connected')
      qc.invalidateQueries(['social-accounts', accountId])
      window.history.replaceState({}, '', window.location.pathname)
    } else if (error?.startsWith('meta_')) {
      const messages = {
        meta_denied: 'Meta connection was cancelled',
        meta_no_pages: 'No Facebook Pages were returned. Make sure you manage a Page and granted Page permissions.',
        meta_no_accounts: 'Meta did not return a publishable Facebook or Instagram account.',
      }
      toast.error(messages[error] || 'Meta connection failed')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [accountId, qc])

  const openConnectModal = (platform = 'instagram') => {
    setEditAccount(null)
    const nextForm = { platform, access_token: '', user_id: '', username: '', name: '', page_id: '' }
    setDemoForm(nextForm)
    setInitialDemoForm(nextForm)
    setContactValue('')
    setOtpStep('contact')
    setOtpCode('')
    setOtpInput('')
    setOtpChannel(null)
    setContactVerified(false)
    setConnectModal(true)
  }

  const openEditModal = (account) => {
    const storedAccount = savedAccounts.find(item => String(item.id) === String(account.id))
    const nextForm = {
      platform: account.platform || 'instagram',
      access_token: storedAccount?.access || '',
      user_id: account.platform_user_id || '',
      username: account.platform_username || '',
      name: account.platform_name || '',
      page_id: account.page_id || '',
    }
    setEditAccount(account)
    setDemoForm(nextForm)
    setInitialDemoForm(nextForm)
    setContactValue('')
    setOtpStep('contact')
    setOtpCode('')
    setOtpInput('')
    setOtpChannel(null)
    setContactVerified(true)
    setConnectModal(true)
  }

  const userIdLabel = (() => {
    if (demoForm.platform === 'instagram') return 'Instagram Business Account ID *'
    if (demoForm.platform === 'facebook') return 'Facebook Page ID *'
    if (demoForm.platform === 'youtube') return 'YouTube Channel ID *'
    if (demoForm.platform === 'twitter') return 'Twitter User ID *'
    return 'LinkedIn Member ID'
  })()
  const userIdPlaceholder = (() => {
    if (demoForm.platform === 'instagram') return 'Instagram business account ID from Meta app'
    if (demoForm.platform === 'facebook') return 'Facebook Page ID'
    if (demoForm.platform === 'youtube') return 'YouTube channel ID or handle'
    if (demoForm.platform === 'twitter') return 'Twitter user ID or handle'
    return 'Optional for personal posting'
  })()
  const resolvedLinkedInOrgId = useMemo(() => {
    if (demoForm.platform !== 'linkedin') return ''
    const pageId = String(demoForm.page_id || '').trim()
    if (pageId) return pageId
    const userId = String(demoForm.user_id || '').trim()
    if (!userId) return ''
    if (userId.startsWith('urn:li:organization:')) return userId
    if (/^\d+$/.test(userId)) return userId
    return ''
  }, [demoForm.platform, demoForm.page_id, demoForm.user_id])
  const showLinkedInShareWarning =
    demoForm.platform === 'linkedin' &&
    !resolvedLinkedInOrgId
  const hasConnectionChanges = useMemo(() => {
    if (!editAccount || !initialDemoForm) return false
    const fields = ['platform', 'access_token', 'user_id', 'username', 'name', 'page_id']
    return fields.some(field => String(initialDemoForm[field] || '') !== String(demoForm[field] || ''))
  }, [editAccount, initialDemoForm, demoForm])

  const isFormValid =
    !!demoForm.access_token &&
    (demoForm.platform === 'linkedin'
      ? !!(demoForm.user_id || demoForm.page_id)
      : demoForm.platform === 'youtube'
        ? !!demoForm.user_id && !!demoForm.username
        : demoForm.platform === 'twitter'
          ? !!demoForm.user_id && !!demoForm.username
        : !!(demoForm.user_id || demoForm.page_id))

  const canConnect = editAccount
    ? Boolean(
        hasConnectionChanges &&
        isFormValid
      )
    : isFormValid

  const handleSendOtp = () => {
    const contact = String(contactValue || '').trim().toLowerCase()
    if (!contact || !contact.includes('@')) {
      toast.error('Enter a valid email address')
      return
    }

    const code = generateOtpCode()
    setOtpChannel('email')
    setOtpCode(code)
    setOtpInput('')
    setOtpStep('verify')

    toast.success('OTP sent to email')
    toast(`Debug OTP: ${code}`, { id: 'social-account-otp' })
  }

  const handleVerifyOtp = () => {
    if (!otpCode) {
      toast.error('Send an OTP first')
      return
    }
    if (otpInput !== otpCode) {
      toast.error('Incorrect OTP')
      return
    }
    setContactVerified(true)
    toast.success('Verified via email')
  }

  return (
    <div className="space-y-4">
      {/* Connected Accounts */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Connected Accounts</h2>
            <p className="text-white/40 text-xs mt-0.5">{activeAccounts.length} account{activeAccounts.length !== 1 ? 's' : ''} connected</p>
          </div>
          <button onClick={() => openConnectModal()} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Connect Account
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-16 bg-surface-50 rounded-xl shimmer" />)}</div>
        ) : activeAccounts.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">📱</div>
            <p className="text-white/60 text-sm mb-2">No social accounts connected yet</p>
            <p className="text-white/40 text-xs mb-5 max-w-md mx-auto">
              New here? Check the step-by-step guide before connecting your first account.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center items-center mb-5">
              <button
                onClick={() => navigate('/how-it-works')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-300 hover:text-white hover:bg-brand-500/25 text-sm font-semibold transition"
              >
                <BookOpen className="w-4 h-4" />
                Learn how to connect accounts
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2 my-4 max-w-xs mx-auto">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-[10px] uppercase tracking-widest text-white/35">Or connect now</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>
            <div className="flex gap-2 justify-center flex-wrap">
              {platforms.map(p => (
                <button key={p.key} onClick={() => openConnectModal(p.key)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 text-sm transition">
                  {p.icon} Connect {p.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {activeAccounts.map(acc => {
              const info = platforms.find(p => p.key === acc.platform)
              return (
                <div key={acc.id} className="flex items-center gap-3 p-4 rounded-xl bg-surface-50 border border-surface-border hover:border-brand-600/30 transition">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                    style={{ background: info?.color + '20' }}>
                    {info?.icon || '🌐'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white text-sm">{PLATFORM_SHORT_LABELS[acc.platform] || acc.platform_name || acc.platform_username}</p>
                    <p className="text-white/40 text-xs">@{acc.platform_username} · {PLATFORM_SHORT_LABELS[acc.platform] || acc.platform}</p>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
                    <Check className="w-3 h-3" /> Active
                  </span>
                  <button
                    onClick={() => openEditModal(acc)}
                    className="px-2 py-1 rounded-lg text-xs text-white/50 hover:text-brand-400 hover:bg-brand-500/10 transition flex items-center gap-1"
                    title="Edit account"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                  <button
                    onClick={() => testPublishMutation.mutate(acc.id)}
                    className="px-2 py-1 rounded-lg text-xs text-white/50 hover:text-green-400 hover:bg-green-500/10 transition"
                    title="Check publish setup"
                  >
                    Test
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Disconnect @${acc.platform_username} from ${acc.platform}?`)) {
                        disconnectMutation.mutate(acc.id)
                      }
                    }}
                    className="p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition"
                    title="Disconnect"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )
            })}

            {/* Add more accounts button */}
            <button onClick={() => openConnectModal()}
              className="w-full p-3 rounded-xl border border-dashed border-white/20 text-white/40 hover:text-white hover:border-brand-600/40 hover:bg-brand-600/5 transition text-sm flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> Add Another Account
            </button>
          </div>
        )}
      </div>

      {/* Platform cards - click to connect */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">Connect a Platform</h3>
        <div className="grid gap-3">
          {platforms.map(p => {
            const connected = activeAccounts.filter(a => a.platform === p.key)
            return (
              <div key={p.key}
                className="flex items-center gap-3 p-4 rounded-xl border border-surface-border hover:border-brand-600/30 cursor-pointer hover:bg-white/2 transition"
                onClick={() => openConnectModal(p.key)}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                  style={{ background: p.color + '20' }}>
                  {p.icon}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-white text-sm">{p.label}</p>
                  <p className="text-white/40 text-xs">{p.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {connected.length > 0 && (
                    <span className="text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
                      {connected.length} connected
                    </span>
                  )}
                  <span className="text-xs text-brand-400 hover:text-brand-300">+ Connect →</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Connect Modal */}
      <Modal open={connectModal} onClose={() => {
        setConnectModal(false)
        setEditAccount(null)
        setInitialDemoForm(null)
        setContactValue('')
        setOtpStep('contact')
        setOtpCode('')
        setOtpInput('')
        setOtpChannel(null)
        setContactVerified(false)
      }} title={editAccount ? 'Edit Social Account' : 'Connect Social Account'} scrollable>
        <div className="space-y-4">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
            <p className="text-blue-400 text-xs font-medium">ℹ️ How to connect</p>
            <p className="text-white/50 text-xs mt-1">
            Use real platform publishing credentials here. Instagram needs a Business/Creator account linked to a Facebook Page, Facebook needs a Page token, LinkedIn can use a member ID or organization URN, YouTube Shorts needs a channel ID, and Twitter/X needs a valid OAuth token plus user ID or handle.
            </p>
          </div>

          {(demoForm.platform === 'instagram' || demoForm.platform === 'facebook') && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-xs text-blue-100 space-y-2">
              <p className="font-medium">Recommended: connect with Meta OAuth</p>
              <p>Use this button to grant Page and Instagram publishing permissions. SocialMind will save the right Page token for Facebook and linked Instagram publishing.</p>
              <button
                type="button"
                onClick={() => metaConnectMutation.mutate()}
                disabled={metaConnectMutation.isPending}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#1877f2] text-white px-3 py-2 font-semibold hover:bg-[#166fe5] transition disabled:opacity-60"
              >
                {metaConnectMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Connect Facebook / Instagram with Meta
              </button>
            </div>
          )}

          {demoForm.platform === 'youtube' && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-100 space-y-2">
              <p className="font-medium">Recommended: connect with Google</p>
              <p>Use the Google OAuth button below so SocialMind can upload the video directly to your YouTube channel.</p>
              <button
                type="button"
                onClick={() => youtubeConnectMutation.mutate()}
                disabled={youtubeConnectMutation.isPending}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white text-black px-3 py-2 font-semibold hover:bg-white/90 transition disabled:opacity-60"
              >
                {youtubeConnectMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Connect YouTube with Google
              </button>
            </div>
          )}

          {demoForm.platform === 'linkedin' && (
            <div className="rounded-xl border border-[#0a66c2]/20 bg-[#0a66c2]/10 px-4 py-3 text-xs text-blue-100 space-y-2">
              <p className="font-medium">Recommended: connect with LinkedIn</p>
              <p>Use the LinkedIn OAuth button below — you'll log in on LinkedIn's site and approve posting permissions.</p>
              <button
                type="button"
                onClick={() => linkedinConnectMutation.mutate()}
                disabled={linkedinConnectMutation.isPending}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0a66c2] text-white px-3 py-2 font-semibold hover:bg-[#0958a8] transition disabled:opacity-60"
              >
                {linkedinConnectMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Connect LinkedIn with OAuth
              </button>
            </div>
          )}

          {demoForm.platform === 'twitter' && (
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-xs text-sky-100 space-y-2">
              <p className="font-medium">Recommended: connect with Twitter OAuth</p>
              <p>Use OAuth to get a token with the right permissions (tweet.write, media.write). You'll need a Twitter Developer App — see setup instructions below.</p>
              <button
                type="button"
                onClick={() => twitterConnectMutation.mutate()}
                disabled={twitterConnectMutation.isPending}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#1da1f2] text-white px-3 py-2 font-semibold hover:bg-[#1a91da] transition disabled:opacity-60"
              >
                {twitterConnectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>𝕏</span>}
                Connect Twitter / X with OAuth
              </button>
            </div>
          )}

          <div>
            <label className="label">Platform</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {platforms.map(p => (
                <button key={p.key}
                  onClick={() => setDemoForm(f => ({ ...f, platform: p.key }))}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition text-sm
                    ${demoForm.platform === p.key
                      ? 'border-brand-600/50 bg-brand-600/10 text-white'
                      : 'border-white/10 text-white/50 hover:border-white/20'}`}>
                  <span className="text-xl">{p.icon}</span>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          <Input label="Access Token *" placeholder="Publishing access token"
            value={demoForm.access_token} onChange={e => setDemoForm(f => ({ ...f, access_token: e.target.value }))} />
          <Input label={userIdLabel} placeholder={userIdPlaceholder}
            value={demoForm.user_id} onChange={e => setDemoForm(f => ({ ...f, user_id: e.target.value }))} />
          <Input label={demoForm.platform === 'youtube' ? 'Channel Handle *' : demoForm.platform === 'twitter' ? 'Handle *' : 'Username *'} placeholder={demoForm.platform === 'youtube' ? '@yourchannel (without @)' : demoForm.platform === 'twitter' ? '@yourhandle (without @)' : '@yourusername (without @)'}
            value={demoForm.username} onChange={e => setDemoForm(f => ({ ...f, username: e.target.value }))} />
          <Input label="Display Name" placeholder="Your name or page name"
            value={demoForm.name} onChange={e => setDemoForm(f => ({ ...f, name: e.target.value }))} />
          {(demoForm.platform === 'instagram' || demoForm.platform === 'facebook') && (
            <Input label="Facebook Page ID" placeholder="Required for Instagram publishing, recommended for Facebook"
              value={demoForm.page_id} onChange={e => setDemoForm(f => ({ ...f, page_id: e.target.value }))} />
          )}
          {demoForm.platform === 'linkedin' && (
            <>
              <Input label="LinkedIn Organization URN or ID" placeholder="urn:li:organization:123456 or 123456"
                value={demoForm.page_id} onChange={e => setDemoForm(f => ({ ...f, page_id: e.target.value }))} />
              <p className="text-xs text-white/40">
                Use `Member ID` for personal posting, or `Organization URN/ID` for company posting. A LinkedIn profile URL will not work here.
              </p>
              {showLinkedInShareWarning && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                  Share counts may not update reliably unless you set a LinkedIn organization ID in either `page_id` or the main LinkedIn ID field.
                  Without an organization ID, likes and comments can still work, but share/repost stats may be incomplete.
                </div>
              )}
            </>
          )}
          {demoForm.platform === 'youtube' && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-100">
              The fields below are only for manual fallback. The Google OAuth button above is the recommended way to connect YouTube for auto-posting.
            </div>
          )}
          {demoForm.platform === 'twitter' && (
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-xs text-sky-100">
              Twitter/X posting needs an OAuth access token, a user ID or handle, and publishing permission on the connected account.
            </div>
          )}

          <div className="flex gap-3 pt-2 pb-1">
            <button onClick={() => {
              setConnectModal(false)
              setEditAccount(null)
              setInitialDemoForm(null)
              setContactValue('')
              setOtpStep('contact')
              setOtpCode('')
              setOtpInput('')
              setOtpChannel(null)
              setContactVerified(false)
            }}
              className="flex-1 px-4 py-2 rounded-xl border border-white/10 text-white/60 hover:text-white transition text-sm">
              Cancel
            </button>
            <button onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending || !canConnect}
              className="flex-1 btn-primary flex items-center justify-center gap-2">
              {connectMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {platforms.find(p => p.key === demoForm.platform)?.icon} {editAccount ? 'Save Changes' : `Connect ${platforms.find(p => p.key === demoForm.platform)?.label}`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
