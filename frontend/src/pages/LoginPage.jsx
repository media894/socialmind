import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  BarChart3,
  Calendar,
  ChevronDown,
  Check,
  Globe2,
  Play,
  Video,
  X,
  Zap,
} from 'lucide-react'
import EmailOtpAuth from '@/components/auth/EmailOtpAuth'
import PricingSection from '@/components/PricingSection'

const FEATURES = [
  { icon: Video, label: 'AI Video Creation', desc: 'Script, voiceover and footage, fully automated' },
  { icon: Calendar, label: 'Smart Scheduling', desc: 'Set once, publish everywhere on time' },
  { icon: BarChart3, label: 'Live Analytics', desc: 'Real-time stats across all platforms' },
  { icon: Globe2, label: 'Multi-Platform', desc: 'YouTube, Instagram, LinkedIn and more' },
]

const ODD_SERVICES = [
  'Embroidery digitizing',
  'Vector artwork conversion',
  'Image editing and retouching',
  'Graphic and logo design',
  'eCommerce support',
  'Live chat support',
]

const NAV_MENUS = {
  Products: [
    { title: 'AI Video Studio', desc: 'Create scripts, voiceovers, and short videos from one brief.' },
    { title: 'Scheduling Calendar', desc: 'Plan and publish posts across every connected account.' },
    { title: 'Analytics Hub', desc: 'Track views, likes, shares, and platform performance live.' },
  ],
  Integrations: [
    { title: 'YouTube Shorts', desc: 'Publish generated short-form videos to your channel.' },
    { title: 'Instagram & Facebook', desc: 'Connect Meta pages and business accounts for posting.' },
    { title: 'LinkedIn Pages', desc: 'Share brand content and monitor professional activity.' },
  ],
  Industries: [
    { title: 'eCommerce', desc: 'Turn product details into ready-to-post social videos.' },
    { title: 'Agencies', desc: 'Manage repeatable content workflows for multiple clients.' },
    { title: 'Local Businesses', desc: 'Promote offers, services, and updates without editing work.' },
  ],
  Resources: [
    { title: 'How It Works', desc: 'See the full workflow from account setup to publishing.' },
    { title: 'Support Center', desc: 'Get help with social tokens, scheduling, and analytics.' },
    { title: 'Best Practices', desc: 'Improve captions, timing, and platform-specific content.' },
  ],
  Pricing: [
    { title: 'Standard', desc: 'Start with video creation, scheduling, and core analytics.' },
    { title: 'Advanced', desc: 'Scale with bulk scheduling and richer reporting tools.' },
    { title: 'Enterprise', desc: 'Custom workflows, priority support, and team features.' },
  ],
}

