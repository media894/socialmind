import { useState, useEffect, useRef } from 'react'
import { ArrowRight, Check, Shield, Sparkles, X, Zap } from 'lucide-react'
import { FEATURE_COMPARISON } from '@/config/pricingPlans'

const BENEFITS = [
  { icon: '⏱', label: 'Save 10+ hours per week' },
  { icon: '⚡', label: 'AI-generated content in seconds' },
  { icon: '💡', label: 'Never run out of content ideas' },
  { icon: '📈', label: 'Grow your reach by 3×' },
]

const PLANS = {
  pro: {
    tag: 'PRO PLAN',
    name: 'Individual',
    desc: 'Perfect for solo creators who want to automate their social presence',
    monthly: 20,
    annual: 16,
    cta: 'Start 14-day Free Trial',
    action: 'trial',
    featured: false,
    badge: null,
    demoLabel: 'View Demo',
    features: [
      '1 SocialMind account',
      'AI-powered caption generation',
      'AI-powered hashtag suggestions',
      'Automated post scheduling',
      'Instagram, Facebook, LinkedIn & YouTube',
      'Performance analytics dashboard',
      'Email support',
    ],
  },
  enterprise: {
    tag: 'ENTERPRISE PLAN',
    name: 'Team',
    desc: "Scale your team's content creation with AI superpowers",
    monthly: 79,
    annual: 63,
    cta: 'Contact Sales',
    action: 'sales',
    featured: true,
    badge: '★ Most Popular for Teams',
    demoLabel: 'View Demo',
    features: [
      'Up to 5 team members',
      'Each member gets separate account access',
      'Single Sign-On (SSO)',
      'Bulk schedule up to 250 posts at once',
      'Priority support with dedicated manager',
      'Advanced analytics & team reporting',
      'Custom integrations & API access',
    ],
  },
}

function fmt(n) {
  return '$' + n.toLocaleString('en-US')
}

