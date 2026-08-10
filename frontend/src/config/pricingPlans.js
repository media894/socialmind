export const SUBSCRIPTION_PLANS = [
  {
    key: 'pro',
    eyebrow: 'Pro Plan',
    name: 'Individual',
    description: 'Perfect for solo creators who want to automate their social presence',
    monthlyPrice: 10,
    annualMonthlyPrice: 8,
    cta: 'Start 14-day Free Trial',
    demoLabel: 'View Demo',
    featured: false,
    badge: '',
    quota: '50 videos / month',
    note: '1 SocialMind account · AI-powered',
    includedTitle: "What's included",
    features: [
      '1 SocialMind account',
      'AI-powered caption generation',
      'AI-powered hashtag suggestions',
      'Automated post scheduling',
      'Smart content optimization',
      'Generate up to 50 videos / month',
    ],
  },
  {
    key: 'enterprise',
    eyebrow: 'Enterprise Plan',
    name: 'Team',
    description: "Scale your team's content creation with AI superpowers",
    monthlyPrice: 39.5,
    annualMonthlyPrice: 31.5,
    cta: 'Continue with PayPal',
    demoLabel: 'View Demo',
    featured: true,
    badge: 'Most Popular for Teams',
    quota: 'Unlimited videos',
    note: 'Up to 5 team members · SSO included',
    includedTitle: 'Everything in Pro, plus',
    features: [
      'Up to 5 team members',
      'Each member gets separate account access',
      'Single Sign-On (SSO)',
      'Bulk schedule up to 250 posts at once',
      'AI-powered caption & hashtag generation',
      'Priority support',
      'Advanced analytics dashboard',
    ],
  },
]

export const PRICING_HIGHLIGHTS = [
  { tone: 'emerald', label: 'Save 10+ hours per week' },
  { tone: 'amber', label: 'AI-generated content in seconds' },
  { tone: 'sky', label: 'Never run out of content ideas' },
  { tone: 'violet', label: 'Grow your reach by 3x' },
]

export const FEATURE_COMPARISON = [
  { label: 'SocialMind accounts', pro: '1 account', enterprise: 'Up to 5' },
  { label: 'AI caption generation', pro: true, enterprise: true },
  { label: 'AI hashtag suggestions', pro: true, enterprise: true },
  { label: 'Automated post scheduling', pro: true, enterprise: true },
  { label: 'Smart content optimization', pro: true, enterprise: true },
  { label: 'Video generation / month', pro: '50 videos', enterprise: 'Unlimited' },
  { label: 'Team members', pro: false, enterprise: '5 members' },
  { label: 'Single Sign-On (SSO)', pro: false, enterprise: true },
  { label: 'Bulk post scheduling', pro: false, enterprise: '250 posts at once' },
  { label: 'Advanced analytics dashboard', pro: false, enterprise: true },
  { label: 'Priority support', pro: false, enterprise: true },
]

export const EXCHANGE_RATE_INR = 83

export function detectUserCurrency() {
  try {
    const tz = typeof window !== 'undefined' && Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || ''
    const lang = typeof navigator !== 'undefined' && navigator?.language || ''
    if (tz.includes('Kolkata') || tz.includes('Calcutta') || tz.includes('India') || lang.endsWith('-IN')) {
      return 'INR'
    }
  } catch (e) {
    // fallback
  }
  return 'USD'
}

export function formatUsd(value) {
  return formatPrice(value, 'USD')
}

export function formatPrice(usdAmount, currency = 'USD') {
  if (currency === 'INR') {
    const inrAmount = usdAmount * EXCHANGE_RATE_INR
    return formatCurrency(inrAmount, 'INR')
  }
  return formatCurrency(usdAmount, 'USD')
}

export function formatCurrency(amount, currency = 'USD') {
  if (currency === 'INR') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount)
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount)
}

export function calculatePriceDetails(usdAmount, currency = 'USD') {
  const baseAmount = currency === 'INR' ? usdAmount * EXCHANGE_RATE_INR : usdAmount
  const taxRate = 18
  const taxAmount = (baseAmount * taxRate) / 100
  const totalAmount = baseAmount + taxAmount
  return {
    currency,
    currencySymbol: currency === 'INR' ? '₹' : '$',
    baseAmount,
    taxRate,
    taxAmount,
    totalAmount,
    taxLabel: currency === 'INR' ? '18% GST' : '18% Tax',
  }
}

export function getPlanByKey(planKey) {
  return SUBSCRIPTION_PLANS.find(plan => plan.key === planKey)
}

