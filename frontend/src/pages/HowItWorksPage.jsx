import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Globe2,
  Key,
  Link2,
  Video,
  Zap,
} from 'lucide-react'

const STEPS = [
  {
    number: '01',
    icon: Link2,
    title: 'Connect Your Accounts',
    description:
      'You will need to fetch your own access tokens, page URIs, account IDs and account names from each platform\'s developer console and enter them in Settings → Social Accounts. SocialMind never stores passwords — only the tokens you provide.',
    color: 'text-brand-400',
    bg: 'bg-brand-500/10',
    border: 'border-brand-500/20',
    dot: 'bg-brand-500',
  },
  {
    number: '02',
    icon: Video,
    title: 'Create AI Videos',
    description:
      'Enter a brief. AI writes the script, sources footage, generates voiceover and produces a publish-ready short-form video automatically.',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    dot: 'bg-purple-500',
  },
  {
    number: '03',
    icon: Calendar,
    title: 'Schedule Publishing',
    description:
      'Choose exactly when your content goes live. Plan weeks ahead and let SocialMind handle the posting while you focus on your business.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    dot: 'bg-emerald-500',
  },
  {
    number: '04',
    icon: Globe2,
    title: 'Auto-Publish Everywhere',
    description:
      'Your video goes live on all platforms simultaneously — YouTube Shorts, Instagram Reels, Facebook and LinkedIn.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    dot: 'bg-amber-500',
  },
  {
    number: '05',
    icon: BarChart3,
    title: 'Track & Optimize',
    description:
      'Monitor real-time analytics — views, likes, comments and shares — for every post across every platform from one dashboard.',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    dot: 'bg-rose-500',
  },
]

const FAQS = [
  { q: 'How many platforms are supported?', a: 'YouTube Shorts, Instagram Reels, Facebook and LinkedIn — all from one workspace.' },
  { q: 'Do I need video editing skills?', a: 'No. AI handles scripting, voiceover, and video production. Just write a brief describing what you want.' },
  { q: 'How many videos per month?', a: 'Up to 50 videos per month on the standard plan. Your first account in a network gets 50 videos.' },
  { q: 'Can I schedule content in advance?', a: 'Yes. Set your publishing calendar weeks ahead and SocialMind publishes automatically at the right time.' },
  { q: 'Do I need developer accounts to connect platforms?', a: 'Yes. You must create an app on each platform\'s developer console, generate an access token, and copy your page/channel ID and account name into Settings → Social Accounts.' },
]

const PLATFORM_GUIDES = [
  {
    name: 'YouTube',
    color: '#ff0000',
    steps: [
      'Go to console.cloud.google.com → Create a project.',
      'Enable the YouTube Data API v3 from the API Library.',
      'Go to Credentials → Create OAuth 2.0 Client ID (Web application). Add your redirect URI.',
      'Use OAuth Playground or your app\'s OAuth flow to get an Access Token and Refresh Token.',
      'Find your Channel ID: youtube.com → your profile → Settings → Advanced → Channel ID.',
      'In SocialMind Settings → Social Accounts: enter Account Name (your channel name), Account ID (Channel ID), and Access Token.',
    ],
  },
  {
    name: 'LinkedIn',
    color: '#0077b5',
    steps: [
      'Go to linkedin.com/developers → Create App. Fill in your company page and app details.',
      'Under Products, request access to "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect".',
      'Go to Auth tab → copy Client ID and Client Secret. Add your redirect URI.',
      'Use the OAuth 2.0 Authorization Code flow to get an Access Token (valid 60 days).',
      'Find your Organization ID: go to your LinkedIn Company Page URL — the number after /company/ is your Org ID. Format it as urn:li:organization:YOUR_ID.',
      'In SocialMind: Account Name = company page name, Account ID = the urn:li:organization:... URN, Access Token = your OAuth token.',
    ],
  },
  {
    name: 'Facebook / Instagram',
    color: '#1877f2',
    steps: [
      'Go to developers.facebook.com → My Apps → Create App. Choose "Business" type.',
      'Add products: Facebook Login and Pages API (for Facebook) or Instagram Graph API (for Instagram Reels).',
      'Go to Tools → Graph API Explorer. Select your app, choose "Get User Access Token", add permissions: pages_manage_posts, pages_read_engagement, instagram_content_publish.',
      'Click "Generate Access Token" and then exchange it for a Long-Lived Token (valid 60 days) via the token debug tool.',
      'Find your Page ID: go to your Facebook Page → About → Page Transparency section, or use the Graph API Explorer to call /me/accounts.',
      'For Instagram: link your Instagram Business account to the Facebook Page first. Your Instagram Account ID appears in /me/accounts response.',
      'In SocialMind: Account Name = page name, Account ID = Page ID or Instagram Account ID, Access Token = long-lived token.',
    ],
  },
]

