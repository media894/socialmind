import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ShieldCheck,
  Zap,
  Brain,
  BarChart3,
  CalendarClock,
  Share2,
  ArrowRight,
  CheckCircle2,
  Video,
  Globe,
  TrendingUp,
  Play,
  Sparkles,
  Maximize2,
  X,
} from 'lucide-react'

import EmailOtpAuth from '@/components/auth/EmailOtpAuth'
import PricingModal from '@/components/PricingModal'

const FEATURES = [
  {
    icon: Video,
    title: 'AI-Powered Video Creation',
    description:
      'Generate polished social-media videos from prompts or scripts. SocialMind handles voiceover, subtitles, and visual composition automatically.',
  },
  {
    icon: CalendarClock,
    title: 'Intelligent Scheduling',
    description:
      'Plan your entire content calendar in one place. Queue posts across multiple platforms and let SocialMind publish them at the optimal time.',
  },
  {
    icon: Share2,
    title: 'Multi-Platform Publishing',
    description:
      'Connect your social accounts and distribute content simultaneously to every channel - no copy-pasting, no missed platforms.',
  },
  {
    icon: BarChart3,
    title: 'Unified Analytics',
    description:
      'Track views, likes, and shares across all platforms from a single dashboard. Turn data into decisions with clarity.',
  },
]

