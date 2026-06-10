import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { loadPayPalSdk } from '@/utils/paypalSdk'

export default function PayPalSubscriptionButton({
  clientId,
  planId,
  disabled = false,
  onApprove,
  onError,
}) {
  const containerRef = useRef(null)
  const buttonsRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true

    if (!containerRef.current) return undefined
    containerRef.current.innerHTML = ''
    setMessage('')

    if (disabled || !clientId || !planId) return undefined

    setLoading(true)
    loadPayPalSdk({ clientId })
      .then(paypal => {
        if (!active || !containerRef.current) return

        const buttons = paypal.Buttons({
          style: {
            layout: 'vertical',
            shape: 'rect',
            color: 'gold',
            label: 'subscribe',
            height: 48,
          },
          createSubscription: (_data, actions) => actions.subscription.create({
            plan_id: planId,
          }),
          onApprove: data => {
            const subscriptionId = data?.subscriptionID || data?.subscriptionId || data?.id
            if (!subscriptionId) {
              onError?.(new Error('PayPal did not return a subscription ID.'))
              return
            }
            onApprove?.(subscriptionId)
          },
          onError: err => onError?.(err),
          onCancel: () => setMessage('PayPal checkout was cancelled.'),
        })

        buttonsRef.current = buttons
        if (!buttons.isEligible || buttons.isEligible()) {
          buttons.render(containerRef.current)
        } else {
          setMessage('PayPal subscriptions are not eligible for this account or browser.')
        }
      })
      .catch(err => {
        if (!active) return
        setMessage(err?.message || 'Unable to load PayPal.')
        onError?.(err)
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
  }, [clientId, disabled, onApprove, onError, planId])

  return (
    <div className="space-y-3">
      {loading && (
        <div className="flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white/55">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading PayPal...
        </div>
      )}
      <div ref={containerRef} className={loading ? 'min-h-[48px] opacity-0' : 'min-h-[48px]'} />
      {message && <p className="text-center text-xs text-white/40">{message}</p>}
    </div>
  )
}
