import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Shield, X } from 'lucide-react'
import toast from 'react-hot-toast'

import PayPalSubscriptionButton from '@/components/PayPalSubscriptionButton'
import { billingApi } from '@/api/client'
import { formatUsd } from '@/config/pricingPlans'
import { useAuthStore } from '@/store/auth'

export default function PayPalCheckoutModal({ open, plan, onClose, onSuccess, onRequireAuth }) {
  const { isAuthenticated, updateUser } = useAuthStore()
  const [config, setConfig] = useState(null)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setConfig(null)
    setProcessing(false)
    setLoadingConfig(true)
    billingApi.paypalConfig()
      .then(response => setConfig(response.data))
      .catch(() => setError('Unable to load PayPal configuration.'))
      .finally(() => setLoadingConfig(false))
  }, [open])

  const planId = useMemo(() => {
    if (!plan?.key) return ''
    return config?.plan_ids?.[plan.key] || ''
  }, [config, plan?.key])

  const handleApprove = useCallback(async (subscriptionId) => {
    if (!plan?.key) return
    setProcessing(true)
    setError('')
    try {
      const { data } = await billingApi.approvePayPalSubscription({
        plan_key: plan.key,
        subscription_id: subscriptionId,
      })
      if (data?.user) updateUser(data.user)
      toast.success(`${plan.name} plan is active`)
      onSuccess?.(data)
    } catch (err) {
      setError(err?.response?.data?.detail || 'PayPal approved the payment, but SocialMind could not verify it yet.')
    } finally {
      setProcessing(false)
    }
  }, [onSuccess, plan, updateUser])

  const handlePayPalError = useCallback((err) => {
    setError(err?.message || 'PayPal checkout failed. Please try again.')
  }, [])

  if (!open || !plan) return null

  const missingConfig = !loadingConfig && (!config?.client_id || !planId)

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={!processing ? onClose : undefined} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0d0b1f] shadow-[0_28px_90px_rgba(0,0,0,0.72)]">
        <div className="border-b border-white/10 px-6 py-5 flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-300">Secure checkout</div>
            <h3 className="mt-2 text-xl font-black text-white">{plan.name} Plan</h3>
            <p className="mt-1 text-xs text-white/40">{plan.quota} · {plan.note}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="rounded-xl p-2 text-white/35 hover:bg-white/5 hover:text-white disabled:opacity-40"
            aria-label="Close checkout"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="rounded-xl border border-brand-400/20 bg-brand-400/[0.08] p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-white">{plan.eyebrow}</p>
              <p className="mt-1 text-xs text-white/45">PayPal subscription billing</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-white">{formatUsd(plan.monthlyPrice)}</p>
              <p className="text-[11px] text-white/35">/month</p>
            </div>
          </div>

          <div className="grid gap-2">
            {plan.features.slice(0, 4).map(feature => (
              <div key={feature} className="flex items-start gap-2.5 text-xs font-semibold text-white/60">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-emerald-400/35 bg-emerald-400/12 text-emerald-300">
                  <Check className="h-3 w-3" />
                </span>
                <span>{feature}</span>
              </div>
            ))}
          </div>

          {!isAuthenticated ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.08] px-4 py-3 text-sm text-amber-100/75">
                Create or sign in to your SocialMind account before starting a subscription.
              </div>
              <button
                type="button"
                onClick={() => onRequireAuth?.(plan)}
                className="w-full rounded-xl bg-brand-500 py-3 text-sm font-black text-white hover:bg-brand-400 transition"
              >
                Create account to subscribe
              </button>
            </div>
          ) : loadingConfig ? (
            <div className="flex h-20 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white/55">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparing PayPal...
            </div>
          ) : missingConfig ? (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.08] px-4 py-3 text-sm text-amber-100/75">
              Add PayPal configuration for this plan: <span className="font-bold">PAYPAL_CLIENT_ID</span> and <span className="font-bold">{plan.key === 'pro' ? 'PAYPAL_PRO_PLAN_ID' : 'PAYPAL_ENTERPRISE_PLAN_ID'}</span>.
            </div>
          ) : (
            <PayPalSubscriptionButton
              clientId={config.client_id}
              planId={planId}
              disabled={processing}
              onApprove={handleApprove}
              onError={handlePayPalError}
            />
          )}

          {processing && (
            <div className="flex items-center justify-center gap-2 text-xs text-white/45">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Verifying PayPal subscription...
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-400/20 bg-red-400/[0.08] px-4 py-3 text-xs text-red-100/75">
              {error}
            </div>
          )}

          <div className="flex items-center justify-center gap-2 text-[11px] text-white/28">
            <Shield className="h-3.5 w-3.5" />
            PayPal handles payment details. SocialMind only stores the verified subscription ID.
          </div>
        </div>
      </div>
    </div>
  )
}