function ConnectGuide() {
  const [open, setOpen] = useState(null)
  return (
    <div className="mb-10">
      <h2 className="text-sm font-semibold text-white/50 uppercase tracking-[0.18em] mb-1 flex items-center gap-2">
        <Key className="w-3.5 h-3.5 text-brand-400" /> How to Get Your Access Tokens
      </h2>
      <p className="text-xs text-white/35 mb-4 leading-relaxed">
        SocialMind does not log in on your behalf. You must fetch your own access token, account ID and account name from each platform's developer console and paste them into <strong className="text-white/60">Settings → Social Accounts</strong>.
      </p>
      <div className="space-y-3">
        {PLATFORM_GUIDES.map(p => (
          <div key={p.name} className="rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen(open === p.name ? null : p.name)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.04] transition"
            >
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                <span className="text-sm font-semibold text-white">{p.name}</span>
              </div>
              <ChevronRight className={`w-4 h-4 text-white/30 transition-transform ${open === p.name ? 'rotate-90' : ''}`} />
            </button>
            {open === p.name && (
              <ol className="px-4 pb-4 space-y-2 border-t border-white/[0.06] pt-3">
                {p.steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-xs text-white/50 leading-relaxed">
                    <span className="shrink-0 w-5 h-5 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-[10px] font-bold text-white/40 mt-0.5">{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function useInView(threshold = 0.15) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { threshold }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])
  return [ref, visible]
}

function StepCard({ step, index }) {
  const [ref, visible] = useInView()
  const Icon = step.icon
  const isLast = index === STEPS.length - 1

  return (
    <div
      ref={ref}
      className="flex gap-5"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 0.6s ease ${index * 110}ms, transform 0.6s ease ${index * 110}ms`,
      }}
    >
      {/* Icon + connector */}
      <div className="flex flex-col items-center">
        <div className={`w-12 h-12 rounded-2xl border ${step.border} ${step.bg} flex items-center justify-center shrink-0 shadow-lg`}>
          <Icon className={`w-5 h-5 ${step.color}`} />
        </div>
        {!isLast && (
          <div className="w-px flex-1 mt-3 min-h-[48px] bg-gradient-to-b from-white/15 to-transparent" />
        )}
      </div>

      {/* Content */}
      <div className="pb-12">
        <div className={`text-[10px] font-bold tracking-[0.22em] uppercase ${step.color} mb-1.5`}>
          Step {step.number}
        </div>
        <h3 className="text-base font-bold text-white mb-2">{step.title}</h3>
        <p className="text-white/45 text-sm leading-relaxed max-w-lg">{step.description}</p>
      </div>
    </div>
  )
}

function DoneCta({ onNavigate }) {
  const [ref, visible] = useInView()
  return (
    <div
      ref={ref}
      className="rounded-2xl border border-brand-500/20 bg-gradient-to-br from-brand-500/[0.08] to-purple-500/[0.05] p-8 text-center mb-10"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
      }}
    >
      <div className="w-14 h-14 rounded-2xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center mx-auto mb-5 float-slow pulse-glow">
        <CheckCircle2 className="w-7 h-7 text-brand-400" />
      </div>
      <h3 className="text-lg font-bold text-white mb-2">You're ready to go!</h3>
      <p className="text-white/40 text-sm mb-6 max-w-sm mx-auto leading-relaxed">
        Head to the dashboard to create your first video and start building your content schedule.
      </p>
      <button
        onClick={onNavigate}
        className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm transition-all shadow-lg shadow-brand-900/40 hover:shadow-brand-900/60"
      >
        Go to Dashboard <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  )
}

function FaqCard({ item, index }) {
  const [ref, visible] = useInView()
  return (
    <div
      ref={ref}
      className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 hover:border-white/[0.13] hover:bg-white/[0.05] transition-all duration-200"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        transition: `opacity 0.5s ease ${index * 80}ms, transform 0.5s ease ${index * 80}ms`,
      }}
    >
      <div className="flex items-start gap-2.5 mb-2">
        <ChevronRight className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
        <span className="text-sm font-semibold text-white">{item.q}</span>
      </div>
      <p className="text-white/40 text-xs leading-relaxed pl-6">{item.a}</p>
    </div>
  )
}

export default function HowItWorksPage() {
  const navigate = useNavigate()
  const [heroVisible, setHeroVisible] = useState(false)

  useEffect(() => {
    localStorage.setItem('sm_visited_howto', '1')
    const t = setTimeout(() => setHeroVisible(true), 80)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="min-h-full bg-surface">
      <style>{`
        @keyframes float-slow { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-10px);} }
        @keyframes pulse-glow { 0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,0.25);} 50%{box-shadow:0 0 0 12px rgba(99,102,241,0);} }
        .float-slow { animation: float-slow 5s ease-in-out infinite; }
        .pulse-glow { animation: pulse-glow 2.5s ease-in-out infinite; }
      `}</style>

      {/* ── Hero ── */}
      <div className="relative overflow-hidden border-b border-white/[0.06] px-6 py-16 text-center">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[280px] bg-brand-600/10 rounded-full blur-3xl" />
        </div>

        <div
          className="relative max-w-2xl mx-auto"
          style={{
            opacity: heroVisible ? 1 : 0,
            transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
            transition: 'opacity 0.65s ease, transform 0.65s ease',
          }}
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4 leading-tight tracking-tight">
            How SocialMind Works
          </h1>
          <p className="text-white/45 text-base leading-relaxed max-w-lg mx-auto">
            From creating your first AI video to publishing across all platforms and tracking results — here's the full workflow.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 pt-12 pb-16">

        {/* ── Steps ── */}
        <div className="mb-6">
          {STEPS.map((step, i) => (
            <StepCard key={step.number} step={step} index={i} />
          ))}
        </div>

        {/* ── Account connection guide ── */}
        <ConnectGuide />

        {/* ── Done CTA ── */}
        <DoneCta onNavigate={() => navigate('/dashboard')} />

        {/* ── FAQ ── */}
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-[0.18em] mb-4 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-brand-400" /> Common Questions
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {FAQS.map((item, i) => (
              <FaqCard key={item.q} item={item} index={i} />
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
