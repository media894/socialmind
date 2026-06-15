import { Link, useNavigate } from 'react-router-dom'
import { ShieldCheck, Video, Calendar, BarChart3, Globe2, Zap } from 'lucide-react'

import EmailOtpAuth from '@/components/auth/EmailOtpAuth'

const FEATURES = [
  { icon: Video, label: 'AI Video Creation', desc: 'Script, voiceover and footage, fully automated' },
  { icon: Calendar, label: 'Smart Scheduling', desc: 'Set once, publish everywhere on time' },
  { icon: BarChart3, label: 'Live Analytics', desc: 'Real-time stats across all platforms' },
  { icon: Globe2, label: 'Multi-Platform', desc: 'YouTube, Instagram, LinkedIn and more' },
]

export default function RegisterPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-surface flex">
      <div className="hidden lg:flex lg:w-[56%] relative overflow-hidden flex-col">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0c0a1e] via-[#110f2b] to-[#0f0d20]" />
        <div className="absolute top-[15%] left-[20%] w-80 h-80 bg-brand-600/15 rounded-full blur-3xl" />
        <div className="absolute bottom-[20%] right-[15%] w-64 h-64 bg-purple-600/12 rounded-full blur-3xl" />
        <div className="absolute inset-0 opacity-[0.025]" style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)',
          backgroundSize: '64px 64px',
        }} />

        <div className="relative z-10 flex flex-col h-full px-14 py-12 gap-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-900/60">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">SocialMind</span>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-brand-500/25 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold text-brand-300 mb-7">
              <Zap className="w-3 h-3" /> Fast account setup
            </div>

            <h1 className="text-4xl xl:text-5xl font-bold text-white leading-[1.15] mb-5 tracking-tight">
              Create your account
              <br />
              with email OTP
            </h1>

            <p className="text-white/45 text-base leading-relaxed max-w-[420px] mb-10">
              We validate the email, send a one-time code, and keep the OTP hidden from the web app.
            </p>

            <div className="grid grid-cols-2 gap-3 max-w-[460px]">
              {FEATURES.map(f => {
                const Icon = f.icon
                return (
                  <div
                    key={f.label}
                    className="rounded-xl border border-white/[0.07] bg-white/[0.04] backdrop-blur-sm p-4"
                  >
                    <Icon className="w-4 h-4 text-brand-400 mb-2" />
                    <div className="text-sm font-semibold text-white mb-0.5">{f.label}</div>
                    <div className="text-xs text-white/40 leading-relaxed">{f.desc}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-10 bg-surface">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-white">SocialMind</span>
          </div>

          <EmailOtpAuth
            mode="register"
            variant="embedded"
            onComplete={() => navigate('/dashboard')}
          />

          <p className="text-center text-white/40 text-sm mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium">
              Login
            </Link>
          </p>

          <div className="mt-4 flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/25">
            <ShieldCheck className="w-3.5 h-3.5" />
            Secure registration
          </div>
        </div>
      </div>
    </div>
  )
}