export default function LandingPage() {
  const navigate = useNavigate()
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [plansOpen, setPlansOpen] = useState(false)
  const [videoModalOpen, setVideoModalOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const videoRef = useRef(null)

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-surface/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-bold text-white tracking-tight">SocialMind</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-white/50">
            <a href="#features" className="hover:text-white/80 transition-colors">
              Features
            </a>
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="hover:text-white/80 transition-colors"
            >
              Sign In
            </button>
            <Link to="/register" className="btn-primary px-5 py-2 text-sm">
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden py-24 md:py-36">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full border border-brand-500/[0.07]"
                style={{
                  width: `${260 + i * 140}px`,
                  height: `${260 + i * 140}px`,
                }}
              />
            ))}
          </div>
          <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-brand-600/[0.06] blur-3xl" />

          <div className="relative max-w-4xl mx-auto px-6 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-500/25 bg-brand-500/10 text-brand-400 text-xs font-medium tracking-widest uppercase mb-8">
              <Brain className="w-3.5 h-3.5" />
              AI Social Media Platform
            </div>

            <h1 className="text-4xl md:text-6xl font-bold text-white leading-tight mb-6 tracking-tight">
              Create. Schedule.
              <br />
              <span className="text-brand-400">Publish.</span> Repeat.
            </h1>

            <p className="text-lg md:text-xl text-white/50 leading-relaxed max-w-2xl mx-auto mb-10">
              SocialMind is an end-to-end social media automation workspace. Generate AI-powered
              videos, schedule them across platforms, and monitor performance - all from a single,
              self-hosted dashboard.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setPlansOpen(true)}
                className="btn-primary inline-flex items-center gap-2 px-7 py-3 text-base"
              >
                Start your free demo
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode('login'); setAuthOpen(true) }}
                className="btn-ghost inline-flex items-center gap-2 px-7 py-3 text-base"
              >
                Request a demo
              </button>
            </div>

            {/* FRONT VIDEO SHOWCASE PLAYER */}
            <div className="mt-12 relative group max-w-4xl mx-auto text-left">
              <div className="absolute -inset-2 rounded-[2.5rem] bg-gradient-to-r from-brand-600 via-violet-600 to-indigo-600 opacity-40 blur-2xl group-hover:opacity-75 transition duration-500" />
              <div className="relative rounded-2xl md:rounded-3xl border border-white/20 bg-[#0d0a26]/95 backdrop-blur-2xl overflow-hidden shadow-[0_25px_70px_rgba(0,0,0,0.8)]">
                {/* Window Bar */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-white/[0.04]">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                    <span className="ml-3 text-xs font-bold text-white/80 tracking-wide flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-brand-400" />
                      SocialMind Platform Overview Demo Video
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-brand-500/20 text-brand-300 border border-brand-500/30">
                      <span className="w-2 h-2 rounded-full bg-brand-400 animate-ping" />
                      FEATURED VIDEO
                    </span>
                    <button
                      onClick={() => setVideoModalOpen(true)}
                      className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition"
                      title="Fullscreen View"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Video Player */}
                <div className="relative aspect-video w-full bg-black/90 group/player">
                  <video
                    ref={videoRef}
                    src="/demo-video.mp4"
                    controls
                    playsInline
                    preload="metadata"
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    className="w-full h-full object-cover rounded-b-2xl md:rounded-b-3xl"
                  />

                  {!isPlaying && (
                    <div
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.play()
                          setIsPlaying(true)
                        }
                      }}
                      className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 backdrop-blur-[3px] cursor-pointer transition-all duration-300 group-hover/player:bg-black/25"
                    >
                      <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-brand-600/90 hover:bg-brand-500 text-white flex items-center justify-center shadow-[0_0_60px_rgba(99,73,255,0.85)] hover:scale-110 transition-transform duration-300 border-2 border-white/40">
                        <Play className="w-10 h-10 md:w-12 md:h-12 ml-1.5 text-white fill-white" />
                      </div>
                      <p className="mt-4 text-base md:text-lg font-extrabold text-white tracking-wide">
                        Click to Watch Demo Video
                      </p>
                      <p className="mt-1 text-xs text-white/60 font-medium">
                        See SocialMind AI Video Automation in Action
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </section>

        <section id="features" className="py-20 border-t border-white/[0.06]">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-14">
              <p className="text-xs uppercase tracking-[0.2em] text-brand-400/80 font-medium mb-3">
                Platform Capabilities
              </p>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Everything your content workflow needs
              </h2>
              <p className="text-white/45 max-w-xl mx-auto">
                From creation to distribution and analytics, SocialMind covers every stage of your
                social media pipeline.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="glass-card p-6 rounded-2xl hover:border-brand-500/30 transition-colors duration-300 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-brand-600/15 border border-brand-500/20 flex items-center justify-center mb-4 group-hover:bg-brand-600/25 transition-colors">
                    <Icon className="w-5 h-5 text-brand-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-2">{title}</h3>
                  <p className="text-xs text-white/40 leading-relaxed">{description}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 glass-card rounded-2xl p-8 flex flex-col md:flex-row items-center gap-8">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-brand-400/80 font-medium mb-3">
                  <Globe className="w-3.5 h-3.5" />
                  Designed for Content Creators & Teams
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">Your creative command centre</h3>
                <p className="text-white/45 text-sm leading-relaxed">
                  SocialMind replaces a stack of disconnected tools with one cohesive workspace.
                  Whether you are an individual creator or a marketing team, the platform adapts to
                  your publishing volume and cadence - without compromising on control or privacy.
                </p>
              </div>
              <div className="flex-shrink-0 grid grid-cols-2 gap-3 w-full md:w-auto">
                {[
                  { icon: Video, label: 'AI Video', sub: 'Create & manage' },
                  { icon: CalendarClock, label: 'Scheduling', sub: 'Plan ahead' },
                  { icon: TrendingUp, label: 'Analytics', sub: 'Track growth' },
                  { icon: Share2, label: 'Publishing', sub: 'All platforms' },
                ].map(({ icon: Icon, label, sub }) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.07] px-4 py-3"
                  >
                    <Icon className="w-4 h-4 text-brand-400 flex-shrink-0" />
                    <div>
                      <div className="text-xs font-medium text-white">{label}</div>
                      <div className="text-[10px] text-white/35">{sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="signin" className="py-20 border-t border-white/[0.06]">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex flex-col lg:flex-row items-center gap-12">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-brand-400/80 font-medium mb-4">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Secure Access
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight">
                  Sign in to your
                  <br />
                  SocialMind workspace
                </h2>
                <p className="text-white/45 leading-relaxed mb-8 max-w-md">
                  Access your full content dashboard - videos, scheduling, analytics, and platform
                  integrations - from a single secure session.
                </p>
                <div className="space-y-3">
                  {[
                    'Token-based authentication with refresh support',
                    'Multi-account switching without re-authentication',
                    'Session state preserved across navigation',
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-white/50">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full max-w-md flex-shrink-0">
                <div className="glass-card rounded-2xl p-8">
                  <h3 className="text-xl font-bold text-white mb-1">Sign in with email OTP</h3>
                  <p className="text-white/40 text-sm mb-6">
                    Open the popup to continue with Google or verify your email address with a one-time code.
                  </p>
                  <button
                    type="button"
                    onClick={() => setAuthOpen(true)}
                    className="btn-primary w-full h-12 flex items-center justify-center gap-2"
                  >
                    Continue to sign in
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <p className="text-center text-white/35 text-xs mt-4">
                    The OTP is only sent to your inbox and never displayed on the page.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06] bg-surface-50/30">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <span className="text-sm font-bold text-white">SocialMind</span>
                <p className="text-[10px] text-white/30 mt-0.5">
                  AI Social Media Automation Platform
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-xs text-white/40">
              <button
                type="button"
                disabled
                title="Coming soon"
                className="hover:text-white/60 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              >
                Privacy Policy
              </button>
              <button
                type="button"
                disabled
                title="Coming soon"
                className="hover:text-white/60 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              >
                Request Data Deletion
              </button>
              <span className="text-white/20">·</span>
              <span>© {new Date().getFullYear()} SocialMind. All rights reserved.</span>
            </div>
          </div>
        </div>
      </footer>

      <PricingModal
        open={plansOpen}
        onClose={() => setPlansOpen(false)}
        checkoutEnabled={false}
        onRequireAuth={() => { setPlansOpen(false); setAuthMode('register'); setAuthOpen(true) }}
        onViewDemo={() => { setPlansOpen(false); setAuthMode('login'); setAuthOpen(true) }}
      />

      <EmailOtpAuth
        mode={authMode}
        variant="modal"
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onComplete={() => {
          setAuthOpen(false)
          navigate('/dashboard')
        }}
      />

      {/* FULLSCREEN CINEMA VIDEO MODAL */}
      {videoModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-2xl"
          onClick={e => e.target === e.currentTarget && setVideoModalOpen(false)}
        >
          <div className="relative w-full max-w-5xl rounded-3xl border border-white/20 bg-[#0d0a26] overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.9)]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.04]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-600/50">
                  <Video className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-wide">SocialMind Platform Overview</h3>
                  <p className="text-xs text-white/50">AI Social Media Automation Demo Video</p>
                </div>
              </div>
              <button
                onClick={() => setVideoModalOpen(false)}
                className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="relative aspect-video w-full bg-black">
              <video
                src="/demo-video.mp4"
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
