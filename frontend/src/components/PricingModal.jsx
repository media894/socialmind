import { useState } from 'react'

import PayPalCheckoutModal from '@/components/PayPalCheckoutModal'
import PricingSection from '@/components/PricingSection'
import { useAuthStore } from '@/store/auth'

export default function PricingModal({
  open,
  onClose,
  onRequireAuth,
  onViewDemo,
  checkoutEnabled = true,
}) {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)
  const [checkoutPlan, setCheckoutPlan] = useState(null)

  if (!open) return null

  const handleSelectPlan = (plan) => {
    if (!checkoutEnabled || !isAuthenticated) {
      onRequireAuth?.(plan)
      return
    }
    setCheckoutPlan(plan)
  }

  const handleSuccess = (data) => {
    setCheckoutPlan(null)
    onClose?.()
    // Fire the Pro-activated banner event so AppLayout can show the confirmation popup
    const planName = checkoutPlan?.name || checkoutPlan?.label || 'Pro'
    window.dispatchEvent(new CustomEvent('sm:pro-activated', { detail: { planName } }))
    return data
  }

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative min-h-full flex items-center justify-center p-4 py-10">
        <div className="w-full max-w-5xl rounded-[28px] border border-white/[0.08] overflow-hidden shadow-2xl">
          <PricingSection
            onClose={onClose}
            onSelectPlan={handleSelectPlan}
            onViewDemo={onViewDemo || onClose}
            checkoutEnabled={checkoutEnabled && isAuthenticated}
          />
        </div>
      </div>
      <PayPalCheckoutModal
        open={!!checkoutPlan}
        plan={checkoutPlan}
        onClose={() => setCheckoutPlan(null)}
        onSuccess={handleSuccess}
        onRequireAuth={onRequireAuth}
      />
    </div>
  )
}