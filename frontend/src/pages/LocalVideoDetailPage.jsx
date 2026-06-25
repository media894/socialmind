import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  ChevronLeft, Calendar, Download, CheckCircle, XCircle,
  Send, Loader2, Film, MonitorPlay, Play, Pause,
  Maximize2, Minimize2, RefreshCw, AlertTriangle, Layout, Hash
} from 'lucide-react'
import toast from 'react-hot-toast'
import { schedulingApi, socialAccountsApi, videosApi, BACKEND_URL } from '@/api/client'
import { useAuthStore } from '@/store/auth'
import { appendScheduleEntry } from '@/utils/localVideoSchedules'
import { getLocalVideosKey } from '@/utils/accountStorage'
import { buildSocialPostKit } from '@/utils/socialPostKit'
import CreateVideoChoiceModal from '@/components/CreateVideoChoiceModal'
import { isPro } from '@/utils/subscription'
import { getAccessLevel } from '@/utils/trialAccess'

// ── Constants ─────────────────────────────────────────────────────
const SCENE_DURATION = 6000
const EXPORT_WIDTH = 1920
const EXPORT_HEIGHT = 1080

function getExportDimensions(videoFormat) {
  if (videoFormat === '9/16') return { width: 1080, height: 1920 }  // Portrait — YouTube Shorts / Reels
  if (videoFormat === '1/1')  return { width: 1080, height: 1080 }  // Square — Instagram Post
  return { width: 1920, height: 1080 }                               // Landscape default
}
const EXPORT_FPS = 30
const EXPORT_VIDEO_BITS = 8000000
const EXPORT_AUDIO_BITS = 192000
const MIN_SCENE_DURATION_MS = 2500
const VOICE_PADDING_MS = 120
const MAX_UPLOAD_SIZE_MB = 180

const PLATFORMS = [
  { id:'instagram', label:'Instagram',  icon:'📸', rules:{ maxDuration:60  } },
  { id:'facebook',  label:'Facebook',   icon:'👥', rules:{ maxDuration:240 } },
  { id:'linkedin',  label:'LinkedIn',   icon:'💼', rules:{ maxDuration:600 } },
  { id:'youtube',   label:'YouTube',    icon:'▶️', rules:{ maxDuration:900 } },
  { id:'twitter',   label:'Twitter/X',  icon:'🐦', rules:{ maxDuration:140 } },
]

// ── Platform aspect-ratio configurations ─────────────────────────
const PLATFORM_CONFIGS = [
  {
    id: 'youtube_shorts',
    label: 'YouTube Shorts',
    icon: '▶️',
    aspectRatio: '9/16',
    displayAspect: '9:16',
    description: 'Vertical · Max 60s',
    gradientFrom: 'from-red-500/20',
    gradientTo: 'to-red-700/5',
    border: 'border-red-500/25',
    badge: 'bg-red-500/20 text-red-400',
    category: 'vertical',
  },
  {
    id: 'instagram_reels',
    label: 'Instagram Video',
    icon: '📸',
    aspectRatio: '9/16',
    displayAspect: '9:16',
    description: 'Vertical · Max 90s',
    gradientFrom: 'from-pink-500/20',
    gradientTo: 'to-purple-700/5',
    border: 'border-pink-500/25',
    badge: 'bg-pink-500/20 text-pink-400',
    category: 'vertical',
  },
  {
    id: 'instagram_post',
    label: 'Instagram Post',
    icon: '📷',
    aspectRatio: '1/1',
    displayAspect: '1:1',
    description: 'Square · Max 60s',
    gradientFrom: 'from-purple-500/20',
    gradientTo: 'to-indigo-700/5',
    border: 'border-purple-500/25',
    badge: 'bg-purple-500/20 text-purple-400',
    category: 'square',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    icon: '👥',
    aspectRatio: '16/9',
    displayAspect: '16:9',
    description: 'Landscape · Max 4 min',
    gradientFrom: 'from-blue-500/20',
    gradientTo: 'to-blue-700/5',
    border: 'border-blue-500/25',
    badge: 'bg-blue-500/20 text-blue-400',
    category: 'horizontal',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: '💼',
    aspectRatio: '16/9',
    displayAspect: '16:9',
    description: 'Landscape · Max 10 min',
    gradientFrom: 'from-sky-500/20',
    gradientTo: 'to-sky-700/5',
    border: 'border-sky-500/25',
    badge: 'bg-sky-500/20 text-sky-400',
    category: 'horizontal',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    icon: '🎬',
    aspectRatio: '16/9',
    displayAspect: '16:9',
    description: 'Landscape · Max 15 min',
    gradientFrom: 'from-red-600/20',
    gradientTo: 'to-red-800/5',
    border: 'border-red-600/25',
    badge: 'bg-red-600/20 text-red-400',
    category: 'horizontal',
  },
  {
    id: 'twitter',
    label: 'Twitter/X',
    icon: '🐦',
    aspectRatio: '16/9',
    displayAspect: '16:9',
    description: 'Landscape · Max 140s',
    gradientFrom: 'from-slate-500/20',
    gradientTo: 'to-sky-700/5',
    border: 'border-sky-400/25',
    badge: 'bg-sky-500/20 text-sky-300',
    category: 'horizontal',
  },
]

function parseHashtags(value) {
  return [...new Set(
    String(value || '')
      .split(/[\s,]+/)
      .map(tag => tag.trim())
      .filter(Boolean)
      .map(tag => (tag.startsWith('#') ? tag : `#${tag.replace(/^#+/, '')}`))
  )]
}

const STATUS_COLORS = {
  created: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400',
  approved: 'bg-green-500/15 border-green-500/30 text-green-400',
  rejected: 'bg-red-500/15 border-red-500/30 text-red-400',
  scheduled:'bg-blue-500/15 border-blue-500/30 text-blue-400',
  review:   'bg-yellow-500/15 border-yellow-500/30 text-yellow-400',
}

// ── IndexedDB ─────────────────────────────────────────────────────
const DB_NAME='socialmind_videos', DB_STORE='blobs'
function openDB(){
  return new Promise((res,rej)=>{
    const req=indexedDB.open(DB_NAME,1)
    req.onupgradeneeded=e=>e.target.result.createObjectStore(DB_STORE)
    req.onsuccess=e=>res(e.target.result)
    req.onerror=()=>rej(req.error)
  })
}
async function loadBlob(key){
  try {
    const db=await openDB()
    const tx=db.transaction(DB_STORE,'readonly')
    const req=tx.objectStore(DB_STORE).get(key)
    return new Promise((res,rej)=>{ req.onsuccess=()=>res(req.result||null); req.onerror=()=>rej(req.error) })
  } catch { return null }
}
async function saveBlob(key,blob){
  try {
    const db=await openDB()
    const tx=db.transaction(DB_STORE,'readwrite')
    tx.objectStore(DB_STORE).put(blob,key)
    return new Promise((res,rej)=>{ tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error) })
  } catch { return false }
}

// Per-ratio blob key: sm_stitched_<id>_16_9 / _9_16 / _1_1
function getRatioBlobKey(videoId, cssRatio) {
  return `sm_stitched_${videoId}_${String(cssRatio).replace('/', '_')}`
}

// Platform configs for the preview-page ratio cards
const PREVIEW_PLATFORM_CONFIGS = [
  { id: 'youtube',         label: 'YouTube Video',   icon: '▶️',  color: '#FF0000', ratio: '16:9', cssRatio: '16/9' },
  { id: 'facebook',        label: 'Facebook',        icon: '👥',  color: '#1877F2', ratio: '16:9', cssRatio: '16/9' },
  { id: 'linkedin',        label: 'LinkedIn',        icon: '💼',  color: '#0A66C2', ratio: '16:9', cssRatio: '16/9' },
  { id: 'twitter',         label: 'Twitter / X',     icon: '🐦',  color: '#1DA1F2', ratio: '16:9', cssRatio: '16/9' },
  { id: 'youtube_shorts',  label: 'YouTube Shorts',  icon: '▶️',  color: '#FF0000', ratio: '9:16', cssRatio: '9/16' },
  { id: 'instagram_reels', label: 'Instagram Video', icon: '📸',  color: '#E1306C', ratio: '9:16', cssRatio: '9/16' },
  { id: 'tiktok',          label: 'TikTok',          icon: '🎵',  color: '#69C9D0', ratio: '9:16', cssRatio: '9/16' },
  { id: 'instagram_post',  label: 'Instagram Post',  icon: '📷',  color: '#E1306C', ratio: '1:1',  cssRatio: '1/1'  },
]