export default function PricingSection({ onClose, onStartTrial, onContactSales, onViewDemo, onSelectPlan }) {
  const [billing, setBilling] = useState('monthly')
  const [showDiff, setShowDiff] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [activeCard, setActiveCard] = useState('both')
  const containerRef = useRef(null)
  const proRef = useRef(null)
  const entRef = useRef(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onScroll = () => {
      if (window.scrollY + window.innerHeight < el.getBoundingClientRect().top + 120) {
        setShowDiff(false)
        return
      }
      // show when user scrolls past the header area
      setShowDiff(window.scrollY > el.getBoundingClientRect().top + 80)
    }

    window.addEventListener('scroll', onScroll, { passive: true })

    // IntersectionObserver to detect which card is most visible
    const obs = new IntersectionObserver((entries) => {
      let best = null
      for (const e of entries) {
        if (!best || e.intersectionRatio > best.intersectionRatio) best = e
      }
      if (!best) return
      const id = best.target.dataset.plan
      if (entries.some(en => en.intersectionRatio > 0.6)) {
        setActiveCard(id || 'both')
      } else {
        setActiveCard('both')
      }
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] })

    if (proRef.current) obs.observe(proRef.current)
    if (entRef.current) obs.observe(entRef.current)

    return () => {
      window.removeEventListener('scroll', onScroll)
      obs.disconnect()
    }
  }, [])

  function handleAction(action) {
    if (onSelectPlan) {
      const planKey = action === 'trial' ? 'pro' : 'enterprise'
      const planData = PLANS[planKey]
      const price = billing === 'annual' ? planData.annual : planData.monthly
      onSelectPlan({
        key: planKey,
        name: planData.name,
        eyebrow: planData.tag,
        monthlyPrice: price,
        billing: billing,
        quota: planKey === 'pro' ? '50 videos / month' : 'Unlimited videos',
        note: planKey === 'pro' ? '1 SocialMind account · AI-powered' : 'Up to 5 team members · SSO included',
        features: planData.features,
      })
    } else {
      if (action === 'trial') onStartTrial?.(billing)
      if (action === 'sales') onContactSales?.(billing)
    }
  }

  const proFeatures = PLANS.pro.features
  const entFeatures = PLANS.enterprise.features
  const entOnly = entFeatures.filter(f => !proFeatures.includes(f))
  const proOnly = proFeatures.filter(f => !entFeatures.includes(f))

  return (
    <section ref={containerRef} className="relative bg-[#0d0d18] text-white select-none">
      {/* top gradient */}
      <div className="absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-brand-600/20 to-transparent pointer-events-none" />

      {/* ── Header ── */}
      <div className="relative px-6 pt-7 pb-6 sm:px-10 border-b border-white/[0.07] flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-brand-400 flex items-center gap-1.5">
            <span className="inline-block w-5 border-t border-brand-400/60" />
            PRICING
            <span className="inline-block w-5 border-t border-brand-400/60" />
          </p>
          <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight">
            Simple, transparent pricing
          </h2>
          <p className="mt-1.5 text-sm text-white/40 max-w-lg leading-6">
            Everything you need to automate your social media growth — powered by AI.
          </p>

          {/* benefit pills */}
          <div className="mt-4 flex flex-wrap gap-2">
            {BENEFITS.map(b => (
              <span
                key={b.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.04] px-3 py-1 text-[11px] text-white/55"
              >
                <span>{b.icon}</span> {b.label}
              </span>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] p-2 text-white/40 hover:text-white hover:bg-white/[0.08] transition"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Billing toggle ── */}
      <div className="relative flex justify-center py-5">
        <div className="inline-flex items-center rounded-xl border border-white/[0.09] bg-white/[0.04] p-1 gap-1">
          {[
            { key: 'monthly', label: 'MONTHLY' },
            { key: 'annual', label: 'ANNUAL', badge: '-20%' },
          ].map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setBilling(opt.key)}
              className={`relative px-5 py-1.5 rounded-lg text-[11px] font-bold tracking-widest transition ${
                billing === opt.key
                  ? 'bg-white/[0.10] text-white'
                  : 'text-white/35 hover:text-white/60'
              }`}
            >
              {opt.label}
              {opt.badge && (
                <span className="ml-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/25 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                  {opt.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Plan cards ── */}
      <div className="relative grid gap-4 px-6 pb-6 sm:px-10 sm:pb-8 lg:grid-cols-2">
        {Object.entries(PLANS).map(([key, plan]) => {
          const price = billing === 'annual' ? plan.annual : plan.monthly

          return (
            <div
              key={key}
              data-plan={key}
              ref={key === 'pro' ? proRef : key === 'enterprise' ? entRef : null}
              className={`rounded-2xl border bg-white/[0.03] p-6 flex flex-col ${
                plan.featured
                  ? 'border-brand-500/40 shadow-[0_20px_60px_rgba(99,73,255,0.18)]'
                  : 'border-white/[0.08]'
              }`}
            >
              {/* card header */}
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.22em] text-white/35 uppercase mb-1">{plan.tag}</p>
                  <h3 className="text-2xl font-extrabold">{plan.name}</h3>
                  <p className="mt-1 text-xs text-white/40 leading-5 max-w-[240px]">{plan.desc}</p>
                </div>
                {plan.badge && (
                  <span className="shrink-0 rounded-full border border-brand-500/30 bg-brand-500/10 px-2.5 py-1 text-[10px] font-semibold text-brand-300 flex items-center gap-1">
                    {plan.badge}
                  </span>
                )}
              </div>

              {/* billing toggle display */}
              <div className="flex gap-3 mb-6">
                <button
                  type="button"
                  onClick={() => setBilling('monthly')}
                  className={`flex-1 rounded-xl px-3 py-3 text-center transition border ${
                    billing === 'monthly'
                      ? 'border-white/20 bg-white/[0.08]'
                      : 'border-white/[0.06] bg-transparent opacity-50'
                  }`}
                >
                  <p className="text-[9px] font-bold tracking-widest text-white/50 uppercase mb-0.5">MONTHLY</p>
                  <p className="text-lg font-extrabold text-white">{fmt(plan.monthly)}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setBilling('annual')}
                  className={`flex-1 rounded-xl px-3 py-3 text-center transition border relative ${
                    billing === 'annual'
                      ? 'border-white/20 bg-white/[0.08]'
                      : 'border-white/[0.06] bg-transparent opacity-50'
                  }`}
                >
                  <span className="absolute -top-2 right-2 rounded-full bg-emerald-500/20 border border-emerald-500/25 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">-20%</span>
                  <p className="text-[9px] font-bold tracking-widest text-white/50 uppercase mb-0.5">ANNUAL</p>
                  <p className="text-lg font-extrabold text-white">{fmt(plan.annual)}</p>
                </button>
              </div>

              {/* current price */}
              <div className="mb-6">
                <span className="text-4xl font-black tracking-tight">{fmt(price)}</span>
                <span className="ml-1 text-sm text-white/35">/month</span>
                {billing === 'annual' && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-white/55">
                      Billed annually as <span className="font-semibold text-white/80">{fmt(plan.annual * 12)}</span>
                    </span>
                    <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                      Save {fmt((plan.monthly - plan.annual) * 12)}/yr
                    </span>
                  </div>
                )}
                {billing === 'monthly' && (
                  <div className="mt-2 text-xs text-white/45">
                    Switch to annual to pay just <span className="font-semibold text-emerald-300">{fmt(plan.annual)}/month</span>
                  </div>
                )}
              </div>

              {/* CTA buttons */}
              <button
                type="button"
                disabled={false}
                onClick={() => handleAction(plan.action)}
                className={`relative z-10 w-full rounded-xl px-4 py-3.5 text-sm font-bold transition flex items-center justify-center gap-2 mb-3 cursor-pointer pointer-events-auto opacity-100 ${
                  plan.featured
                    ? 'bg-brand-500 text-white hover:bg-brand-400 shadow-[0_8px_24px_rgba(99,73,255,0.35)]'
                    : 'bg-brand-500 text-white hover:bg-brand-400 shadow-[0_8px_24px_rgba(99,73,255,0.25)]'
                }`}
              >
                {plan.cta}
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onViewDemo}
                className="w-full rounded-xl px-4 py-2.5 text-xs font-semibold text-white/45 hover:text-white border border-white/[0.07] hover:bg-white/[0.04] transition flex items-center justify-center gap-1.5"
              >
                ▶ {plan.demoLabel}
              </button>

              {/* features */}
              <div className="mt-6 pt-5 border-t border-white/[0.07]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">
                  {plan.featured ? "EVERYTHING IN PRO, PLUS" : "WHAT'S INCLUDED"}
                </p>
                <div className="space-y-2.5">
                  {plan.features.map(feature => (
                    <div key={feature} className="flex items-start gap-2.5 text-sm text-white/65">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
                        <Check className="w-2.5 h-2.5" />
                      </span>
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Footer ── */}
      <div className="relative border-t border-white/[0.07] px-6 py-4 sm:px-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-[11px] text-white/30">
          All plans include secure account storage, scheduling tools, and app updates.
        </p>
        <button
          type="button"
          onClick={onViewDemo}
          className="text-xs font-semibold text-brand-300 hover:text-brand-200 transition whitespace-nowrap"
        >
          Continue with current plan →
        </button>
      </div>

      {/* Sticky feature diff panel (appears on scroll) */}
      {!dismissed && showDiff && (
        <div className="fixed left-1/2 bottom-6 z-40 w-[min(980px,94%)] -translate-x-1/2">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-md p-4 flex items-center justify-between gap-4 shadow-xl transition-transform duration-300 ease-out">
            <div className="flex-1 flex items-center gap-6">
              <div className="min-w-[160px]">
                <div className="text-[10px] uppercase tracking-widest text-white/40">{PLANS.pro.name}</div>
                <div className="mt-1 text-xl font-extrabold">{fmt(billing === 'annual' ? PLANS.pro.annual : PLANS.pro.monthly)}</div>
                <div className="text-[11px] text-white/40">{billing === 'annual' ? 'Billed annually' : '/month'}</div>
              </div>

              <div className="grow border-l border-white/[0.06] pl-6">
                <div className="text-[12px] font-semibold text-white">Full feature comparison</div>
                <div className="mt-3 max-h-48 overflow-auto rounded-md border border-white/[0.04] bg-white/[0.02]">
                  <table className="w-full table-fixed text-sm text-white/75">
                    <thead>
                      <tr className="text-[11px] text-white/40">
                        <th className="w-1/2 text-left px-3 py-2">Feature</th>
                        <th className={`w-1/4 text-center px-3 py-2 transition-colors ${activeCard === 'pro' ? 'bg-white/[0.03] ring-1 ring-emerald-500/15' : ''}`}>Pro</th>
                        <th className={`w-1/4 text-center px-3 py-2 transition-colors ${activeCard === 'enterprise' ? 'bg-white/[0.03] ring-1 ring-emerald-500/15' : ''}`}>Enterprise</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FEATURE_COMPARISON.map((row, idx) => (
                        <tr key={idx} className="border-t border-white/[0.03] last:border-b-0">
                          <td className="px-3 py-2 text-sm text-white/65">{row.label}</td>
                          <td className={`px-3 py-2 text-center transition-colors ${activeCard === 'pro' ? 'bg-white/[0.02]' : ''}`}>
                            {typeof row.pro === 'boolean' ? (
                              row.pro ? <Check className="inline w-4 h-4 text-emerald-400"/> : <X className="inline w-4 h-4 text-white/30"/>
                            ) : (
                              <span className="text-white/60">{row.pro}</span>
                            )}
                          </td>
                          <td className={`px-3 py-2 text-center transition-colors ${activeCard === 'enterprise' ? 'bg-white/[0.02]' : ''}`}>
                            {typeof row.enterprise === 'boolean' ? (
                              row.enterprise ? <Check className="inline w-4 h-4 text-emerald-400"/> : <X className="inline w-4 h-4 text-white/30"/>
                            ) : (
                              <span className="text-white/60">{row.enterprise}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-3">
              <button onClick={() => setDismissed(true)} className="text-xs text-white/40 hover:text-white">Dismiss</button>
              <div className="flex flex-col gap-2 w-44">
                <button type="button" disabled={false} onClick={() => onStartTrial?.(billing)} className="w-full rounded-xl bg-brand-500 py-2 text-sm font-bold text-white cursor-pointer pointer-events-auto opacity-100">Start Free Trial</button>
                <button type="button" disabled={false} onClick={() => onContactSales?.(billing)} className="w-full rounded-xl border border-white/[0.06] py-2 text-xs text-white/60 cursor-pointer pointer-events-auto opacity-100">Contact Sales</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
