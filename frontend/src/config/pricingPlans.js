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

export const COUNTRIES = [
  {
    code: 'IN',
    name: 'India',
    flag: '🇮🇳',
    currency: 'INR',
    symbol: '₹',
    rate: 83,
    taxName: 'GST (18%)',
    taxRate: 18,
    hasStates: true,
    states: [
      'Tamil Nadu', 'Maharashtra', 'Karnataka', 'Delhi', 'Telangana',
      'Gujarat', 'Kerala', 'Uttar Pradesh', 'West Bengal', 'Andhra Pradesh',
      'Rajasthan', 'Punjab', 'Haryana', 'Madhya Pradesh', 'Bihar', 'Other State'
    ]
  },
  {
    code: 'US',
    name: 'United States',
    flag: '🇺🇸',
    currency: 'USD',
    symbol: '$',
    rate: 1,
    taxName: 'Sales Tax (8.25%)',
    taxRate: 8.25,
    hasStates: false,
  },
  {
    code: 'AE',
    name: 'United Arab Emirates',
    flag: '🇦🇪',
    currency: 'AED',
    symbol: 'AED ',
    rate: 3.67,
    taxName: 'VAT (5%)',
    taxRate: 5,
    hasStates: false,
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    flag: '🇬🇧',
    currency: 'GBP',
    symbol: '£',
    rate: 0.79,
    taxName: 'VAT (20%)',
    taxRate: 20,
    hasStates: false,
  },
  {
    code: 'EU',
    name: 'Europe (EU)',
    flag: '🇪🇺',
    currency: 'EUR',
    symbol: '€',
    rate: 0.92,
    taxName: 'VAT (20%)',
    taxRate: 20,
    hasStates: false,
  },
  {
    code: 'AU',
    name: 'Australia',
    flag: '🇦🇺',
    currency: 'AUD',
    symbol: 'A$',
    rate: 1.52,
    taxName: 'GST (10%)',
    taxRate: 10,
    hasStates: false,
  },
  {
    code: 'CA',
    name: 'Canada',
    flag: '🇨🇦',
    currency: 'CAD',
    symbol: 'C$',
    rate: 1.36,
    taxName: 'GST/HST (13%)',
    taxRate: 13,
    hasStates: false,
  },
  {
    code: 'SG',
    name: 'Singapore',
    flag: '🇸🇬',
    currency: 'SGD',
    symbol: 'S$',
    rate: 1.35,
    taxName: 'GST (9%)',
    taxRate: 9,
    hasStates: false,
  },
  {
    code: 'SA',
    name: 'Saudi Arabia',
    flag: '🇸🇦',
    currency: 'SAR',
    symbol: 'SAR ',
    rate: 3.75,
    taxName: 'VAT (15%)',
    taxRate: 15,
    hasStates: false,
  },
]

export function detectUserCountry() {
  try {
    const tz = typeof window !== 'undefined' && Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || ''
    const lang = typeof navigator !== 'undefined' && navigator?.language || ''
    if (tz.includes('Kolkata') || tz.includes('Calcutta') || tz.includes('India') || lang.endsWith('-IN')) {
      return 'IN'
    }
    if (tz.includes('Dubai') || tz.includes('Muscat') || lang.endsWith('-AE')) {
      return 'AE'
    }
    if (tz.includes('London') || lang.endsWith('-GB')) {
      return 'GB'
    }
    if (tz.includes('Europe') || tz.includes('Paris') || tz.includes('Berlin')) {
      return 'EU'
    }
    if (tz.includes('Sydney') || tz.includes('Melbourne') || lang.endsWith('-AU')) {
      return 'AU'
    }
    if (tz.includes('Toronto') || tz.includes('Vancouver') || lang.endsWith('-CA')) {
      return 'CA'
    }
  } catch (e) {
    // fallback
  }
  return 'US'
}

export function formatUsd(value) {
  return formatCurrencyAmount(value, 'US')
}

export function formatPrice(usdAmount, countryCode = 'IN') {
  const country = COUNTRIES.find(c => c.code === countryCode) || COUNTRIES[0]
  const amount = usdAmount * country.rate
  return formatCurrencyAmount(amount, countryCode)
}

export function formatCurrencyAmount(amount, countryCode = 'IN') {
  const country = COUNTRIES.find(c => c.code === countryCode) || COUNTRIES[0]
  return new Intl.NumberFormat(country.code === 'IN' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency: country.currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount)
}

export function calculatePriceDetails(usdAmount, countryCode = 'IN', stateName = 'Tamil Nadu') {
  const country = COUNTRIES.find(c => c.code === countryCode) || COUNTRIES[0]
  const baseAmount = usdAmount * country.rate
  const taxRate = country.taxRate
  const taxAmount = (baseAmount * taxRate) / 100
  const totalAmount = baseAmount + taxAmount

  let taxBreakdown = []
  if (country.code === 'IN') {
    const halfTax = taxAmount / 2
    if (stateName === 'Tamil Nadu' || !stateName) {
      taxBreakdown = [
        { label: 'CGST (9%)', amount: halfTax },
        { label: 'SGST (9%)', amount: halfTax },
      ]
    } else {
      taxBreakdown = [
        { label: 'IGST (18%)', amount: taxAmount },
      ]
    }
  } else {
    taxBreakdown = [
      { label: country.taxName, amount: taxAmount },
    ]
  }

  return {
    country,
    countryCode: country.code,
    currency: country.currency,
    currencySymbol: country.symbol,
    baseAmount,
    taxRate,
    taxAmount,
    totalAmount,
    taxName: country.taxName,
    taxBreakdown,
    stateName,
  }
}

export function getPlanByKey(planKey) {
  return SUBSCRIPTION_PLANS.find(plan => plan.key === planKey)
}