// ─────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────
export default function LocalVideoDetailPage() {
  const { localId }      = useParams()
  const navigate         = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const mode             = searchParams.get('mode') || 'preview' // 'video' | 'preview' | 'platforms'
  const autoRender       = searchParams.get('render') === '1'
  const { user } = useAuthStore()
  const accountId = user?.id || 'guest'
  const canDownload = isPro(user)

  const [video,       setVideo]       = useState(null)
  const [showSchedule,setShowSchedule]= useState(false)
  const [renderedBlob, setRenderedBlob] = useState(null)
  const [renderFormat, setRenderFormat] = useState('16/9')
  const [ratioBlobUrls, setRatioBlobUrls] = useState({ '16/9': null, '9/16': null, '1/1': null })
  const [schedulePlatformId, setSchedulePlatformId] = useState(null)
  const [logoDataUrl, setLogoDataUrlState] = useState(() => localStorage.getItem('sm_brand_logo') || '')
  const [createModalOpen, setCreateModalOpen] = useState(false)

  function setLogoDataUrl(val) {
    setLogoDataUrlState(val)
    if (val) localStorage.setItem('sm_brand_logo', val)
    else localStorage.removeItem('sm_brand_logo')
  }

  function loadVideoFromStorage() {
    try {
      const all = JSON.parse(localStorage.getItem(getLocalVideosKey(accountId)) || '[]')
      const found = all.find(v => v.id === localId)
      setVideo(found || null)
    } catch (e) {
      setVideo(null)
    }
  }

  // Load metadata
  useEffect(()=>{
    loadVideoFromStorage()

    const handleStorage = () => loadVideoFromStorage()
    const handleVideosChanged = () => loadVideoFromStorage()

    window.addEventListener('storage', handleStorage)
    window.addEventListener('socialmind:local-videos-changed', handleVideosChanged)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('socialmind:local-videos-changed', handleVideosChanged)
    }
  },[localId, accountId])

  // Sync default render format from video once loaded
  useEffect(() => {
    if (video?.videoFormat) setRenderFormat(video.videoFormat)
  }, [video?.videoFormat])

  // When a ratio is requested via query string, honor it on the video render page.
  useEffect(() => {
    const ratio = searchParams.get('ratio')
    if (!ratio) return
    const normalized = ratio.replace(/:/g, '/')
    if (['16/9', '9/16', '1/1'].includes(normalized)) {
      setRenderFormat(normalized)
    }
  }, [searchParams])

  // Sync logo from video if no global logo set yet
  useEffect(() => {
    if (video?.logoImage && !localStorage.getItem('sm_brand_logo')) {
      setLogoDataUrl(video.logoImage)
    }
  }, [video?.logoImage])

  // Load per-ratio blobs from IndexedDB whenever the video changes
  useEffect(() => {
    if (!video?.id) return
    const ratios = ['16/9', '9/16', '1/1']
    const createdUrls = []
    let cancelled = false
    async function loadAll() {
      const updates = {}
      for (const ratio of ratios) {
        const blob = await loadBlob(getRatioBlobKey(video.id, ratio))
        if (blob && !cancelled) {
          const url = URL.createObjectURL(blob)
          updates[ratio] = url
          createdUrls.push(url)
        }
      }
      if (!updates['16/9']) {
        const legacyBlob = await loadBlob(video.blobKey || `sm_stitched_${video.id}`)
        if (legacyBlob && !cancelled) {
          const ratio = normalizeRatio(video.videoFormat || '16/9')
          const url = URL.createObjectURL(legacyBlob)
          updates[ratio] = url
          createdUrls.push(url)
        }
      }
      if (!cancelled && Object.keys(updates).length) {
        setRatioBlobUrls(prev => ({ ...prev, ...updates }))
      }
    }
    loadAll()
    return () => {
      cancelled = true
      createdUrls.forEach(u => URL.revokeObjectURL(u))
    }
  }, [video?.id])

  function updateStatus(newStatus){
    try {
      const all=JSON.parse(localStorage.getItem(getLocalVideosKey(accountId))||'[]')
      const updated=all.map(v=>v.id===localId?{...v,status:newStatus}:v)
      localStorage.setItem(getLocalVideosKey(accountId),JSON.stringify(updated))
      setVideo(v=>({...v,status:newStatus}))
      window.dispatchEvent(new Event('socialmind:local-videos-changed'))
      toast.success(newStatus==='approved'?'✅ Video approved!':'💾 Video saved as created')
    } catch(e){}
  }

  function handleGenerateFullVideoWithAudio() {
    setSearchParams({ mode: 'video', render: '1' })
  }

  function handleGenerateRatioVideo(cssRatio) {
    setRenderFormat(cssRatio)
    setSearchParams({ mode: 'video', render: '1', ratio: cssRatio })
  }

  function handleSchedulePlatform(platformId) {
    setSchedulePlatformId(platformId)
    setShowSchedule(true)
    setSearchParams({ mode: 'platforms' })
  }

  function handleAutoRenderComplete() {
    setSearchParams({ mode: 'video' })
  }

  function handleRenderedVideoReady({ blob, blobKey, sizeMB, format }) {
    setRenderedBlob(blob)
    setVideo(prev => prev ? { ...prev, blobKey, renderedSizeMB: sizeMB } : prev)
    const fmt = format || renderFormat || '16/9'
    const url = URL.createObjectURL(blob)
    setRatioBlobUrls(prev => {
      if (prev[fmt]) URL.revokeObjectURL(prev[fmt])
      return { ...prev, [fmt]: url }
    })
  }

  if (!video) return (
    <div className="p-6 flex items-center justify-center min-h-[400px]">
      <div className="text-white/40 text-sm">Video not found.</div>
    </div>
  )

  const statusColor = STATUS_COLORS[video.status] || STATUS_COLORS.review
  const filename = `${(video.title||'video_ad').replace(/[^a-z0-9]/gi,'_').toLowerCase()}.webm`

  return (
    <div className="flex flex-col h-screen overflow-hidden w-full">
      {/* ── Sticky top bar: back + title + actions ── */}
      <div className="flex-shrink-0 px-6 pt-5 pb-3 border-b border-white/10 bg-black/60 backdrop-blur-sm">
        <button onClick={()=>navigate('/videos')}
          className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-3 transition-colors">
          <ChevronLeft className="w-4 h-4"/> Back to Videos
        </button>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <input
              className="text-xl font-bold text-white bg-transparent border-b border-transparent hover:border-white/20 focus:border-brand-400 focus:outline-none w-full transition-colors"
              value={video.title || ''}
              onChange={e => {
                try {
                  const all = JSON.parse(localStorage.getItem(getLocalVideosKey(accountId)) || '[]')
                  const updated = all.map(v => v.id === localId ? { ...v, title: e.target.value } : v)
                  localStorage.setItem(getLocalVideosKey(accountId), JSON.stringify(updated))
                  setVideo(v => ({ ...v, title: e.target.value }))
                } catch {}
              }}
              placeholder="Video title"
            />
            <p className="text-white/40 text-xs mt-0.5">
              AI Generated · {video.ai_service?.toUpperCase()||'Groq'} · {video.duration_seconds}s · {video.scenes?.length} scenes
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-semibold ${statusColor}`}>
              {video.status==='approved'&&<CheckCircle className="w-4 h-4"/>}
              {video.status==='rejected'&&<XCircle className="w-4 h-4"/>}
              {video.status==='created'&&<AlertTriangle className="w-4 h-4"/>}
              {(!video.status||video.status==='review')&&<AlertTriangle className="w-4 h-4"/>}
              {video.status === 'created' ? 'Created' : (video.status ? video.status.charAt(0).toUpperCase()+video.status.slice(1) : 'Created')}
            </span>
            {video.status!=='approved' && (
              <button onClick={()=>updateStatus('approved')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition">
                <CheckCircle className="w-4 h-4"/> Approve
              </button>
            )}
            {video.status!=='created' && (
              <button onClick={()=>updateStatus('created')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10 text-sm font-semibold transition">
                <AlertTriangle className="w-4 h-4"/> Save as Created
              </button>
            )}
            {video.status==='approved' && (
              <button onClick={()=>{ setShowSchedule(s=>!s); if (mode !== 'platforms') setSearchParams({mode:'platforms'}) }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition">
                <Calendar className="w-4 h-4"/> Schedule Post
              </button>
            )}
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-2 mt-3">
          <button onClick={()=>setSearchParams({mode:'video'})}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all border-2
              ${mode==='video'?'bg-brand-600/20 border-brand-500 text-brand-400':'border-white/10 text-white/50 hover:border-white/25 hover:text-white'}`}>
            <Film className="w-4 h-4"/> Video <span className="text-xs font-normal opacity-70">seamless</span>
          </button>
          <button onClick={()=>setSearchParams({mode:'preview'})}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all border-2
              ${mode==='preview'?'bg-brand-600/20 border-brand-500 text-brand-400':'border-white/10 text-white/50 hover:border-white/25 hover:text-white'}`}>
            <MonitorPlay className="w-4 h-4"/> Preview <span className="text-xs font-normal opacity-70">scene-by-scene</span>
          </button>
          <button onClick={()=>setSearchParams({mode:'platforms'})}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all border-2
              ${mode==='platforms'?'bg-brand-600/20 border-brand-500 text-brand-400':'border-white/10 text-white/50 hover:border-white/25 hover:text-white'}`}>
            <Layout className="w-4 h-4"/> Platform Previews <span className="text-xs font-normal opacity-70">all formats</span>
          </button>
        </div>
      </div>

      {/* ── Scrollable content area ── */}
      <div className="flex-1 overflow-y-auto px-6 py-5">

      {/* ── PLATFORM PREVIEWS MODE ── */}
      {mode === 'platforms' ? (
        <PlatformPreviewSection
          video={video}
          renderedBlob={renderedBlob}
          ratioBlobUrls={ratioBlobUrls}
          onApprove={() => updateStatus('approved')}
          onScheduleClick={() => setShowSchedule(true)}
          showSchedule={showSchedule}
          onDoneSchedule={() => navigate('/schedule')}
          renderFormat={renderFormat}
          onFormatChange={setRenderFormat}
          onGenerateVideo={() => setSearchParams({ mode: 'video', render: '1' })}
          schedulePlatformId={schedulePlatformId}
        />
      ) : (
        <div className="grid xl:grid-cols-3 lg:grid-cols-2 gap-5">
          {/* LEFT PANEL: video mode or preview mode */}
          <div className="xl:col-span-2 space-y-4">
            {mode === 'video'
              ? <VideoMode
                  video={video}
                  filename={filename}
                  autoGenerate={autoRender}
                  onAutoGenerateHandled={handleAutoRenderComplete}
                  onRenderedVideoReady={handleRenderedVideoReady}
                  renderFormat={renderFormat}
                  onFormatChange={fmt => {
                    setRenderFormat(fmt)
                    setSearchParams({ mode: 'video', ratio: fmt })
                  }}
                  ratioBlobUrls={ratioBlobUrls}
                  logoDataUrl={logoDataUrl}
                  onLogoChange={setLogoDataUrl}
                />
              : <PreviewMode
                  video={video}
                  onGenerateFullVideoWithAudio={handleGenerateFullVideoWithAudio}
                  ratioBlobUrls={ratioBlobUrls}
                  onGenerateRatioVideo={handleGenerateRatioVideo}
                  onSchedulePlatform={handleSchedulePlatform}
                  logoDataUrl={logoDataUrl}
                  onLogoChange={setLogoDataUrl}
                />
            }

            {/* Meta info */}
            <div className="glass-card p-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Scenes',    video.scenes?.length],
                  ['Duration',  `${video.duration_seconds}s`],
                  ['AI Service',video.ai_service?.toUpperCase()||'Groq'],
                  ['Format',    video.videoFormat||'16:9'],
                  ['Created',   video.created_at ? new Date(video.created_at).toLocaleDateString() : '—'],
                  ['Flags',     video.flagCount > 0 ? `⚠️ ${video.flagCount}` : '✓ None'],
                ].map(([label,val])=>(
                  <div key={label} className="glass rounded-xl p-2.5">
                    <div className="text-white/40 text-xs mb-0.5">{label}</div>
                    <div className="text-white text-sm font-medium">{val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: script + schedule */}
          <div className="space-y-4">
            <div className="glass-card p-4">
              <h2 className="font-semibold text-white mb-3 text-sm">📝 AI Script</h2>
              <p className="text-white/70 text-sm leading-relaxed">{video.script||video.topic||'No script available.'}</p>
            </div>

            {showSchedule && (
              <SchedulePanel
                video={video}
                renderedBlob={renderedBlob}
                onDone={() => navigate('/schedule')}
                renderFormat={renderFormat}
              />
            )}

            {video.status==='approved' && !showSchedule && (
              <div className="glass-card p-5 text-center border border-brand-600/30 bg-brand-600/5">
                <Calendar className="w-8 h-8 text-brand-400 mx-auto mb-2"/>
                <p className="text-white font-semibold text-sm mb-1">Ready to Post!</p>
                <p className="text-white/40 text-xs mb-3">Click "Schedule Post" above to choose platforms and publish time.</p>
                <button onClick={()=>{ setShowSchedule(true); setSearchParams({mode:'platforms'}) }}
                  className="btn-primary px-6 py-2 text-sm flex items-center gap-2 mx-auto">
                  <Calendar className="w-4 h-4"/> Schedule Post
                </button>
              </div>
            )}

            {video.status==='created' && (
              <div className="glass-card p-5 text-center border border-yellow-500/20 bg-yellow-500/5">
                <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto mb-2"/>
                <p className="text-white font-semibold text-sm mb-1">Video Created</p>
                <p className="text-white/40 text-xs mb-3">Approve it above, or create a new one.</p>
                <button onClick={() => setCreateModalOpen(true)}
                  className="px-5 py-2 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 text-sm transition">
                  ↺ Create New Video
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {createModalOpen && <CreateVideoChoiceModal onClose={() => setCreateModalOpen(false)} />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// PLATFORM PREVIEW SECTION
// ─────────────────────────────────────────────────────────────────
function deriveFormatFromCards(cardIds) {
  if (cardIds.includes('youtube_shorts') || cardIds.includes('instagram_reels')) return '9/16'
  if (cardIds.includes('instagram_post')) return '1/1'
  if (cardIds.length > 0) return '16/9'
  return null // no selection — don't override
}

function PlatformPreviewSection({ video, renderedBlob, ratioBlobUrls, onApprove, onScheduleClick, showSchedule, onDoneSchedule, renderFormat, onFormatChange, onGenerateVideo, schedulePlatformId }) {
  const [previewUrl, setPreviewUrl] = useState(null)
  const navigate = useNavigate()
  // Track which platform cards the user has checked
  const [selectedCards, setSelectedCards] = useState([])
  function toggleCard(id) {
    setSelectedCards(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      const derived = deriveFormatFromCards(next)
      if (derived) onFormatChange?.(derived)
      return next
    })
  }

  const isApproved = video?.status === 'approved'

  // Resolve preview: prefer rendered blob, then IndexedDB, then first scene
  useEffect(() => {
    let objectUrl = null

    async function resolve() {
      if (renderedBlob) {
        objectUrl = URL.createObjectURL(renderedBlob)
        setPreviewUrl(objectUrl)
        return
      }
      const blobKey = `sm_stitched_${video?.id}`
      const stored = await loadBlob(blobKey)
      if (stored) {
        objectUrl = URL.createObjectURL(stored)
        setPreviewUrl(objectUrl)
        return
      }
      // Fall back to first scene video URL
      const fallback = video?.scenes?.[0]?.videoUrl || null
      setPreviewUrl(fallback)
    }

    resolve()
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [renderedBlob, video?.id, video?.scenes])

  const postKit = buildSocialPostKit(video)
  const title = video?.title || postKit?.title || 'Generated Video'
  const caption = video?.edited_caption || video?.ai_caption || postKit?.caption || ''
  const hashtags = video?.edited_hashtags?.length
    ? video.edited_hashtags
    : (video?.ai_hashtags || postKit?.hashtags || [])

  return (
    <div className="space-y-6">
      {/* Approval / action bar */}
      <div className="glass-card p-5 border border-brand-600/20 bg-gradient-to-r from-brand-600/8 to-transparent">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Layout className="w-5 h-5 text-brand-400" /> Platform Format Previews
            </h2>
            <p className="text-white/40 text-sm mt-0.5">
              Select platforms below — the render format is set automatically for your selection
            </p>
            {selectedCards.length > 0 && (
              <div className={`mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${renderFormat === '9/16' ? 'bg-green-500/15 border-green-500/30 text-green-400' : renderFormat === '1/1' ? 'bg-purple-500/15 border-purple-500/30 text-purple-400' : 'bg-brand-500/15 border-brand-500/30 text-brand-400'}`}>
                {renderFormat === '9/16' ? '📱 Rendering as Portrait 9:16' : renderFormat === '1/1' ? '⬜ Rendering as Square 1:1' : '🖥 Rendering as Landscape 16:9'}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {!isApproved ? (
              <button
                onClick={onApprove}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-semibold text-sm transition shadow-lg shadow-green-900/30"
              >
                <CheckCircle className="w-4 h-4" /> Approve for All Platforms
              </button>
            ) : (
              <>
                <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600/15 border border-green-500/30 text-green-400 text-sm font-semibold">
                  <CheckCircle className="w-4 h-4" /> Approved
                </div>
                <button
                  onClick={onScheduleClick}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm transition shadow-lg shadow-brand-900/30"
                >
                  <Calendar className="w-4 h-4" /> Schedule Posts
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Selection summary + generate action */}
      {selectedCards.length > 0 ? (
        <div className={`glass-card p-4 border ${renderFormat === '9/16' ? 'border-green-500/30 bg-green-500/5' : renderFormat === '1/1' ? 'border-purple-500/30 bg-purple-500/5' : 'border-brand-500/30 bg-brand-600/5'}`}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-white font-semibold text-sm">
                {selectedCards.map(id => PLATFORM_CONFIGS.find(p => p.id === id)?.label).join(' · ')}
              </p>
              <p className="text-white/40 text-xs mt-0.5">
                {renderFormat === '9/16' ? '📱 Will render & upload as Portrait 9:16' : renderFormat === '1/1' ? '⬜ Will render & upload as Square 1:1' : '🖥 Will render & upload as Landscape 16:9'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onGenerateVideo}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${renderFormat === '9/16' ? 'bg-green-600 hover:bg-green-500 text-white' : renderFormat === '1/1' ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'btn-primary'}`}
              >
                <Film className="w-4 h-4" />
                {renderedBlob ? 'Re-generate at correct ratio' : 'Generate video for selected platforms'}
              </button>
              <button onClick={() => setSelectedCards([])} className="text-xs text-white/30 hover:text-white/60 transition px-2 py-1">Clear</button>
            </div>
          </div>
        </div>
      ) : !previewUrl ? (
        <div className="glass-card p-5 border border-yellow-500/20 bg-yellow-500/5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-white font-semibold text-sm mb-0.5">Select a platform card above to get started</p>
            <p className="text-white/40 text-xs">Pick YouTube Shorts, Instagram Video, or any platform — the video will be generated at the correct ratio automatically.</p>
          </div>
        </div>
      ) : null}

      {/* ── Platform grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {PLATFORM_CONFIGS.map(platform => (
          <PlatformCard
            key={platform.id}
            platform={platform}
            videoSrc={ratioBlobUrls?.[platform.aspectRatio] || null}
            title={title}
            caption={caption}
            hashtags={hashtags}
            selected={selectedCards.includes(platform.id)}
            onToggleSelect={() => toggleCard(platform.id)}
          />
        ))}
      </div>

      {/* Schedule panel — shown after approval */}
      {showSchedule && isApproved && (
        <div className="mt-2">
          <SchedulePanel
            video={video}
            renderedBlob={renderedBlob}
            onDone={onDoneSchedule}
            initialPlatforms={schedulePlatformId ? [schedulePlatformId] : selectedCards}
            renderFormat={renderFormat}
          />
        </div>
      )}

      {/* Post-approval CTA if schedule not yet open */}
      {isApproved && !showSchedule && (
        <div className="glass-card p-6 text-center border border-brand-600/30 bg-brand-600/5">
          <Calendar className="w-10 h-10 text-brand-400 mx-auto mb-3" />
          <p className="text-white font-semibold mb-1">Video approved and ready to publish!</p>
          <p className="text-white/40 text-sm mb-4">Set your publish schedule for each connected platform.</p>
          <button
            onClick={onScheduleClick}
            className="btn-primary px-8 py-2.5 flex items-center gap-2 mx-auto text-sm"
          >
            <Calendar className="w-4 h-4" /> Schedule Posts
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// PLATFORM CARD — video in correct aspect ratio + metadata
// ─────────────────────────────────────────────────────────────────
function PlatformCard({ platform, videoSrc, title, caption, hashtags, selected, onToggleSelect }) {
  const videoRef = useRef(null)
  const bgRef    = useRef(null)
  const [playing, setPlaying] = useState(false)

  function togglePlay() {
    const vid = videoRef.current
    if (!vid) return
    if (playing) { vid.pause(); setPlaying(false) }
    else { vid.play().catch(() => {}); setPlaying(true) }
  }

  // Keep blurred background in sync with foreground video
  useEffect(() => {
    const vid = videoRef.current
    const bg  = bgRef.current
    if (!vid || !bg) return
    const onTime = () => { try { if (Math.abs(bg.currentTime - vid.currentTime) > 0.5) bg.currentTime = vid.currentTime } catch(e) {} }
    const onPlay = () => { bg.play().catch(()=>{}) }
    const onPause = () => { bg.pause() }
    vid.addEventListener('timeupdate', onTime)
    vid.addEventListener('play',  onPlay)
    vid.addEventListener('pause', onPause)
    return () => {
      vid.removeEventListener('timeupdate', onTime)
      vid.removeEventListener('play',  onPlay)
      vid.removeEventListener('pause', onPause)
    }
  }, [])

  return (
    <div className={`glass-card overflow-hidden border-2 flex flex-col transition-all ${selected ? 'border-brand-500 shadow-lg shadow-brand-900/30' : platform.border}`}>
      {/* Platform header */}
      <div className={`px-4 py-3 bg-gradient-to-r ${platform.gradientFrom} ${platform.gradientTo} border-b border-white/5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">{platform.icon}</span>
            <span className="font-semibold text-white text-sm">{platform.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${platform.badge}`}>
              {platform.displayAspect}
            </span>
            {/* Select checkbox */}
            <button
              onClick={onToggleSelect}
              title={selected ? 'Deselect' : 'Select for scheduling'}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0
                ${selected ? 'bg-brand-500 border-brand-400' : 'bg-transparent border-white/30 hover:border-white/60'}`}
            >
              {selected && <span className="text-white text-xs font-bold leading-none">✓</span>}
            </button>
          </div>
        </div>
        <p className="text-white/35 text-[11px] mt-0.5">{platform.description}</p>
      </div>

      {/* Video container — correct aspect ratio, no content cropping */}
      <div className="p-3">
        <div
          className="relative rounded-xl overflow-hidden bg-black cursor-pointer group select-none"
          style={{ aspectRatio: platform.aspectRatio }}
          onClick={togglePlay}
        >
          {videoSrc ? (
            <>
              {/* Blurred ambient background to fill letterbox areas beautifully */}
              <video
                ref={bgRef}
                src={videoSrc}
                muted
                preload="none"
                loop
                playsInline
                className="absolute inset-0 w-full h-full object-cover scale-125 blur-xl opacity-40 pointer-events-none"
                aria-hidden="true"
              />
              {/* Main video — object-cover fills the platform canvas at the correct ratio */}
              <video
                ref={videoRef}
                src={videoSrc}
                preload="metadata"
                loop
                playsInline
                className="relative z-10 w-full h-full object-cover"
                onEnded={() => setPlaying(false)}
              />
              {/* Play / Pause overlay */}
              <div
                className={`absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-200
                  ${playing ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}
              >
                <div className="w-11 h-11 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-xl">
                  {playing
                    ? <div className="flex gap-1"><div className="w-1 h-4 bg-white rounded-full" /><div className="w-1 h-4 bg-white rounded-full" /></div>
                    : <div className="w-0 h-0 border-t-[7px] border-t-transparent border-b-[7px] border-b-transparent border-l-[13px] border-l-white ml-1" />
                  }
                </div>
              </div>
              {/* Aspect ratio watermark */}
              <div className="absolute top-2 right-2 z-20 px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-sm border border-white/10 text-white/60 text-[10px] font-bold">
                {platform.displayAspect}
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/15">
              <Film className="w-8 h-8" />
              <span className="text-xs">No preview</span>
            </div>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="px-4 pb-4 space-y-2.5 flex-1">
        <div>
          <div className="text-white/30 text-[10px] uppercase tracking-wider mb-0.5">Title</div>
          <div className="text-white text-xs font-semibold truncate">{title || '—'}</div>
        </div>
        <div>
          <div className="text-white/30 text-[10px] uppercase tracking-wider mb-0.5">Caption</div>
          <div className="text-white/60 text-xs leading-relaxed line-clamp-2">
            {caption || <span className="text-white/20 italic">No caption</span>}
          </div>
        </div>
        {hashtags?.length > 0 && (
          <div>
            <div className="text-white/30 text-[10px] uppercase tracking-wider mb-1">Hashtags</div>
            <div className="flex flex-wrap gap-1">
              {hashtags.slice(0, 5).map(h => (
                <span key={h} className="px-1.5 py-0.5 rounded bg-brand-600/20 text-brand-400 text-[10px] font-medium">{h}</span>
              ))}
              {hashtags.length > 5 && (
                <span className="text-white/30 text-[10px] self-center">+{hashtags.length - 5} more</span>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <span className="text-white/25 text-[10px]">Aspect Ratio</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${platform.badge}`}>{platform.displayAspect}</span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// VIDEO MODE — Seamless stitched video with voiceover + persistent
// ─────────────────────────────────────────────────────────────────
function VideoMode({ video, filename, autoGenerate = false, onAutoGenerateHandled, onRenderedVideoReady, renderFormat, onFormatChange, ratioBlobUrls, logoDataUrl, onLogoChange }) {
  const setLogoDataUrl = onLogoChange || (() => {})
  const [blobUrl,        setBlobUrl]        = useState(null)
  const [sizeMB,         setSizeMB]         = useState(null)
  const [loadingBlob,    setLoadingBlob]    = useState(true)
  const [stitching,      setStitching]      = useState(false)
  const [stitchProgress, setStitchProgress] = useState(0)
  const [stitchLabel,    setStitchLabel]    = useState('')
  const [isFullscreen,   setIsFullscreen]   = useState(false)
  const [voiceMode,      setVoiceMode]      = useState('voice') // 'voice' | 'silent'
  // renderFormat and logoDataUrl are controlled by the parent
  const playerRef = useRef(null)
  const autoGenerateStartedRef = useRef(false)
  const blobUrlRef = useRef(null)
  const { user } = useAuthStore()
  const accountId = user?.id || 'guest'
  const canDownload = isPro(user)

  // ── Load persisted blob on mount (ratio-specific key, fall back to old key) ──
  useEffect(()=>{
    const ratioKey  = getRatioBlobKey(video.id, renderFormat || '16/9')
    const legacyKey = `sm_stitched_${video.id}`
    async function tryLoad() {
      let blob = await loadBlob(ratioKey)
      if (!blob) blob = await loadBlob(legacyKey)
      if (blob) {
        const url = URL.createObjectURL(blob)
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = url
        setBlobUrl(url)
        setSizeMB((blob.size/1024/1024).toFixed(1))
      } else {
        setBlobUrl(null)
        setSizeMB(null)
      }
      setLoadingBlob(false)
    }
    tryLoad()
    return ()=>{
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  },[video.id, renderFormat])

  useEffect(()=>{
    const fn=()=>setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange',fn)
    return ()=>document.removeEventListener('fullscreenchange',fn)
  },[])

  useEffect(()=>{
    if (!autoGenerate) {
      autoGenerateStartedRef.current = false
      return
    }
    if (autoGenerateStartedRef.current || loadingBlob || stitching) return
    autoGenerateStartedRef.current = true
    stitchVideo().finally(() => onAutoGenerateHandled?.())
  }, [autoGenerate, loadingBlob, stitching])

  function toggleFullscreen(){
    const el=playerRef.current; if(!el) return
    if (!document.fullscreenElement) el.requestFullscreen?.()
    else document.exitFullscreen?.()
  }

  function markVideoDownloaded() {
    try {
      const all = JSON.parse(localStorage.getItem(getLocalVideosKey(accountId)) || '[]')
      const updated = all.map(v => (
        v.id === video.id
          ? { ...v, downloadedAt: new Date().toISOString(), hasDownloaded: true, blobKey: v.blobKey || `sm_stitched_${video.id}` }
          : v
      ))
      localStorage.setItem(getLocalVideosKey(accountId), JSON.stringify(updated))
    } catch (e) {
      console.warn('Failed to mark video as downloaded', e)
    }
  }

  function handleDownloadFullVideo() {
    if (!blobUrl) return
    if (!canDownload) {
      toast.error('Subscribe to download videos.')
      window.dispatchEvent(new Event('sm:open-plans'))
      return
    }
    markVideoDownloaded()
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    toast.success('Full video download started')
  }

  // ── Draw one frame to canvas ────────────────────────────────────
  function drawSceneFrame(ctx, vid, sc, idx, total, elapsed, sceneDurationMs, elapsedTotalMs, totalDurationMs, logoImg) {
    const W = ctx.canvas.width
    const H = ctx.canvas.height
    if (vid && vid.readyState >= 2) {
      try { ctx.drawImage(vid,0,0,W,H) }
      catch { ctx.fillStyle='#0d1528'; ctx.fillRect(0,0,W,H) }
    } else {
      const colors=['#0f172a','#1e1b4b','#0c1a2e','#12082a','#0a1628']
      ctx.fillStyle=colors[idx%colors.length]; ctx.fillRect(0,0,W,H)
    }
    const g=ctx.createLinearGradient(0,H*0.42,0,H)
    g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.9)')
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H)
    ctx.shadowColor='rgba(0,0,0,0.95)'; ctx.shadowBlur=16
    if (sc.overlayText){
      ctx.font='bold 56px Arial'; ctx.fillStyle='#ffffff'; ctx.textAlign='left'
      canvasWrapText(ctx,sc.overlayText,50,H-108,W-80,64)
    }
    if (sc.voiceover){
      ctx.font='27px Arial'; ctx.fillStyle='rgba(255,255,255,0.88)'; ctx.shadowBlur=8
      canvasWrapText(ctx,sc.voiceover,50,H-30,W-80,34)
    }
    ctx.shadowBlur=0
    // Draw logo watermark (bottom-right)
    if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
      const logoW = Math.round(W * 0.10)
      const logoH = Math.round((logoImg.naturalHeight / logoImg.naturalWidth) * logoW)
      const x = W - logoW - 36
      const y = H - logoH - 36
      ctx.save()
      ctx.globalAlpha = 0.82
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 12
      ctx.drawImage(logoImg, x, y, logoW, logoH)
      ctx.restore()
    }
  }

  // ── Stitch all scenes with voiceover captured via Web Audio ────
  async function stitchVideo(skipVoiceover = false) {
    const scenes = video.scenes || []
    if (!scenes.length) { toast.error('No scenes to stitch'); return }
    setStitching(true); setStitchProgress(0)
    setStitchLabel(skipVoiceover ? 'Preparing canvas (silent mode)...' : 'Preparing canvas & audio...')

    try {
      const { width: exportW, height: exportH } = getExportDimensions(renderFormat || video?.videoFormat)
      const canvas = document.createElement('canvas')
      canvas.width = exportW
      canvas.height = exportH
      const ctx = canvas.getContext('2d')

      // Load logo if available
      const logoImg = await new Promise(resolve => {
        const src = logoDataUrl || video?.logoImage || ''
        if (!src) return resolve(null)
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => resolve(null)
        img.src = src
      })

      const audioCtx  = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 })
      const audioDest = audioCtx.createMediaStreamDestination()
      const masterGain = audioCtx.createGain()
      masterGain.gain.value = 0.96
      masterGain.connect(audioDest)

      const videoStream = canvas.captureStream(EXPORT_FPS)
      if (audioCtx.state === 'suspended') await audioCtx.resume()
      const silentSrc = audioCtx.createConstantSource()
      const silentGain = audioCtx.createGain(); silentGain.gain.value = 0.0001
      silentSrc.connect(silentGain); silentGain.connect(audioDest); silentSrc.start()

      const combined    = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioDest.stream.getAudioTracks(),
      ])
      const mime = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']
        .find(m=>MediaRecorder.isTypeSupported(m)) || 'video/webm'
      const mr = new MediaRecorder(combined, {
        mimeType:mime,
        videoBitsPerSecond:EXPORT_VIDEO_BITS,
        audioBitsPerSecond:EXPORT_AUDIO_BITS,
      })
      const chunks = []
      mr.ondataavailable = e => { if(e.data?.size>0) chunks.push(e.data) }
      mr.start(100)

      const groqKey = localStorage.getItem('sm_groq_key') || ''

      function splitSpeechText(text, maxLen = 180) {
        const clean = (text || '').replace(/\s+/g, ' ').trim()
        if (!clean) return []
        const parts = []
        let remaining = clean
        while (remaining.length > maxLen) {
          const slice = remaining.slice(0, maxLen + 1)
          const breakIdx = Math.max(
            slice.lastIndexOf('. '),
            slice.lastIndexOf('! '),
            slice.lastIndexOf('? '),
            slice.lastIndexOf(', '),
            slice.lastIndexOf('; '),
            slice.lastIndexOf(': '),
            slice.lastIndexOf(' ')
          )
          const cut = breakIdx > 40 ? breakIdx + 1 : maxLen
          parts.push(remaining.slice(0, cut).trim())
          remaining = remaining.slice(cut).trim()
        }
        if (remaining) parts.push(remaining)
        return parts
      }

      function concatAudioBuffers(buffers) {
        const validBuffers = (buffers || []).filter(Boolean)
        if (!validBuffers.length) return null
        if (validBuffers.length === 1) return validBuffers[0]
        const sampleRate = validBuffers[0].sampleRate
        const numChannels = Math.max(...validBuffers.map(buffer => buffer.numberOfChannels))
        const totalLength = validBuffers.reduce((sum, buffer) => sum + buffer.length, 0)
        const output = audioCtx.createBuffer(numChannels, totalLength, sampleRate)
        for (let channel = 0; channel < numChannels; channel++) {
          const out = output.getChannelData(channel)
          let offset = 0
          for (const buffer of validBuffers) {
            const sourceChannel = Math.min(channel, buffer.numberOfChannels - 1)
            out.set(buffer.getChannelData(sourceChannel), offset)
            offset += buffer.length
          }
        }
        return output
      }

      async function preloadSceneVideo(url) {
        if (!url) return null
        return await new Promise(resolve => {
          const vid = document.createElement('video')
          vid.src = url
          vid.muted = true
          vid.crossOrigin = 'anonymous'
          vid.preload = 'auto'
          vid.loop = true
          vid.playsInline = true
          const cleanup = () => { vid.onloadeddata = null; vid.oncanplaythrough = null; vid.onerror = null }
          const ready = () => { cleanup(); vid.currentTime = 0; resolve(vid) }
          vid.onloadeddata = ready
          vid.oncanplaythrough = ready
          vid.onerror = () => { cleanup(); resolve(null) }
        })
      }

      async function fetchTTSAudio(text) {
        if (!text) return null
        const chunks = splitSpeechText(text)
        const chunkBuffers = []
        for (const chunk of chunks) {
          let decodedChunk = null
          try {
            const res = await fetch(`${BACKEND_URL}/videos/groq-tts-proxy/`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ input: chunk, groq_key: groqKey || '' }),
            })
            if (res.ok) {
              const ab = await res.arrayBuffer()
              decodedChunk = await audioCtx.decodeAudioData(ab.slice(0)).catch(() => null)
            } else {
              console.warn('TTS proxy error:', res.status)
            }
          } catch (e) {
            console.warn('TTS proxy request failed:', e)
          }
          if (decodedChunk) chunkBuffers.push(decodedChunk)
        }
        return concatAudioBuffers(chunkBuffers)
      }

      // ── Audio: fetch TTS or use silent mode ──────────────────────
      let audioBuffers
      if (skipVoiceover) {
        audioBuffers = scenes.map(() => null)
        setStitchLabel('🎞️ Preloading scene videos (silent mode)...')
      } else {
        setStitchLabel('🔊 Generating voiceover audio...')
        audioBuffers = await Promise.all(
          scenes.map(sc => fetchTTSAudio(sc.voiceover || sc.overlayText || ''))
        )
        setStitchLabel('🎞️ Preloading scene videos...')
      }
      const sceneVideos = await Promise.all(
        scenes.map(sc => preloadSceneVideo(sc.videoUrl))
      )
      const sceneDurations = scenes.map((_, index) => {
        if (skipVoiceover || !audioBuffers[index]) return SCENE_DURATION
        const voiceMs = audioBuffers[index]?.duration ? Math.ceil(audioBuffers[index].duration * 1000) : 0
        return Math.max(MIN_SCENE_DURATION_MS, voiceMs + VOICE_PADDING_MS)
      })
      const totalDurationMs = sceneDurations.reduce((sum, durationMs) => sum + durationMs, 0)
      drawSceneFrame(ctx, sceneVideos[0], scenes[0], 0, scenes.length, 0, sceneDurations[0], 0, totalDurationMs, logoImg)
      setStitchLabel('✅ Audio ready — rendering video frames...')

      let audioTime = audioCtx.currentTime + 0.02
      let elapsedTotalMs = 0

      for (let i=0; i<scenes.length; i++) {
        const sc = scenes[i]
        setStitchProgress(Math.round(10 + (i/scenes.length)*80))
        setStitchLabel(`Scene ${i+1} / ${scenes.length} — video + voiceover...`)
        const sceneDurationMs = sceneDurations[i]
        const audioBuf = audioBuffers[i]
        if (audioBuf) {
          const src = audioCtx.createBufferSource()
          const voiceGain = audioCtx.createGain()
          src.buffer = audioBuf
          src.playbackRate.value = 1.0
          voiceGain.gain.setValueAtTime(0.0001, audioTime)
          voiceGain.gain.linearRampToValueAtTime(1, audioTime + 0.08)
          voiceGain.gain.setValueAtTime(1, Math.max(audioTime + 0.08, audioTime + audioBuf.duration - 0.16))
          voiceGain.gain.linearRampToValueAtTime(0.0001, audioTime + audioBuf.duration)
          src.connect(voiceGain)
          voiceGain.connect(masterGain)
          src.start(audioTime)
        }
        const sceneVideo = sceneVideos[i]
        if (sceneVideo) {
          await new Promise(resolve => {
            sceneVideo.currentTime = 0
            sceneVideo.play().catch(()=>{})
            let elapsed = 0
            const interval = 1000 / EXPORT_FPS
            const timer = setInterval(()=>{
              elapsed += interval
              drawSceneFrame(ctx, sceneVideo, sc, i, scenes.length, elapsed, sceneDurationMs, elapsedTotalMs, totalDurationMs, logoImg)
              if (elapsed >= sceneDurationMs){ clearInterval(timer); sceneVideo.pause(); resolve() }
            }, interval)
          })
        } else {
          let elapsed = 0
          await new Promise(resolve=>{
            const timer = setInterval(()=>{
              elapsed += 1000 / EXPORT_FPS
              drawSceneFrame(ctx, null, sc, i, scenes.length, elapsed, sceneDurationMs, elapsedTotalMs, totalDurationMs, logoImg)
              if (elapsed >= sceneDurationMs){ clearInterval(timer); resolve() }
            }, 1000 / EXPORT_FPS)
          })
        }
        elapsedTotalMs += sceneDurationMs
        audioTime += sceneDurationMs / 1000
      }

      const remaining = (audioTime - audioCtx.currentTime) * 1000
      if (remaining > 0) {
        setStitchLabel('Capturing final audio...')
        await new Promise(r => setTimeout(r, remaining + 300))
      }

      setStitchProgress(93); setStitchLabel('Finalising video file...')
      const stopped = new Promise(resolve => { mr.onstop = resolve })
      mr.stop()
      await stopped
      try { silentSrc.stop() } catch(e) {}
      audioCtx.close().catch(()=>{})

      const blob    = new Blob(chunks, { type:'video/webm' })
      const url     = URL.createObjectURL(blob)
      const mb      = (blob.size/1024/1024).toFixed(1)
      const fmt     = renderFormat || '16/9'
      const blobKey = getRatioBlobKey(video.id, fmt)

      const saved = await saveBlob(blobKey, blob)
      try {
        const all     = JSON.parse(localStorage.getItem(getLocalVideosKey(accountId))||'[]')
        const updated = all.map(v=>v.id===video.id ? {...v,blobKey, renderedSizeMB: mb, blobPersisted: saved} : v)
        localStorage.setItem(getLocalVideosKey(accountId), JSON.stringify(updated))
      } catch(e){}

      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = url
      setBlobUrl(url); setSizeMB(mb)
      onRenderedVideoReady?.({ blob, blobKey, sizeMB: mb, persisted: saved, format: fmt })
      setStitchProgress(100); setStitchLabel('✅ Done! Saved permanently.')
      toast.success(saved
        ? `🎬 Seamless video with voiceover ready! (${mb} MB)`
        : `🎬 Video ready in this tab (${mb} MB). Storage save was skipped, but you can still schedule now.`)
    } catch(err) {
      console.error(err)
      toast.error('Stitching failed: '+err.message+'. Use Chrome.')
    }
    setStitching(false)
  }

  if (loadingBlob) return (
    <div className="glass-card p-8 flex items-center justify-center gap-3 text-white/40">
      <Loader2 className="w-5 h-5 animate-spin"/> Checking for saved video...
    </div>
  )

  // ── Ratio options for the in-player selector ──────────────────
  const RATIO_OPTS = [
    { cssRatio: '9/16', label: '9:16', name: 'Portrait', desc: 'Shorts · Reels · TikTok', icon: '📱',
      color: '#8B5CF6', colorBg: 'rgba(139,92,246,0.14)', colorBorder: 'rgba(139,92,246,0.40)' },
    { cssRatio: '1/1',  label: '1:1',  name: 'Square',   desc: 'Instagram Post · FB',     icon: '⬜',
      color: '#EC4899', colorBg: 'rgba(236,72,153,0.14)',  colorBorder: 'rgba(236,72,153,0.40)'  },
    { cssRatio: '16/9', label: '16:9', name: 'Landscape', desc: 'YouTube · LinkedIn · X', icon: '🖥️',
      color: '#3B82F6', colorBg: 'rgba(59,130,246,0.14)',  colorBorder: 'rgba(59,130,246,0.40)'  },
  ]
  const selectedRatioOpt = RATIO_OPTS.find(r => r.cssRatio === renderFormat) || RATIO_OPTS[2]

  return (
    <div className="glass-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white text-sm flex items-center gap-2">
          <Film className="w-4 h-4 text-brand-400"/> Seamless Video
          {blobUrl && <span className="text-green-400 text-xs font-normal">· saved ✓</span>}
        </h2>
        {blobUrl && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: selectedRatioOpt.colorBg, color: selectedRatioOpt.color, border: `1px solid ${selectedRatioOpt.colorBorder}` }}>
            {selectedRatioOpt.icon} {selectedRatioOpt.label} · {selectedRatioOpt.name}
          </span>
        )}
      </div>

      {/* ── Ratio selector pills — instant visual re-frame, no re-render needed ── */}
      <div>
        <p className="text-white/35 text-[10px] uppercase tracking-wider mb-2">
          {blobUrl
            ? '✨ Select ratio to instantly reframe the player · generate to export at that ratio'
            : 'Select target ratio before generating'}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {RATIO_OPTS.map(opt => {
            const isActive = renderFormat === opt.cssRatio
            const hasBlob  = !!(ratioBlobUrls?.[opt.cssRatio] || (blobUrl && renderFormat === opt.cssRatio))
            return (
              <button
                key={opt.cssRatio}
                onClick={() => onFormatChange?.(opt.cssRatio)}
                className="relative flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 transition-all duration-200 cursor-pointer"
                style={{
                  background:   isActive ? opt.colorBg    : 'rgba(255,255,255,0.03)',
                  borderColor:  isActive ? opt.color       : 'rgba(255,255,255,0.10)',
                  boxShadow:    isActive ? `0 0 14px ${opt.color}30` : 'none',
                }}
              >
                {/* Shape thumbnail */}
                <div className="flex items-center justify-center" style={{ height: 28 }}>
                  {opt.cssRatio === '9/16' && (
                    <div className="rounded border-2 transition-all"
                      style={{ width: 12, height: 20, borderColor: isActive ? opt.color : 'rgba(255,255,255,0.22)', background: isActive ? opt.colorBg : 'transparent' }} />
                  )}
                  {opt.cssRatio === '1/1' && (
                    <div className="rounded border-2 transition-all"
                      style={{ width: 18, height: 18, borderColor: isActive ? opt.color : 'rgba(255,255,255,0.22)', background: isActive ? opt.colorBg : 'transparent' }} />
                  )}
                  {opt.cssRatio === '16/9' && (
                    <div className="rounded border-2 transition-all"
                      style={{ width: 24, height: 13, borderColor: isActive ? opt.color : 'rgba(255,255,255,0.22)', background: isActive ? opt.colorBg : 'transparent' }} />
                  )}
                </div>
                <span className="font-bold text-sm leading-none" style={{ color: isActive ? opt.color : 'rgba(255,255,255,0.45)' }}>
                  {opt.label}
                </span>
                <span className="text-[9px] leading-none mt-0.5 text-center" style={{ color: isActive ? opt.color + 'bb' : 'rgba(255,255,255,0.20)' }}>
                  {opt.name}
                </span>
                {hasBlob && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-green-400" title="Video ready at this ratio" />
                )}
              </button>
            )
          })}
        </div>
        <p className="text-white/25 text-[10px] text-center mt-1.5">{selectedRatioOpt.icon} {selectedRatioOpt.desc}</p>
      </div>

      {blobUrl ? (
        <>
          {/* ── Ratio-blended player: aspect ratio changes live, blurred bg fills letterbox ── */}
          <div
            ref={playerRef}
            className="relative rounded-xl overflow-hidden bg-black mb-3"
            style={{
              aspectRatio: renderFormat || '16/9',
              transition: 'aspect-ratio 0.35s cubic-bezier(0.4,0,0.2,1)',
              maxHeight: renderFormat === '9/16' ? '72vh' : undefined,
              margin: renderFormat === '9/16' ? '0 auto 12px' : undefined,
              width: renderFormat === '9/16' ? 'auto' : undefined,
            }}
          >
            {/* Blurred ambient background — fills pillarbox / letterbox areas */}
            <video
              src={blobUrl}
              muted
              preload="none"
              loop
              playsInline
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover scale-125 pointer-events-none"
              style={{ filter: 'blur(22px) brightness(0.45)', transition: 'opacity 0.3s' }}
            />
            {/* Main video — object-contain so nothing is cropped at any ratio */}
            <video
              src={blobUrl}
              controls
              preload="auto"
              className="relative z-10 w-full h-full"
              style={{ objectFit: 'contain' }}
            />
            {/* Ratio badge */}
            <div className="absolute top-2 left-2 z-20 px-2 py-0.5 rounded-md bg-black/55 backdrop-blur-sm border border-white/10 text-white/70 text-[10px] font-bold pointer-events-none">
              {(renderFormat || '16/9').replace('/', ':')}
            </div>
            <button onClick={toggleFullscreen}
              className="absolute bottom-12 right-3 z-20 bg-black/60 hover:bg-brand-600/80 text-white rounded-lg px-2.5 py-1.5 text-xs font-medium backdrop-blur-sm border border-white/10 flex items-center gap-1 transition-all">
              {isFullscreen?<Minimize2 className="w-3 h-3"/>:<Maximize2 className="w-3 h-3"/>}
              {isFullscreen?'Exit':'Fullscreen'}
            </button>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 cursor-pointer text-xs text-white/60 hover:text-white transition">
              🖼️ {logoDataUrl ? 'Change Logo' : 'Add Logo'}
              <input type="file" accept="image/*" className="hidden" onChange={e => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = ev => setLogoDataUrl(ev.target.result)
                reader.readAsDataURL(file)
              }}/>
            </label>
            {logoDataUrl && (
              <div className="flex items-center gap-2">
                <img src={logoDataUrl} className="h-6 w-6 object-contain rounded border border-white/20"/>
                <button onClick={() => setLogoDataUrl('')} className="text-white/30 hover:text-red-400 text-xs">✕</button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleDownloadFullVideo}
              disabled={!canDownload}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition ${
                canDownload
                  ? 'bg-green-600/15 border-green-500/30 text-green-400 hover:bg-green-600/25'
                  : 'bg-white/[0.03] border-white/10 text-white/35 cursor-not-allowed'
              }`}>
              <Download className="w-4 h-4"/> {canDownload ? 'Download' : 'Subscribe to Download'}
            </button>
            <button onClick={()=>{
              if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current)
                blobUrlRef.current = null
              }
              setBlobUrl(null)
              setSizeMB(null)
              setTimeout(() => stitchVideo(voiceMode === 'silent'), 100)
            }} disabled={stitching}
              className="px-4 py-2.5 rounded-xl border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 text-sm transition flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5"/> Re-render
            </button>
          </div>
          {stitching && (
            <div className="mt-3 space-y-2">
              <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full transition-all duration-300"
                  style={{width:stitchProgress+'%'}}/>
              </div>
              <p className="text-white/60 text-xs text-center">{stitchLabel}</p>
            </div>
          )}
          <p className="text-white/25 text-xs mt-2 text-center">
            💾 Full HD stitched export only · Click <strong className="text-orange-400">Re-render + Audio</strong> after script changes
          </p>
        </>
      ) : (
        <div className="rounded-xl bg-white/5 border border-white/10 p-6 text-center">
          <Film className="w-10 h-10 text-brand-400/50 mx-auto mb-3"/>
          <p className="text-white font-bold text-sm mb-1">Generate your seamless video</p>
          <div className="text-white/40 text-xs mb-4 space-y-1">
            <p>Stitches all <strong className="text-white">{video.scenes?.length} scenes</strong> into one continuous file</p>
            <p>Takes at least ~{(video.scenes?.length||5)*6}s · <strong className="text-white">Saved permanently</strong></p>
            <p className="text-white/20 mt-1">Requires Chrome · Uses your Groq API key (free)</p>
          </div>

          {/* Logo upload */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <label className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 cursor-pointer text-xs text-white/60 hover:text-white transition">
              🖼️ {logoDataUrl ? 'Change Logo' : 'Add Logo / Watermark'}
              <input type="file" accept="image/*" className="hidden" onChange={e => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = ev => setLogoDataUrl(ev.target.result)
                reader.readAsDataURL(file)
              }}/>
            </label>
            {logoDataUrl && (
              <div className="flex items-center gap-2">
                <img src={logoDataUrl} className="h-8 w-8 object-contain rounded border border-white/20"/>
                <button onClick={() => setLogoDataUrl('')} className="text-white/30 hover:text-red-400 text-xs transition">✕</button>
              </div>
            )}
          </div>


          {stitching ? (
            <div className="space-y-3 px-2">
              <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full transition-all duration-300"
                  style={{width:stitchProgress+'%'}}/>
              </div>
              <p className="text-white/70 text-sm font-semibold">{stitchLabel}</p>
              <p className="text-white/30 text-xs">Rendering export — do not close this tab</p>
              <p className="text-red-400/60 text-xs">⚠️ Do not close or navigate away</p>
            </div>
          ) : (
            <button onClick={() => stitchVideo(false)}
              className={`px-8 py-3 flex items-center gap-2 mx-auto text-sm rounded-xl font-semibold transition ${renderFormat === '9/16' ? 'bg-green-600 hover:bg-green-500 text-white' : 'btn-primary'}`}>
              <Film className="w-4 h-4"/>
              {renderFormat === '9/16' ? 'Generate Portrait Video (Shorts / Instagram Video)' : renderFormat === '1/1' ? 'Generate Square Video' : 'Generate Seamless Video + Voice'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// PREVIEW MODE — Scene-by-scene + per-ratio platform cards
// ─────────────────────────────────────────────────────────────────
function PreviewMode({ video, onGenerateFullVideoWithAudio, ratioBlobUrls, onGenerateRatioVideo, onSchedulePlatform, logoDataUrl, onLogoChange }) {
  const [currentScene, setCurrentScene] = useState(0)
  const [isPlaying,    setIsPlaying]    = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const sceneTimerRef = useRef(null)
  const playerRef     = useRef(null)

  useEffect(()=>{
    const fn=()=>setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange',fn)
    return ()=>document.removeEventListener('fullscreenchange',fn)
  },[])

  useEffect(()=>{ return ()=>clearTimeout(sceneTimerRef.current) },[])

  function toggleFullscreen(){
    const el=playerRef.current; if(!el) return
    if (!document.fullscreenElement) el.requestFullscreen?.()
    else document.exitFullscreen?.()
  }

  function speakText(text) {
    if (!text || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 0.92; u.volume = 1.0; u.pitch = 1.0
    const vs = window.speechSynthesis.getVoices()
    const pv = vs.find(v=>v.name.includes('Google')&&v.lang.startsWith('en'))
            || vs.find(v=>v.lang==='en-US') || vs.find(v=>v.lang.startsWith('en'))
    if (pv) u.voice = pv
    window.speechSynthesis.speak(u)
  }

  function playAll(){
    setIsPlaying(true)
    const sc = video.scenes?.[currentScene]
    if (sc) speakText(sc.voiceover || sc.overlayText || '')
    advanceScene(currentScene)
  }

  function advanceScene(idx){
    clearTimeout(sceneTimerRef.current)
    sceneTimerRef.current=setTimeout(()=>{
      const next=idx+1
      if (next<(video.scenes?.length||0)){
        setCurrentScene(next)
        const sc = video.scenes?.[next]
        if (sc) speakText(sc.voiceover || sc.overlayText || '')
        advanceScene(next)
      } else {
        setIsPlaying(false)
        setCurrentScene(0)
        window.speechSynthesis?.cancel()
        toast('Preview complete!',{icon:'✅'})
      }
    },SCENE_DURATION)
  }

  function stopPlay(){
    setIsPlaying(false)
    clearTimeout(sceneTimerRef.current)
    window.speechSynthesis?.cancel()
  }

  const sc = video.scenes?.[currentScene]
  const total = video.scenes?.length || 0

  return (
    <div className="space-y-4">
    <div className="glass-card p-4">
      <h2 className="font-semibold text-white mb-3 text-sm flex items-center gap-2">
        <MonitorPlay className="w-4 h-4 text-brand-400"/> Scene-by-Scene Preview
      </h2>

      {/* Player */}
      <div ref={playerRef} className="relative rounded-xl overflow-hidden bg-black mb-3" style={{aspectRatio:'16/9'}}>
        {sc?.videoUrl
          ? <video key={sc.videoUrl} src={sc.videoUrl} autoPlay muted loop playsInline preload="auto" className="w-full h-full object-cover"/>
          : <div className="w-full h-full flex items-center justify-center text-5xl bg-gradient-to-br from-slate-900 to-slate-800">🎬</div>
        }
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent flex flex-col justify-end p-4 pointer-events-none">
          <div className="font-bold text-white text-xl drop-shadow-lg mb-1 leading-tight">{sc?.overlayText}</div>
          <div className="text-white/85 text-sm leading-snug">{sc?.voiceover}</div>
        </div>
        <div className="absolute top-3 left-3 bg-blue-600/85 text-white text-xs font-bold px-3 py-1 rounded-full backdrop-blur-sm">
          Scene {sc?.sceneNumber||currentScene+1} / {total}
        </div>
        <button onClick={toggleFullscreen}
          className="absolute bottom-3 right-3 bg-black/55 hover:bg-blue-600/80 text-white rounded-lg px-2.5 py-1.5 text-xs font-medium backdrop-blur-sm border border-white/10 flex items-center gap-1 transition-all">
          {isFullscreen?<Minimize2 className="w-3 h-3"/>:<Maximize2 className="w-3 h-3"/>}
          {isFullscreen?'Exit':'Fullscreen'}
        </button>
        {isPlaying && (
          <div className="absolute top-3 right-3 bg-red-500/85 text-white text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">
            ● Playing
          </div>
        )}
      </div>

      <div className="flex gap-1.5 justify-center mb-3">
        {video.scenes?.map((_,i)=>(
          <div key={i} onClick={()=>{stopPlay();setCurrentScene(i)}}
            className={`h-1.5 rounded-full transition-all cursor-pointer
              ${i===currentScene?'w-5 bg-brand-400':i<currentScene?'w-1.5 bg-green-400':'w-1.5 bg-white/20'}`}/>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <button onClick={()=>isPlaying?stopPlay():playAll()} className="btn-primary px-4 py-2 text-sm flex items-center gap-2">
          {isPlaying?<><Pause className="w-3.5 h-3.5"/>Pause</>:<><Play className="w-3.5 h-3.5"/>Play All</>}
        </button>
        <button onClick={()=>{stopPlay();setCurrentScene(s=>Math.max(0,s-1))}}
          className="px-3 py-2 rounded-xl border border-white/10 text-white/50 hover:text-white hover:bg-white/5 text-sm">⏮</button>
        <button onClick={()=>{stopPlay();setCurrentScene(s=>Math.min(total-1,s+1))}}
          className="px-3 py-2 rounded-xl border border-white/10 text-white/50 hover:text-white hover:bg-white/5 text-sm">⏭</button>
        <button onClick={()=>{stopPlay();setCurrentScene(0)}}
          className="px-3 py-2 rounded-xl border border-white/10 text-white/50 hover:text-white hover:bg-white/5 text-sm">↺</button>
      </div>

      {/* Logo upload for video generation */}
      <div className="flex items-center gap-2 mb-2 px-0.5">
        <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 cursor-pointer text-xs text-white/60 hover:text-white transition flex-shrink-0">
          🖼️ {logoDataUrl ? 'Change Logo' : 'Add Logo'}
          <input type="file" accept="image/*" className="hidden" onChange={e => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = ev => onLogoChange?.(ev.target.result)
            reader.readAsDataURL(file)
          }}/>
        </label>
        {logoDataUrl ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <img src={logoDataUrl} className="h-6 w-6 object-contain rounded border border-white/20 flex-shrink-0"/>
            <span className="text-white/40 text-[10px] truncate">Will be burned into video</span>
            <button onClick={() => onLogoChange?.('')} className="text-white/30 hover:text-red-400 text-xs flex-shrink-0">✕</button>
          </div>
        ) : (
          <span className="text-white/25 text-[10px]">Logo will appear bottom-right in generated video</span>
        )}
      </div>

      {/* Per-ratio generate buttons */}
      <div className="space-y-2 mb-3">
        <p className="text-white/35 text-[11px] text-center uppercase tracking-wider">Generate video per format</p>
        {[
          { cssRatio: '16/9', label: 'Generate 16:9 - YouTube Video | Facebook | LinkedIn | Twitter/X', color: '#3B82F6' },
          { cssRatio: '9/16', label: 'Generate 9:16 - YouTube Shorts | Instagram Video | TikTok', color: '#8B5CF6' },
          { cssRatio: '1/1',  label: 'Generate 1:1 - Instagram Post', color: '#EC4899' },
        ].map(({ cssRatio, label, color }) => {
          const hasBlob = !!ratioBlobUrls?.[cssRatio]
          return (
            <button key={cssRatio}
              onClick={() => { stopPlay(); onGenerateRatioVideo?.(cssRatio) }}
              className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all"
              style={{ background: color + '15', borderColor: color + '35', border: `1px solid ${color}35`, color }}>
              <Film className="w-3.5 h-3.5 flex-shrink-0"/>
              <span className="flex-1 text-left">{label}</span>
              {hasBlob && <span className="text-[10px] opacity-60">✓ ready · re-generate</span>}
            </button>
          )
        })}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {video.scenes?.map((s,i)=>(
          <div key={i} onClick={()=>{stopPlay();setCurrentScene(i)}}
            className={`flex-shrink-0 w-18 rounded-lg overflow-hidden border-2 cursor-pointer transition-all
              ${i===currentScene?'border-brand-400':'border-white/10 hover:border-white/30'}`}
            style={{width:'72px'}}>
            {s.videoUrl
              ?<video src={s.videoUrl} muted preload="metadata" className="w-full aspect-video object-cover"/>
              :<div className="w-full aspect-video bg-slate-800 flex items-center justify-center text-lg">🎬</div>}
            <div className="bg-black/70 text-white text-center py-0.5" style={{fontSize:'0.52rem'}}>Scene {s.sceneNumber||i+1}</div>
          </div>
        ))}
      </div>
    </div>

    {/* Platform ratio preview cards */}
    <PreviewRatioPlatformCards
      ratioBlobUrls={ratioBlobUrls}
      previewUrl={video.scenes?.[0]?.videoUrl || null}
      onGenerateRatioVideo={cssRatio => { stopPlay(); onGenerateRatioVideo?.(cssRatio) }}
      onSchedulePlatform={onSchedulePlatform}
      sceneText={video.scenes?.[0]?.overlayText}
    />
    </div>
  )
}

// Derive platformSubtype map from selected card IDs like 'youtube_shorts', 'instagram_reels'
function deriveSubtypeFromCards(cardIds) {
  const sub = {}
  if (cardIds.includes('youtube_shorts')) sub.youtube = 'shorts'
  else if (cardIds.includes('youtube')) sub.youtube = 'video'
  if (cardIds.includes('instagram_reels')) sub.instagram = 'reels'
  else if (cardIds.includes('instagram_post')) sub.instagram = 'post'
  return sub
}

function normalizeRatio(value) {
  return String(value || '').trim().replace(/:/g, '/')
}

function mapCardIdsToPlatforms(cardIds) {
  if (!Array.isArray(cardIds) || cardIds.length === 0) return []
  return [...new Set(cardIds.map(id =>
    id === 'youtube_shorts' ? 'youtube' :
    id === 'instagram_reels' ? 'instagram' :
    id === 'instagram_post' ? 'instagram' :
    id
  ))]
}

function resolveScheduleRatio(selectedPlatforms, platformSubtype) {
  if (selectedPlatforms.includes('youtube') && platformSubtype?.youtube === 'shorts') return '9/16'
  if (selectedPlatforms.includes('instagram') && platformSubtype?.instagram === 'reels') return '9/16'
  if (selectedPlatforms.includes('instagram') && platformSubtype?.instagram === 'post') return '1/1'
  return '16/9'
}

function getCardPlatform(cardId) {
  if (cardId === 'youtube_shorts') return 'youtube'
  if (cardId === 'instagram_reels') return 'instagram'
  if (cardId === 'instagram_post') return 'instagram'
  return cardId
}

function getCardSubtype(cardId) {
  if (cardId === 'youtube_shorts') return 'shorts'
  if (cardId === 'instagram_reels') return 'reels'
  if (cardId === 'instagram_post') return 'post'
  return 'video'
}

// ── Schedule Panel (enhanced with per-platform scheduling) ────────
function SchedulePanel({ video, renderedBlob, onDone, initialPlatforms = [], renderFormat }) {
  const navigate = useNavigate()
  const postKit = buildSocialPostKit(video)
  const [accounts, setAccounts] = useState([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const initialPlatformKey = initialPlatforms.join('|')
  // Derive clean platform IDs and subtype from card selections
  const [platformSubtype, setPlatformSubtype] = useState(() => deriveSubtypeFromCards(initialPlatforms))
  // Map platform card IDs (e.g. 'youtube_shorts') → API platform IDs (e.g. 'youtube')
  const [selectedPlatforms, setSelectedPlatforms] = useState(() => mapCardIdsToPlatforms(initialPlatforms))
  const [scheduledAt, setScheduledAt] = useState('')
  const [caption,     setCaption]     = useState(postKit.caption)
  const [hashtags,    setHashtags]    = useState(postKit.hashtagsText)
  const [done,        setDone]        = useState(false)
  // Per-platform scheduling
  const [usePerPlatformTime, setUsePerPlatformTime] = useState(false)
  const [platformTimes, setPlatformTimes] = useState({})
  const { user, updateUser, refreshUser } = useAuthStore()
  const accountId = user?.id || 'guest'

  useEffect(() => {
    setCaption(postKit.caption)
    setHashtags(postKit.hashtagsText)
  }, [video?.title, video?.topic, video?.description, video?.script, video?.fullScript, video?.scenes])

  useEffect(() => {
    if (!initialPlatforms.length) return
    setPlatformSubtype(deriveSubtypeFromCards(initialPlatforms))
    setSelectedPlatforms(mapCardIdsToPlatforms(initialPlatforms))
  }, [initialPlatformKey])

  useEffect(() => {
    let active = true
    async function loadAccounts() {
      setLoadingAccounts(true)
      try {
        const res = await socialAccountsApi.list()
        const data = Array.isArray(res.data) ? res.data : (res.data?.results || [])
        const activeAccounts = data.filter(a => a.is_active)
        if (!active) return
        setAccounts(activeAccounts)
        // Only auto-select if no pre-selection from platform cards
        if (!initialPlatforms.length) {
          const availablePlatforms = [...new Set(activeAccounts.map(a => a.platform))]
          setSelectedPlatforms(availablePlatforms.slice(0, 1))
        }
      } catch (err) {
        if (active) toast.error('Failed to load connected accounts')
      } finally {
        if (active) setLoadingAccounts(false)
      }
    }
    loadAccounts()
    return () => { active = false }
  }, [])

  function toggle(id){ setSelectedPlatforms(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]) }

  function setPlatformTime(platformId, value) {
    setPlatformTimes(prev => ({ ...prev, [platformId]: value }))
  }

  async function buildFormData(blob, scheduleRows) {
    const manualHashtags = parseHashtags(hashtags)
    const captionHashtags = parseHashtags(caption.match(/#[\w-]+/g)?.join(' ') || '')
    const videoHashtags = parseHashtags((video.hashtags || video.ai_hashtags || video.edited_hashtags || []).join(' '))
    const combinedHashtags = [...new Set([...videoHashtags, ...manualHashtags, ...captionHashtags])]

    const extension = blob.type.includes('mp4') ? 'mp4' : 'webm'
    const file = new File(
      [blob],
      `${(video.title || 'video').replace(/[^a-z0-9]+/gi,'_').toLowerCase()}.${extension}`,
      { type: blob.type || 'video/webm' }
    )
    const formData = new FormData()
    formData.append('file', file)
    formData.append('title', video.title || postKit.title || 'Generated Video')
    formData.append('description', video.description || postKit.description || '')
    formData.append('topic', video.topic || video.script || video.title || 'Generated video')
    formData.append('content_type', video.content_type || 'promotional')
    formData.append('tone', video.tone || '')
    formData.append('duration_seconds', String(video.duration_seconds || 30))
    formData.append('caption', caption)
    formData.append('client_video_id', String(video.creationId || video.id || ''))
    formData.append('client_video_source', video.source || '')
    const access = getAccessLevel(user)
    const subscriptionStartedAt = user?.subscription_started_at || access.subscription?.subscribedAt || ''
    if (access.isSubscribed && subscriptionStartedAt) {
      formData.append('local_subscription_active', '1')
      formData.append('local_subscription_started_at', subscriptionStartedAt)
      formData.append('local_subscription_status', access.subscription?.status || user?.subscription_status || 'active')
      formData.append('local_subscription_plan', access.subscription?.plan || user?.subscription_plan || 'pro')
    }
    combinedHashtags.forEach(tag => formData.append('hashtags', tag))
    formData.append('schedules', JSON.stringify(scheduleRows))
    return formData
  }

  async function handleSchedule(){
    const latestUser = await refreshUser().catch(() => null)
    if (latestUser) updateUser(latestUser)

    const hasPreviewCardSelection = initialPlatforms.length > 0
    const selectedPlatformIds = hasPreviewCardSelection
      ? [...new Set(initialPlatforms.map(getCardPlatform))]
      : selectedPlatforms
    const activeRenderRatio = normalizeRatio(renderFormat || video?.videoFormat || '16/9')
    const scheduleRatio = hasPreviewCardSelection
      ? resolveScheduleRatio(selectedPlatformIds, platformSubtype)
      : activeRenderRatio

    if (!selectedPlatformIds.length) { toast.error('Select at least one platform'); return }

    // Validate times
    if (usePerPlatformTime) {
      for (const pId of selectedPlatformIds) {
        const t = platformTimes[pId]
        const pLabel = PLATFORMS.find(p => p.id === pId)?.label || pId
        if (!t) { toast.error(`Set a schedule time for ${pLabel}`); return }
        if (new Date(t).getTime() <= Date.now() + 60000) {
          toast.error(`${pLabel}: pick a time at least 1 minute in the future`); return
        }
      }
    } else {
      if (!scheduledAt) { toast.error('Pick a date & time'); return }
      if (new Date(scheduledAt).getTime() <= Date.now() + 60000) {
        toast.error('Pick a future date and time at least 1 minute ahead.'); return
      }
    }

    const legacyKey = scheduleRatio === '16/9' ? (video.blobKey || `sm_stitched_${video.id}`) : null
    const currentRatioKey = getRatioBlobKey(video.id, scheduleRatio)
    const blob = (normalizeRatio(renderFormat || video?.videoFormat || '16/9') === scheduleRatio ? renderedBlob : null)
      || await loadBlob(currentRatioKey)
      || (legacyKey ? await loadBlob(legacyKey) : null)
    if (!blob) {
      toast.error('Generate a video first so it can be uploaded')
      return
    }
    const blobSizeMb = blob.size / 1024 / 1024
    if (blobSizeMb > MAX_UPLOAD_SIZE_MB) {
      toast.error(`Video is too large to upload (${blobSizeMb.toFixed(1)} MB). Re-render a smaller file before scheduling.`)
      return
    }

    setSubmitting(true)
    try {
      let projectId, backendPosts = []
      const scheduleRows = []
      const allManualHashtags = parseHashtags(hashtags)

      if (hasPreviewCardSelection) {
        for (const cardId of initialPlatforms) {
          const platform = getCardPlatform(cardId)
          const subtype = getCardSubtype(cardId)
          const targetAccounts = accounts.filter(a => a.platform === platform)
          if (!targetAccounts.length) {
            toast.error(`Connect a ${platform} account in Settings first`)
            return
          }
          const scheduledIso = usePerPlatformTime
            ? new Date(platformTimes[platform] || platformTimes[cardId] || scheduledAt || Date.now()).toISOString()
            : new Date(scheduledAt).toISOString()
          for (const account of targetAccounts) {
            scheduleRows.push({
              social_account: account.id,
              scheduled_at: scheduledIso,
              caption,
              hashtags: allManualHashtags,
              platform_subtype: subtype,
            })
          }
        }
      } else {
        for (const pId of selectedPlatforms) {
          const targetAccounts = accounts.filter(a => a.platform === pId)
          if (!targetAccounts.length) continue
          const scheduledIso = usePerPlatformTime
            ? new Date(platformTimes[pId]).toISOString()
            : new Date(scheduledAt).toISOString()
          const subtype = platformSubtype?.[pId] || (pId === 'youtube' ? 'video' : pId === 'instagram' ? 'reels' : '')
          for (const account of targetAccounts) {
            scheduleRows.push({
              social_account: account.id,
              scheduled_at: scheduledIso,
              caption,
              hashtags: allManualHashtags,
              platform_subtype: subtype,
            })
          }
        }
      }

      if (!scheduleRows.length) {
        toast.error('Connect a social account in Settings first')
        return
      }

      const formData = await buildFormData(blob, scheduleRows)
      const res = await videosApi.scheduleLocalVideo(formData)
      await refreshUser().catch(() => null)
      projectId = res.data?.project?.id
      backendPosts = Array.isArray(res.data?.posts) ? res.data.posts : []

      const all=JSON.parse(localStorage.getItem(getLocalVideosKey(accountId))||'[]')
      const primaryTime = usePerPlatformTime
        ? (platformTimes[selectedPlatformIds[0]] || new Date().toISOString())
        : scheduledAt
      const nextPostStatus = new Date(primaryTime).getTime() <= Date.now() ? 'publishing' : 'scheduled'
      const updated=all.map(v=>v.id===video.id
        ? appendScheduleEntry(v, {
            scheduledAt: new Date(primaryTime).toISOString(),
            scheduledPlatforms: selectedPlatformIds,
            platformSubtype,
            scheduledTitle: video.title || postKit.title || 'Generated Video',
            scheduledDescription: caption || postKit.description || '',
            scheduledCaption: caption,
            scheduledHashtags: hashtags,
            scheduledCopyKit: postKit,
            postStatus: nextPostStatus,
            backendProjectId: projectId,
            backendPosts,
          })
        : v)
      localStorage.setItem(getLocalVideosKey(accountId),JSON.stringify(updated))
      window.dispatchEvent(new Event('socialmind:local-videos-changed'))
      toast.success(`✅ Scheduled to ${scheduleRows.length} post${scheduleRows.length!==1?'s':''}!`)
      setDone(true)
      setTimeout(() => {
        onDone?.()
        navigate('/schedule')
      }, 1500)
    } catch(e){
      await refreshUser().catch(() => null)
      const status = e?.response?.status
      const serverMessage = e?.response?.data?.error || e?.response?.data?.detail || e?.response?.data?.message
      if (status === 413) {
        toast.error('Video file is too large for upload. Increase Nginx upload limit.')
      } else {
        toast.error(serverMessage || e?.message || 'Failed to schedule social post')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (done) return (
    <div className="glass-card p-6 text-center">
      <div className="text-4xl mb-2">🎉</div>
      <p className="text-white font-semibold">Post Scheduled!</p>
      <p className="text-white/40 text-xs mt-1">Redirecting to Schedule...</p>
    </div>
  )

  return (
    <div className="glass-card p-5 space-y-5 border border-brand-600/30">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-brand-400 uppercase tracking-wider flex items-center gap-2">
          <Calendar className="w-4 h-4" /> Schedule Post
        </div>
      </div>

      {/* Platform selection */}
      <div>
        <label className="label mb-1.5 block text-xs">Platforms <span className="text-white/30">(select multiple)</span></label>
        <div className="grid grid-cols-2 gap-1.5">
          {PLATFORMS.map(p=>{
            const sel=selectedPlatforms.includes(p.id)
            const available = accounts.some(a => a.platform === p.id)
            return (
              <button key={p.id} onClick={()=>available && toggle(p.id)} disabled={!available || loadingAccounts}
                className={`flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all text-left
                  ${sel?'border-brand-500 bg-brand-600/15 text-white':'border-white/10 text-white/50 hover:border-white/25'}
                  ${!available?'opacity-35 cursor-not-allowed':''}`}>
                <span className="text-lg">{p.icon}</span>
                <span className="text-xs font-medium truncate">{p.label}</span>
                <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ml-auto ${sel?'border-brand-400 bg-brand-400':'border-white/20'}`}>
                  {sel&&<div className="w-1.5 h-1.5 rounded-full bg-white mx-auto mt-px"/>}
                </div>
              </button>
            )
          })}
        </div>
        {loadingAccounts && <p className="text-xs text-white/40 mt-1.5">Loading connected accounts…</p>}
        {!loadingAccounts && !accounts.length && (
          <p className="text-xs text-red-400 mt-1.5">No connected accounts. Open Settings and connect a platform first.</p>
        )}
      </div>

      {/* Per-platform schedule toggle */}
      {selectedPlatforms.length > 1 && (
        <div className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-white/5 border border-white/10">
          <div>
            <div className="text-white text-xs font-semibold">Different times per platform</div>
            <div className="text-white/35 text-[11px]">Set individual publish times for each platform</div>
          </div>
          <button
            onClick={() => setUsePerPlatformTime(v => !v)}
            className={`w-10 h-5 rounded-full transition-all relative flex-shrink-0
              ${usePerPlatformTime ? 'bg-brand-500' : 'bg-white/15'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all
              ${usePerPlatformTime ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>
      )}

      {/* Schedule time inputs */}
      {usePerPlatformTime && selectedPlatforms.length > 1 ? (
        <div className="space-y-3">
          <div className="text-white/50 text-xs font-medium">Set publish time per platform</div>
          {selectedPlatforms.map(pId => {
            const p = PLATFORMS.find(x => x.id === pId)
            return (
              <div key={pId} className="glass rounded-xl p-3">
                <label className="flex items-center gap-2 text-xs text-white/70 font-medium mb-2">
                  <span>{p?.icon}</span> {p?.label}
                </label>
                <input
                  type="datetime-local"
                  className="input w-full text-xs"
                  value={platformTimes[pId] || ''}
                  onChange={e => setPlatformTime(pId, e.target.value)}
                  min={(() => {
                    const d = new Date()
                    const offset = d.getTimezoneOffset()
                    return new Date(d.getTime() - offset * 60 * 1000).toISOString().slice(0, 16)
                  })()}
                />
              </div>
            )
          })}
        </div>
      ) : (
        <div>
          <label className="label text-xs">Date & Time</label>
          <input type="datetime-local" className="input w-full mt-1" value={scheduledAt}
            onChange={e=>setScheduledAt(e.target.value)} min={(() => {
              const d = new Date()
              const offset = d.getTimezoneOffset()
              return new Date(d.getTime() - offset * 60 * 1000).toISOString().slice(0, 16)
            })()}/>
        </div>
      )}

      {/* Caption */}
      <div>
        <label className="label text-xs">Caption ({caption.length} chars)</label>
        <textarea className="input resize-none w-full mt-1" rows={3} value={caption} onChange={e=>setCaption(e.target.value)}/>
      </div>

      {/* Hashtags */}
      <div>
        <label className="label text-xs flex items-center gap-1.5"><Hash className="w-3 h-3" /> Hashtags</label>
        <textarea
          className="input resize-none w-full mt-1"
          rows={2}
          value={hashtags}
          onChange={e => setHashtags(e.target.value)}
          placeholder="#hashtag1 #hashtag2"
        />
        <p className="text-white/30 text-[11px] mt-1">Separate hashtags with spaces or commas.</p>
      </div>

      <button onClick={handleSchedule} disabled={submitting || loadingAccounts || !selectedPlatforms.length || (!usePerPlatformTime && !scheduledAt)}
        className="w-full btn-primary flex items-center justify-center gap-2 py-2.5 disabled:opacity-40 text-sm">
        {submitting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}
        Schedule to {selectedPlatforms.length} Platform{selectedPlatforms.length!==1?'s':''}
      </button>

      <p className="text-white/30 text-xs leading-relaxed">
        This creates real backend scheduled posts for your connected accounts. Instagram and Facebook still need the uploaded video to be publicly reachable, so use <code className="text-white/50">PUBLIC_APP_URL</code> or S3 in deployment.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// PREVIEW DEVICE FRAME — phone / monitor / square shell
// ─────────────────────────────────────────────────────────────────
function PreviewDeviceFrame({ ratio, children }) {
  if (ratio === '9:16') {
    return (
      <div className="relative mx-auto" style={{ width: '80%', maxWidth: 130 }}>
        <div className="rounded-2xl overflow-hidden relative"
          style={{ aspectRatio: '9/16', border: '2px solid rgba(255,255,255,0.18)', background: '#000',
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}>
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 z-20 rounded-full bg-black"
            style={{ width: 30, height: 6 }} />
          {children}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-20 rounded-full bg-white/25"
            style={{ width: 22, height: 3 }} />
        </div>
      </div>
    )
  }
  if (ratio === '16:9') {
    return (
      <div>
        <div className="rounded-lg overflow-hidden relative"
          style={{ aspectRatio: '16/9', border: '2px solid rgba(255,255,255,0.18)', background: '#000',
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}>
          {children}
        </div>
        <div className="flex justify-center mt-0.5">
          <div style={{ width: 32, height: 5, background: 'rgba(255,255,255,0.08)' }} className="rounded-b" />
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-xl overflow-hidden relative"
      style={{ aspectRatio: '1/1', border: '2px solid rgba(255,255,255,0.18)', background: '#000',
        boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// PREVIEW PLATFORM CARD — compact card per platform
// ─────────────────────────────────────────────────────────────────
function PreviewPlatformCard({ platform, blobUrl, sceneText, onSchedule }) {
  const rc = platform.color
  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center gap-1 px-0.5">
        <span className="text-sm leading-none">{platform.icon}</span>
        <span className="text-[11px] font-bold text-white truncate flex-1">{platform.label}</span>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{ background: rc + '20', color: rc, border: `1px solid ${rc}40` }}>
          {platform.ratio}
        </span>
      </div>

      {/* Device frame */}
      <div className="relative">
        <PreviewDeviceFrame ratio={platform.ratio}>
          {blobUrl ? (
            <video src={blobUrl} muted loop autoPlay playsInline
              className="absolute inset-0 w-full h-full object-contain" style={{ background: '#000' }} />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1"
              style={{ background: `linear-gradient(135deg, ${rc}12, #000)` }}>
              <Film className="w-5 h-5 text-white/15" />
              <span className="text-[9px] text-white/20 text-center px-2">Generate video first</span>
            </div>
          )}
          {blobUrl && (
            <div className="absolute top-1.5 left-1.5 z-10 flex items-center gap-0.5 px-1 py-0.5 rounded-full"
              style={{ background: 'rgba(0,0,0,0.65)' }}>
              <div className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-[8px] font-bold">LIVE</span>
            </div>
          )}
          {sceneText && blobUrl && (
            <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)', padding: '10px 5px 6px' }}>
              <p className="text-white text-[8px] leading-snug line-clamp-2 font-medium">{sceneText}</p>
            </div>
          )}
        </PreviewDeviceFrame>
        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3/4 h-3 blur-xl rounded-full pointer-events-none"
          style={{ background: rc + '30' }} />
      </div>

      {/* Schedule button */}
      <button onClick={onSchedule}
        className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold transition hover:opacity-80"
        style={{ background: rc + '15', color: rc, border: `1px solid ${rc}30` }}>
        <Calendar className="w-3 h-3" /> Schedule
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// PREVIEW RATIO PLATFORM CARDS — groups all platforms by ratio
// ─────────────────────────────────────────────────────────────────
function PreviewRatioPlatformCards({ ratioBlobUrls, previewUrl, onGenerateRatioVideo, onSchedulePlatform, sceneText }) {
  const landscape = PREVIEW_PLATFORM_CONFIGS.filter(p => p.cssRatio === '16/9')
  const portrait  = PREVIEW_PLATFORM_CONFIGS.filter(p => p.cssRatio === '9/16')
  const square    = PREVIEW_PLATFORM_CONFIGS.filter(p => p.cssRatio === '1/1')

  const RatioHeader = ({ label, cssRatio, color }) => (
    <div className="flex items-center justify-between mb-3">
      <span className="text-xs font-bold" style={{ color }}>{label}</span>
      <button onClick={() => onGenerateRatioVideo?.(cssRatio)}
        className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold transition hover:opacity-80"
        style={{ background: color + '18', color, border: `1px solid ${color}35` }}>
        <Film className="w-3 h-3" />
        {ratioBlobUrls?.[cssRatio] ? '✓ Re-generate' : 'Generate'} {cssRatio.replace('/', ':')} Video
      </button>
    </div>
  )

  return (
    <div className="glass-card p-5 space-y-8">
      <div className="text-xs font-semibold text-brand-400 uppercase tracking-wider flex items-center gap-2">
        <Layout className="w-3.5 h-3.5" /> Platform Format Previews
        <span className="text-white/25 font-normal normal-case tracking-normal">— click Schedule on any card to post</span>
      </div>

      {/* 16:9 Landscape */}
      <div>
        <RatioHeader label="16:9 Landscape - YouTube Video | Facebook | LinkedIn | Twitter/X" cssRatio="16/9" color="#3B82F6" />
        <div className="grid grid-cols-2 gap-4">
          {landscape.map(p => (
            <PreviewPlatformCard key={p.id} platform={p}
              blobUrl={ratioBlobUrls?.['16/9'] || null} sceneText={sceneText}
              onSchedule={() => onSchedulePlatform?.(p.id)} />
          ))}
        </div>
      </div>

      {/* 9:16 Portrait */}
      <div>
        <RatioHeader label="9:16 Portrait - YouTube Shorts | Instagram Video | TikTok" cssRatio="9/16" color="#8B5CF6" />
        <div className="grid grid-cols-3 gap-3 mx-auto" style={{ maxWidth: 520 }}>
          {portrait.map(p => (
            <PreviewPlatformCard key={p.id} platform={p}
              blobUrl={ratioBlobUrls?.['9/16'] || null} sceneText={sceneText}
              onSchedule={() => onSchedulePlatform?.(p.id)} />
          ))}
        </div>
      </div>

      {/* 1:1 Square */}
      <div>
        <RatioHeader label="1:1 Square - Instagram Post" cssRatio="1/1" color="#EC4899" />
        <div className="mx-auto" style={{ maxWidth: 220 }}>
          {square.map(p => (
            <PreviewPlatformCard key={p.id} platform={p}
              blobUrl={ratioBlobUrls?.['1/1'] || null} sceneText={sceneText}
              onSchedule={() => onSchedulePlatform?.(p.id)} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Canvas helpers ────────────────────────────────────────────────
function canvasWrapText(ctx,text,x,y,maxW,lineH){
  const words=text.split(' ');let line='';const lines=[]
  for(const w of words){const t=line+w+' ';if(ctx.measureText(t).width>maxW&&line!==''){lines.push(line.trim());line=w+' '}else line=t}
  if(line)lines.push(line.trim())
  for(let i=0;i<lines.length;i++)ctx.fillText(lines[i],x,y+(i-(lines.length-1))*lineH)
}
function canvasRoundRect(ctx,x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r)
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h)
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y)
  ctx.closePath();ctx.fill()
}