const PLANS = [
  {
    name: 'Standard',
    price: '$23',
    button: 'Free 30-day trial',
    features: [
      'Up to 10 social accounts',
      'Unlimited post scheduling',
      'Best time to post recommendations',
      'AI assistant with image and caption generator',
    ],
  },
  {
    name: 'Advanced',
    price: '$90',
    highlight: true,
    button: 'Free 30-day trial',
    features: [
      'Unlimited social accounts',
      'Customizable analytics reports and templates',
      'Saved message replies and auto-responses',
      'Bulk schedule up to 350 posts at once',
    ],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    button: 'Request a Demo',
    features: [
      'A fully customized plan to maximize your investment',
      'Add as many users as you need',
      'Exclusive access to our most powerful tools',
      'Enterprise customer support',
      'Single sign-on (SSO)',
    ],
  },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()

  // URL params from Google OAuth redirects
  const urlParams = new URLSearchParams(location.search)
  const googleEmailParam = urlParams.get('google_email') || ''    // new user signup prefill
  const googleVerifiedEmail = urlParams.get('google_verified') || '' // existing user — ask password
  const actionParam = urlParams.get('action') || ''

  const [showForm, setShowForm] = useState(() => {
    return actionParam === 'signup' || actionParam === 'login' || !!googleEmailParam || !!googleVerifiedEmail
  })
  const [mode, setMode] = useState(() => {
    return (actionParam === 'signup' || googleEmailParam) ? 'register' : 'login'
  })
  const [plansOpen, setPlansOpen] = useState(false)
  const [activeMenu, setActiveMenu] = useState(null)
  const [termsOpen, setTermsOpen] = useState(false)

  const openLogin = () => { setMode('login'); setShowForm(true) }
  const openRegister = () => { setMode('register'); setShowForm(true) }

  return (
    <div className="min-h-screen bg-[#080618] text-white flex flex-col">
      <style>{`
        @keyframes fade-up { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ticker-scroll { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes orb-drift { 0%,100%{transform:translateY(0px) scale(1)} 50%{transform:translateY(-22px) scale(1.04)} }
        @keyframes beam-pulse { 0%,100%{opacity:0.18} 50%{opacity:0.32} }
        .fu1{animation:fade-up 0.7s 0s cubic-bezier(.22,.68,0,1.2) both}
        .fu2{animation:fade-up 0.7s 0.12s cubic-bezier(.22,.68,0,1.2) both}
        .fu3{animation:fade-up 0.7s 0.24s cubic-bezier(.22,.68,0,1.2) both}
        .fu4{animation:fade-up 0.7s 0.38s cubic-bezier(.22,.68,0,1.2) both}
        .ticker-track{display:flex;width:max-content;animation:ticker-scroll 32s linear infinite}
        .orb-bg{position:absolute;border-radius:9999px;filter:blur(90px);pointer-events:none;animation:orb-drift 9s ease-in-out infinite}
        .orb-bg-2{animation-delay:-4s}
        .hero-beam{position:absolute;left:50%;top:0;transform:translateX(-50%);width:600px;height:400px;pointer-events:none;background:radial-gradient(ellipse at 50% 0%,rgba(99,73,255,0.18) 0%,transparent 70%);animation:beam-pulse 5s ease-in-out infinite}
        .card-hover:hover{box-shadow:0 0 0 1px rgba(99,73,255,0.25),0 8px 32px rgba(99,73,255,0.12)}
        .grad-text{background:linear-gradient(135deg,#a78bfa 0%,#818cf8 50%,#60a5fa 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .btn-glow:hover{box-shadow:0 0 0 3px rgba(99,73,255,0.25),0 8px 32px rgba(99,73,255,0.45)}
        .ticker-icon{display:inline-flex;align-items:center;gap:6px;color:rgba(255,255,255,0.5)}
      `}</style>

      <header className="sticky top-0 z-40 border-b border-white/[0.07] backdrop-blur-xl" style={{ background: 'rgba(8,6,24,0.85)' }}>
        <div className="h-[1.5px]" style={{ background: 'linear-gradient(90deg,transparent 0%,rgba(99,73,255,0.6) 30%,rgba(139,92,246,0.7) 60%,transparent 100%)' }} />
        <div className="relative max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <div className="flex items-center gap-2.5 shrink-0 order-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg,#6349ff,#8b5cf6)', boxShadow: '0 4px 20px rgba(99,73,255,0.45)' }}>
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">SocialMind</span>
          </div>

          <nav className="hidden md:flex items-center justify-center gap-2 text-sm text-white/55 font-medium order-2 flex-1">
            {Object.keys(NAV_MENUS).map(label => (
              <div
                key={label}
                className="relative"
                onMouseEnter={() => setActiveMenu(label)}
                onMouseLeave={() => setActiveMenu(null)}
              >
                <button
                  type="button"
                  onClick={label === 'Pricing' ? () => setPlansOpen(true) : undefined}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 hover:bg-white/[0.06] hover:text-white transition"
                >
                  {label}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${activeMenu === label ? 'rotate-180' : ''}`} />
                </button>
                {activeMenu === label && (
                  <div className="absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-2xl border border-white/10 bg-[#100d27]/95 p-2 text-left shadow-2xl shadow-black/40 backdrop-blur-xl">
                    {NAV_MENUS[label].map(item => (
                      <button
                        key={item.title}
                        type="button"
                        onClick={() => {
                          setActiveMenu(null)
                          if (label === 'Pricing') setPlansOpen(true)
                        }}
                        className="block w-full rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.06]"
                      >
                        <span className="block text-sm font-bold text-white">{item.title}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-white/45">{item.desc}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>

          <div className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 flex items-center justify-end gap-3 shrink-0 order-3">
            <button onClick={openLogin} className="hidden sm:block px-3 py-2 text-sm font-semibold text-white/70 hover:text-white transition">
              Log in
            </button>
            <button onClick={openRegister} className="px-4 sm:px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm transition shadow-lg shadow-brand-900/30">
              Sign up
            </button>
          </div>
        </div>
      </header>

      <main className="relative flex-1 min-h-[620px] flex items-center justify-center text-center px-6 py-24 overflow-hidden">
        <div className="orb-bg w-[560px] h-[560px] top-[-14%] left-[6%]" style={{ background: 'rgba(99,73,255,0.13)' }} />
        <div className="orb-bg orb-bg-2 w-[400px] h-[400px] bottom-[2%] right-[6%]" style={{ background: 'rgba(139,92,246,0.1)' }} />
        <div className="orb-bg w-[260px] h-[260px] top-[20%] right-[15%]" style={{ background: 'rgba(56,189,248,0.07)', animationDelay: '-2s' }} />
        <div className="hero-beam" />
        <div
          className="absolute inset-0 opacity-[0.022]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />

        <div className="relative z-10 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-brand-500/30 mb-8 fu1" style={{ background: 'rgba(99,73,255,0.1)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
            <span className="text-brand-300 text-xs font-bold uppercase tracking-[0.22em]">AI-Powered Social Media Automation</span>
          </div>

          <h1 className="text-5xl md:text-6xl xl:text-7xl font-extrabold text-white leading-[1.06] mb-8 fu2 tracking-tight">
            Drive <span className="grad-text italic">real</span> social impact<br />
            with the world's deepest<br />
            <span className="grad-text">AI video platform</span>
          </h1>

          <p className="text-white/40 text-lg md:text-xl leading-relaxed max-w-2xl mx-auto mb-12 fu3">
            SocialMind uses AI to write scripts, generate voiceovers, and produce short-form videos, then schedules and publishes them to all your social accounts automatically.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap fu4">
            <button
              onClick={() => setPlansOpen(true)}
              className="btn-glow px-8 py-4 rounded-xl text-white font-bold text-base transition-all duration-200 active:scale-95"
              style={{ background: 'linear-gradient(135deg,#6349ff 0%,#8b5cf6 100%)', boxShadow: '0 6px 28px rgba(99,73,255,0.45)' }}
            >
              Start your free demo
            </button>
            <button
              onClick={openLogin}
              className="px-8 py-4 rounded-xl border border-white/15 hover:border-white/35 text-white/65 hover:text-white font-semibold text-base transition-all duration-200 hover:bg-white/[0.04]"
            >
              Log in →
            </button>
          </div>

          <div className="flex items-center justify-center gap-6 mt-10 fu4">
            {['No credit card', 'Free 30-day trial', 'Cancel anytime'].map(text => (
              <div key={text} className="flex items-center gap-1.5 text-xs text-white/30 font-medium">
                <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                {text}
              </div>
            ))}
          </div>
        </div>
      </main>

      <div className="border-t border-white/[0.07] py-3 overflow-hidden" style={{ background: 'linear-gradient(90deg,rgba(99,73,255,0.08) 0%,rgba(139,92,246,0.06) 50%,rgba(99,73,255,0.08) 100%)' }}>
        <div className="flex items-center gap-4">
          <div className="shrink-0 flex items-center gap-2 pl-6 pr-5 border-r border-white/[0.09]">
            <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" style={{ boxShadow: '0 0 6px rgba(139,92,246,0.8)' }} />
            <span className="text-[11px] font-black text-brand-300/80 uppercase tracking-[0.22em] whitespace-nowrap">Live Features</span>
          </div>
          <div className="overflow-hidden flex-1">
            <div className="ticker-track">
              {[...FEATURES, ...FEATURES, ...FEATURES, ...FEATURES].map((feature, index) => {
                const Icon = feature.icon
                return (
                  <span key={`${feature.label}-${index}`} className="ticker-icon whitespace-nowrap mx-8 text-xs font-medium">
                    <Icon className="w-3.5 h-3.5 text-brand-400/60 flex-shrink-0" />
                    {feature.label}
                    <span className="ml-8 text-white/10">✦</span>
                  </span>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <section className="border-t border-white/[0.05] py-16 px-6" style={{ background: 'linear-gradient(180deg,rgba(8,6,24,0) 0%,rgba(12,10,32,1) 100%)' }}>
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.25em] text-white/25 mb-8">
            Everything you need to grow on social
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon
              const gradients = [
                'linear-gradient(135deg,rgba(99,73,255,0.22),rgba(139,92,246,0.12))',
                'linear-gradient(135deg,rgba(59,130,246,0.22),rgba(99,73,255,0.12))',
                'linear-gradient(135deg,rgba(16,185,129,0.22),rgba(59,130,246,0.12))',
                'linear-gradient(135deg,rgba(245,158,11,0.22),rgba(16,185,129,0.12))',
              ]
              const iconColors = ['text-violet-400', 'text-blue-400', 'text-emerald-400', 'text-amber-400']
              return (
                <div key={feature.label} className="card-hover rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6 hover:border-white/[0.14] transition-all duration-250">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-5" style={{ background: gradients[index] }}>
                    <Icon className={`w-5 h-5 ${iconColors[index]}`} />
                  </div>
                  <div className="text-sm font-bold text-white mb-2">{feature.label}</div>
                  <div className="text-xs text-white/38 leading-relaxed">{feature.desc}</div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.06]" style={{ background: 'linear-gradient(180deg,rgb(12,10,32) 0%,rgb(6,5,16) 100%)' }}>
        <div className="h-px w-full" style={{ background: 'linear-gradient(90deg,transparent 0%,rgba(99,73,255,0.55) 35%,rgba(139,92,246,0.55) 65%,transparent 100%)' }} />
        <div className="max-w-5xl mx-auto px-6 py-12">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div className="max-w-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/80 mb-3">Service Provided By</p>
                <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Odd Infotech powers SocialMind</h2>
                <p className="mt-4 text-sm md:text-base text-white/50 leading-relaxed">
                  SocialMind is provided and maintained by Odd Infotech, a creative production and business support service provider. Their team helps brands prepare digital-ready assets, improve product visuals, create brand graphics, convert artwork for embroidery, and support online business operations.
                </p>
              </div>

              <a href="https://oddinfotech.com" target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-5 py-4 hover:bg-white/[0.06] hover:border-white/[0.14] transition-all duration-200">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: '#fff', boxShadow: '0 4px 18px rgba(14,165,233,0.25)' }}>
                  <img src="https://oddinfotech.com/wp-content/uploads/2025/08/odd-infotech-logo.webp" alt="Odd Infotech Logo" className="w-10 h-10 object-contain" />
                </div>
                <div className="text-left">
                  <div className="text-base font-extrabold text-white tracking-tight group-hover:text-blue-300 transition-colors">Odd Infotech</div>
                  <div className="text-[11px] text-white/35 font-medium">oddinfotech.com</div>
                </div>
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-7">
              {ODD_SERVICES.map(service => (
                <div key={service} className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-sm font-semibold text-white/75">
                  <Check className="mr-2 inline h-4 w-4 text-emerald-400" />
                  {service}
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="hidden lg:block" />
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-sm font-semibold text-white/75">
                <Check className="mr-2 inline h-4 w-4 text-emerald-400" />
                AI/ML as a Service
              </div>
              <div className="hidden lg:block" />
            </div>
          </div>

          <div className="w-full mt-8 pt-4 border-t border-white/[0.05] flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-white/20">
            <span>© {new Date().getFullYear()} Odd Infotech. All rights reserved.</span>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setTermsOpen(true)}
                className="text-white/35 hover:text-white/60 underline underline-offset-2 transition-colors"
              >
                Terms &amp; Conditions
              </button>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-400/60 font-medium">All systems operational</span>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* ── Terms & Conditions Modal ── */}
      {termsOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setTermsOpen(false)}
        >
          <div className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#0d0d18] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07]">
              <h2 className="text-base font-semibold text-white">Terms &amp; Conditions</h2>
              <button
                type="button"
                onClick={() => setTermsOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-8 flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                <Zap className="w-7 h-7 text-brand-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg">Coming Soon</h3>
                <p className="mt-2 text-sm text-white/45 leading-relaxed max-w-sm">
                  Our Terms &amp; Conditions are being finalized. Please check back soon or contact us at{' '}
                  <a href="mailto:support@oddinfotech.com" className="text-brand-300 hover:text-brand-200 transition-colors">
                    support@oddinfotech.com
                  </a>{' '}
                  for any questions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTermsOpen(false)}
                className="mt-2 px-6 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-400 transition"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {plansOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-start justify-center p-4 md:p-10 overflow-y-auto"
          onClick={event => event.target === event.currentTarget && setPlansOpen(false)}
        >
          <div className="w-full max-w-5xl rounded-[28px] border border-white/10 bg-[#080618] shadow-2xl overflow-hidden">
            <PricingSection
              onClose={() => setPlansOpen(false)}
              onStartTrial={() => {
                setPlansOpen(false)
                openRegister()
              }}
              onContactSales={() => {
                setPlansOpen(false)
                openRegister()
              }}
              onViewDemo={() => {
                setPlansOpen(false)
                openLogin()
              }}
            />
          </div>
        </div>
      )}

      {false && plansOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto" onClick={event => event.target === event.currentTarget && setPlansOpen(false)}>
          <div className="w-full max-w-6xl rounded-[28px] border border-white/10 bg-[#f7f7f3] text-slate-900 shadow-2xl overflow-hidden">
            <div className="bg-white px-6 md:px-10 py-6 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-500 mb-2">Plans</p>
                <h2 className="text-2xl md:text-4xl font-extrabold text-slate-900 tracking-tight">Pick the plan that's right for you</h2>
              </div>
              <button type="button" onClick={() => setPlansOpen(false)} className="w-10 h-10 rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:border-slate-300 transition flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 md:px-10 py-10 bg-[#f7f7f3]">
              <p className="text-center text-slate-600 text-base md:text-lg mb-10">Manage all of your social media in one place.</p>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {PLANS.map(plan => (
                  <div key={plan.name} className={`rounded-2xl border bg-white overflow-hidden ${plan.highlight ? 'border-red-500 shadow-[0_16px_50px_rgba(220,38,38,0.12)]' : 'border-slate-800/90'}`}>
                    {plan.highlight && <div className="bg-red-600 text-white text-sm font-bold text-center py-3">Most popular</div>}
                    <div className="p-6 md:p-7">
                      <h3 className="text-3xl font-extrabold text-slate-900 leading-none mb-2">{plan.name}</h3>
                      <div className="flex items-end gap-2 mb-8">
                        <span className="text-3xl md:text-4xl font-extrabold text-slate-900">{plan.price}</span>
                        {plan.name !== 'Enterprise' && <span className="text-sm font-semibold text-slate-700 pb-1">per user/mo*</span>}
                      </div>
                      <button type="button" onClick={() => { setPlansOpen(false); openRegister() }} className="w-full h-14 rounded-lg font-extrabold text-white transition-colors bg-[#04364a] hover:bg-[#032b3b]">
                        {plan.button}
                      </button>
                      <div className="mt-8 text-slate-900 font-bold">
                        {plan.name === 'Standard' ? 'Features included:' : plan.name === 'Advanced' ? 'Everything in Standard, PLUS:' : 'Everything in Advanced, PLUS:'}
                      </div>
                      <div className="mt-5 space-y-5">
                        {plan.features.map(feature => (
                          <div key={feature} className="flex items-start gap-3 text-slate-800">
                            <span className="text-red-500 text-2xl leading-none mt-[-2px]">✓</span>
                            <span className="text-sm md:text-base leading-relaxed">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4" onClick={event => event.target === event.currentTarget && setShowForm(false)}>
          <div className="w-full max-w-md rounded-2xl max-h-[92vh] flex flex-col overflow-hidden" style={{ background: 'linear-gradient(170deg,rgb(14,12,30) 0%,rgb(9,9,27) 100%)', border: '1px solid rgba(99,73,255,0.15)', boxShadow: '0 0 0 1px rgba(99,73,255,0.08), 0 32px 90px rgba(0,0,0,0.8), 0 0 60px rgba(99,73,255,0.08)' }}>
            <div className="h-[2px] shrink-0" style={{ background: 'linear-gradient(90deg,transparent 0%,#6349ff 35%,#8b5cf6 65%,transparent 100%)' }} />
            <div className="flex items-center justify-between px-6 py-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg,#6349ff,#8b5cf6)', boxShadow: '0 3px 12px rgba(99,73,255,0.5)' }}>
                  <Zap className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-sm font-bold text-white tracking-tight">SocialMind</span>
              </div>
              <button onClick={() => setShowForm(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="h-px bg-white/[0.05] shrink-0" />
            <div className="overflow-y-auto flex-1 px-6 py-6">
              <EmailOtpAuth
                mode={mode}
                variant="embedded"
                prefillEmail={googleEmailParam}
                googleVerifiedEmail={googleVerifiedEmail}
                onComplete={() => navigate('/dashboard')}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}