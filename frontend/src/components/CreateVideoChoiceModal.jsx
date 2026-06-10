import { Upload, Sparkles, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function CreateVideoChoiceModal({ onClose }) {
  const navigate = useNavigate()

  function go(path) {
    navigate(path)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-md"
        onClick={onClose}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.16),transparent_34rem)]" />
      <div className="relative w-full max-w-md animate-slide-up rounded-2xl border border-brand-500/30 bg-surface-card/95 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.62),0_0_0_1px_rgba(34,211,238,0.08)] backdrop-blur-2xl">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-xl font-bold text-white mb-1">Create Video</h2>
        <p className="text-white/40 text-sm mb-5">Choose how you want to add your video</p>

        <div className="space-y-3">
          <button
            onClick={() => go('/videos/upload')}
            className="w-full flex items-start gap-4 p-4 rounded-xl border border-white/10 bg-white/[0.045] hover:bg-white/[0.075] hover:border-cyan-300/45 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-cyan-400/15 flex items-center justify-center flex-shrink-0 ring-1 ring-cyan-300/15 group-hover:bg-cyan-400/25 transition">
              <Upload className="w-5 h-5 text-cyan-300" />
            </div>
            <div>
              <div className="font-semibold text-white text-sm">Upload Video</div>
              <div className="text-white/40 text-xs mt-0.5">Upload from your device and schedule to social media</div>
            </div>
          </button>

          <button
            onClick={() => go('/videos/new')}
            className="w-full flex items-start gap-4 p-4 rounded-xl border border-brand-500/35 bg-brand-500/10 hover:bg-brand-500/20 hover:border-brand-400/55 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center flex-shrink-0 ring-1 ring-brand-300/15 group-hover:bg-brand-500/30 transition">
              <Sparkles className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <div className="font-semibold text-white text-sm">Generate with AI</div>
              <div className="text-white/40 text-xs mt-0.5">Create a video automatically using AI and script generation</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
