import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, ChevronDown, Sparkles, CheckCircle, XCircle, Calendar, Download,
  Loader2, Maximize2, Minimize2, AlertTriangle, ShieldCheck, Send, Save, RefreshCw, Play
} from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi, apiKeysApi } from '@/api/client'
import { appendScheduleEntry } from '@/utils/localVideoSchedules'
import { buildSocialPostKit } from '@/utils/socialPostKit'
import { useAuthStore } from '@/store/auth'
import { getLocalVideosKey } from '@/utils/accountStorage'
import { isPro, isTrialExhausted, monthlyVideoQuota, TRIAL_VIDEO_LIMIT } from '@/utils/subscription'

const SCENE_DURATION = 6000

// ── IndexedDB helpers — store/retrieve video blob by key ──────────
const DB_NAME = 'socialmind_videos', DB_STORE = 'blobs', DB_VERSION = 1

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => e.target.result.createObjectStore(DB_STORE)
    req.onsuccess = e => res(e.target.result)
    req.onerror   = () => rej(req.error)
  })
}
async function saveBlob(key, blob) {
  try {
    const db = await openDB()
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(blob, key)
    return new Promise((res,rej)=>{ tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error) })
  } catch { return false }
}
async function loadBlob(key) {
  try {
    const db = await openDB()
    const tx = db.transaction(DB_STORE, 'readonly')
    const req = tx.objectStore(DB_STORE).get(key)
    return new Promise((res,rej)=>{ req.onsuccess=()=>res(req.result||null); req.onerror=()=>rej(req.error) })
  } catch { return null }
}

// ── Platform definitions ──────────────────────────────────────────
// Legacy list kept for ReviewSection compatibility checks
const PLATFORMS = [
  { id:'instagram', label:'Instagram',  icon:'📸', rules:{ maxChars:2200,  maxHashtags:30,  maxDuration:60  } },
  { id:'facebook',  label:'Facebook',   icon:'👥', rules:{ maxChars:63206, maxHashtags:10,  maxDuration:240 } },
  { id:'linkedin',  label:'LinkedIn',   icon:'💼', rules:{ maxChars:3000,  maxHashtags:5,   maxDuration:600 } },
  { id:'youtube',   label:'YouTube',    icon:'▶️', rules:{ maxChars:5000,  maxHashtags:15,  maxDuration:900 } },
  { id:'twitter',   label:'Twitter/X',  icon:'🐦', rules:{ maxChars:280,   maxHashtags:3,   maxDuration:140 } },
]

// Full platform list with aspect ratio + brand color for the visual selector
const ALL_PLATFORMS = [
  // ── 16:9 Landscape ────────────────────────────────────────────
  { id:'facebook',       label:'Facebook',        icon:'👥', color:'#1877F2',
    ratio:'16:9', cssRatio:'16/9', category:'Landscape',
    rules:{ maxChars:63206, maxHashtags:10,  maxDuration:240 } },
  { id:'linkedin',       label:'LinkedIn',         icon:'💼', color:'#0A66C2',
    ratio:'16:9', cssRatio:'16/9', category:'Landscape',
    rules:{ maxChars:3000,  maxHashtags:5,   maxDuration:600 } },
  { id:'twitter',        label:'Twitter/X',        icon:'🐦', color:'#1DA1F2',
    ratio:'16:9', cssRatio:'16/9', category:'Landscape',
    rules:{ maxChars:280,   maxHashtags:3,   maxDuration:140 } },
  { id:'youtube',        label:'YouTube',          icon:'▶️', color:'#FF0000',
    ratio:'16:9', cssRatio:'16/9', category:'Landscape',
    rules:{ maxChars:5000,  maxHashtags:15,  maxDuration:900 } },
  // ── 9:16 Portrait ─────────────────────────────────────────────
  { id:'instagram',      label:'Instagram Reels',  icon:'📸', color:'#E1306C',
    ratio:'9:16', cssRatio:'9/16', category:'Portrait',
    rules:{ maxChars:2200,  maxHashtags:30,  maxDuration:60  } },
  { id:'youtube_shorts', label:'YouTube Shorts',   icon:'▶️', color:'#FF4500',
    ratio:'9:16', cssRatio:'9/16', category:'Portrait',
    rules:{ maxChars:5000,  maxHashtags:15,  maxDuration:60  } },
  { id:'tiktok',         label:'TikTok',           icon:'🎵', color:'#69C9D0',
    ratio:'9:16', cssRatio:'9/16', category:'Portrait',
    rules:{ maxChars:2200,  maxHashtags:20,  maxDuration:60  } },
  // ── 1:1 Square ────────────────────────────────────────────────
  { id:'instagram_post', label:'Instagram Post',   icon:'📷', color:'#C13584',
    ratio:'1:1',  cssRatio:'1/1',  category:'Square',
    rules:{ maxChars:2200,  maxHashtags:30,  maxDuration:60  } },
]

// Ratio → human-readable label shown in group headers
const RATIO_CATEGORY_LABEL = {
  '16:9': 'Landscape — Facebook, LinkedIn, Twitter/X, YouTube',
  '9:16': 'Portrait — Instagram Reels, YouTube Shorts, TikTok',
  '1:1':  'Square — Instagram Posts',
}

// Three ratio families used for ratio-based scheduling
const RATIO_GROUPS = [
  {
    ratio: '16:9', cssRatio: '16/9', label: 'Landscape', color: '#3B82F6',
    platforms: ['Facebook', 'LinkedIn', 'Twitter/X', 'YouTube Videos'],
    platformIcons: ['👥', '💼', '🐦', '▶️'],
    platformIds: ['facebook', 'linkedin', 'twitter', 'youtube'],
  },
  {
    ratio: '9:16', cssRatio: '9/16', label: 'Portrait', color: '#8B5CF6',
    platforms: ['Instagram Reels', 'YouTube Shorts'],
    platformIcons: ['📸', '▶️'],
    platformIds: ['instagram', 'youtube_shorts'],
  },
  {
    ratio: '1:1', cssRatio: '1/1', label: 'Square', color: '#EC4899',
    platforms: ['Instagram Post'],
    platformIcons: ['📷'],
    platformIds: ['instagram_post'],
  },
]

// Maps each platform id to its CSS aspect-ratio value (used for canvas recording)
const PLATFORM_FORMAT = Object.fromEntries(ALL_PLATFORMS.map(p => [p.id, p.cssRatio]))

// All platforms with their canonical ratio — used for platform-card scheduling
const PLATFORM_SCHEDULE_CONFIGS = [
  { id: 'youtube_shorts',  label: 'YouTube Shorts',   icon: '▶️', color: '#FF0000', ratio: '9:16', format: 'shorts'       },
  { id: 'instagram_reels', label: 'Instagram Reels',  icon: '📸', color: '#E1306C', ratio: '9:16', format: 'reel'         },
  { id: 'tiktok',          label: 'TikTok',           icon: '🎵', color: '#69C9D0', ratio: '9:16', format: 'video'        },
  { id: 'youtube',         label: 'YouTube',          icon: '▶️', color: '#FF0000', ratio: '16:9', format: 'video'        },
  { id: 'facebook',        label: 'Facebook',         icon: '👥', color: '#1877F2', ratio: '16:9', format: 'feed_video'   },
  { id: 'linkedin',        label: 'LinkedIn',         icon: '💼', color: '#0A66C2', ratio: '16:9', format: 'company_post' },
  { id: 'twitter',         label: 'Twitter / X',      icon: '🐦', color: '#1DA1F2', ratio: '16:9', format: 'post'         },
  { id: 'instagram_post',  label: 'Instagram Feed',   icon: '📷', color: '#E1306C', ratio: '1:1',  format: 'post'         },
]

// Per-ratio platform options for scheduling — platform + display format label
const RATIO_PLATFORM_OPTIONS = {
  '16:9': [
    { id: 'youtube',  label: 'YouTube Video',   icon: '▶️', format: 'video',        color: '#FF0000' },
    { id: 'facebook', label: 'Facebook Video',  icon: '👥', format: 'feed_video',   color: '#1877F2' },
    { id: 'linkedin', label: 'LinkedIn Post',   icon: '💼', format: 'company_post', color: '#0A66C2' },
    { id: 'twitter',  label: 'Twitter/X Post',  icon: '🐦', format: 'post',         color: '#1DA1F2' },
  ],
  '9:16': [
    { id: 'youtube_shorts',  label: 'YouTube Shorts',   icon: '▶️', format: 'shorts', color: '#FF0000' },
    { id: 'instagram_reels', label: 'Instagram Reels',  icon: '📸', format: 'reel',   color: '#E1306C' },
    { id: 'tiktok',          label: 'TikTok Video',     icon: '🎵', format: 'video',  color: '#010101' },
  ],
  '1:1': [
    { id: 'instagram_post', label: 'Instagram Post', icon: '📷', format: 'post', color: '#E1306C' },
  ],
}


const FLAGGED_TERMS = [
  { term:'guaranteed',   reason:'Misleading guarantee claims may be flagged.' },
  { term:'free money',   reason:'Financial bait language violates platform policies.' },
  { term:'click now',    reason:'Aggressive CTA may reduce organic reach.' },
  { term:'limited time', reason:'Urgency tactics can trigger spam filters.' },
  { term:'miracle',      reason:'Unverified miracle claims are policy violations.' },
  { term:'cure',         reason:'Medical cure claims require disclaimers.' },
  { term:'lose weight',  reason:'Weight-loss claims need substantiation.' },
  { term:'100%',         reason:'Absolute claims may be considered misleading.' },
  { term:'best price',   reason:'Superlative pricing claims may need substantiation.' },
]

const VIDEO_KEY = 'sm_current_video'
const QUOTA_CONSUMED_KEY = 'sm_quota_consumed_videos'

function getVideoBlobKey(creationId) {
  return `sm_stitched_${creationId || 'current'}`
}

function deriveGeneratedHashtags(video) {
  const values = [
    video?.title,
    video?.topic,
    ...(Array.isArray(video?.scenes) ? video.scenes.flatMap(scene => Array.isArray(scene?.tags) ? scene.tags : []) : []),
  ]

  const tokens = values
    .flatMap(value => String(value || '').split(/[^a-zA-Z0-9]+/))
    .map(token => token.trim())
    .filter(token => token.length >= 3)
    .map(token => `#${token.replace(/^#+/, '').toLowerCase()}`)

  return [...new Set(tokens)].slice(0, 12)
}

function parseHashtagText(value) {
  return [...new Set(
    String(value || '')
      .split(/[\s,]+/)
      .map(tag => tag.trim())
      .filter(Boolean)
      .map(tag => (tag.startsWith('#') ? tag : `#${tag.replace(/^#+/, '')}`))
  )]
}

function parseAiVideoResponse(content) {
  const cleaned = String(content || '').replace(/```json|```/gi, '').trim()
  if (!cleaned) {
    throw new Error('Empty AI response')
  }

  try {
    return JSON.parse(cleaned)
  } catch {}

  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const slice = cleaned.slice(firstBrace, lastBrace + 1)
    try {
      return JSON.parse(slice)
    } catch {}
  }

  throw new Error('Could not parse AI response. Try again.')
}

function createVideoCreationId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `video_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function getQuotaConsumedKey(accountId) {
  return `${QUOTA_CONSUMED_KEY}:${accountId || 'guest'}`
}

function markQuotaConsumed(accountId, creationId) {
  if (!creationId) return true
  try {
    const key = getQuotaConsumedKey(accountId)
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    const consumed = new Set((Array.isArray(parsed) ? parsed : []).map(String))
    const normalizedId = String(creationId)
    if (consumed.has(normalizedId)) return false
    consumed.add(normalizedId)
    localStorage.setItem(key, JSON.stringify([...consumed]))
    return true
  } catch {
    return true
  }
}

function syncVideoUsage(user, updateUser, creationId) {
  if (!user) return

  const accountId = user?.id || 'guest'
  if (!markQuotaConsumed(accountId, creationId)) return

  const nextUsed = (user.videos_generated_this_month || 0) + 1
  const monthlyQuota = user.effective_monthly_video_quota || user.monthly_video_quota || 50
  updateUser({
    videos_generated_this_month: nextUsed,
    quota_remaining: monthlyQuota > 0 ? Math.max(0, monthlyQuota - nextUsed) : 0,
  })

  authApi.consumeVideoQuota({ creation_id: creationId })
    .then(({ data }) => {
      if (data?.user) {
        updateUser(data.user)
      }
    })
    .catch(error => {
      console.error('Failed to persist video quota usage', error)
    })
}

// ─────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────
export default function CreateVideoPage() {
  const navigate = useNavigate()
  const [step, setStep]               = useState('generate')
  const [generatedVideo, setGeneratedVideo] = useState(null)

  const goToReview = useCallback((videoData) => {
    setGeneratedVideo(videoData)
    setStep('review')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const STEPS = [
    { key:'generate', icon:'✨', label:'Generate' },
    { key:'review',   icon:'🛡️', label:'Review'   },
    { key:'schedule', icon:'📅', label:'Schedule' },
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button onClick={()=>navigate('/videos')}
        className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4"/> Back to Videos
      </button>

      {/* Step bar */}
      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {STEPS.map((s,i)=>{
          const idx = STEPS.findIndex(a=>a.key===step)
          const active=step===s.key, done=idx>i
          return (
            <div key={s.key} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all
                ${active?'bg-brand-600/20 border border-brand-600/50 text-brand-400'
                  :done?'bg-green-600/10 border border-green-600/30 text-green-400'
                       :'border border-white/10 text-white/30'}`}>
                <span>{done?'✓':s.icon}</span><span>{s.label}</span>
              </div>
              {i<STEPS.length-1&&<div className={`w-6 h-px ${done?'bg-green-400/40':'bg-white/10'}`}/>}
            </div>
          )
        })}
      </div>

      {step==='generate' && <AIVideoGenerator onVideoReady={goToReview}/>}
      {step==='review'   && generatedVideo && (
        <ReviewSection
          video={generatedVideo}
          onApprove={()=>{ setStep('schedule'); window.scrollTo({top:0,behavior:'smooth'}) }}
          onRegenerate={()=>setStep('generate')}
        />
      )}
      {step==='schedule' && generatedVideo && <ScheduleSection video={generatedVideo}/>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// STEP 1 — GENERATE + AUTO-RECORD
// ─────────────────────────────────────────────────────────────────
function AIVideoGenerator({ onVideoReady }) {
  const user = useAuthStore(state => state.user)
  const updateUser = useAuthStore(state => state.updateUser)
  const [groqKey,      setGroqKey]      = useState('')
  const [pexelsKey,    setPexelsKey]    = useState('')

  useEffect(() => {
    apiKeysApi.list().then(res => {
      const keys = Array.isArray(res.data) ? res.data : (res.data?.results || [])
      const groq = keys.find(k => k.service === 'groq')
      const pexels = keys.find(k => k.service === 'pexels')
      if (groq?.api_key) setGroqKey(groq.api_key)
      if (pexels?.api_key) setPexelsKey(pexels.api_key)
    }).catch(err => console.error('Failed to load API keys', err))
  }, [])
  const [usePrompt,    setUsePrompt]    = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [companyName,  setCompanyName]  = useState('')
  const [industry,     setIndustry]     = useState('')
  const [audience,     setAudience]     = useState('')
  const [tone,         setTone]         = useState('Professional')
  const [offering,     setOffering]     = useState('')
  const [sceneCount,   setSceneCount]   = useState(5)
  const [cta,          setCta]          = useState('')
  const [videoFormat,  setVideoFormat]  = useState('16/9')
  const [targetPlatform, setTargetPlatform] = useState('16:9') // primary ratio for canvas/recording
  const [targetRatios,   setTargetRatios]   = useState(['16:9']) // all selected ratios (multi-select)
  const [error,        setError]        = useState('')
  const [generating,   setGenerating]   = useState(false)
  const [progress,     setProgress]     = useState(0)
  const [progressLabel,setProgressLabel]= useState('')
  const [scenes,       setScenes]       = useState([])
  const [adTitle,      setAdTitle]      = useState('')
  const [fullScript,   setFullScript]   = useState('')
  const [logoDataUrl,  setLogoDataUrl]   = useState('')
  const [workImages,   setWorkImages]    = useState([])
  const [currentScene, setCurrentScene] = useState(0)
  const [isPlaying,    setIsPlaying]    = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [recState,     setRecState]     = useState('idle') // idle | recording | done | error
  const [blobUrl,      setBlobUrl]      = useState(null)
  const [sizeMB,       setSizeMB]       = useState(null)

  // ── Image Generator state ─────────────────────────────────────
  const [imgPrompt,        setImgPrompt]        = useState('')
  const [imgStyle,         setImgStyle]         = useState('Photo')
  const [imgTone,          setImgTone]          = useState('Bold')
  const [imgOrientation,   setImgOrientation]   = useState('landscape')
  const [imgGenerating,    setImgGenerating]    = useState(false)
  const [imgProgress,      setImgProgress]      = useState(0)
  const [imgProgressLabel, setImgProgressLabel] = useState('')
  const [imgError,         setImgError]         = useState('')
  const [imgResultUrl,     setImgResultUrl]     = useState('')
  const [imgResultMeta,    setImgResultMeta]    = useState('')

  const sceneTimerRef   = useRef(null)
  const currentSceneRef = useRef(0)
  const scenesRef       = useRef([])
  const adTitleRef      = useRef('')
  const fullScriptRef   = useRef('')
  const videoFormatRef    = useRef('16/9')
  const targetPlatformRef = useRef('16:9')
  const targetRatiosRef   = useRef(['16:9'])
  const logoImageRef    = useRef(null)
  const workImageRefs   = useRef([])
  const playerWrapRef   = useRef(null)
  const canvasRef       = useRef(null)
  const ctxRef          = useRef(null)
  const mediaRecRef     = useRef(null)
  const chunksRef       = useRef([])
  const animRef         = useRef(null)
  const isRecRef        = useRef(false)
  const draftCreationIdRef = useRef(createVideoCreationId())

  useEffect(()=>{ currentSceneRef.current=currentScene },[currentScene])
  useEffect(()=>{ scenesRef.current=scenes },[scenes])
  useEffect(()=>{ adTitleRef.current=adTitle },[adTitle])
  useEffect(()=>{ fullScriptRef.current=fullScript },[fullScript])
  useEffect(()=>{ videoFormatRef.current=videoFormat },[videoFormat])
  useEffect(()=>{ targetPlatformRef.current=targetPlatform },[targetPlatform])
  useEffect(()=>{ targetRatiosRef.current=targetRatios },[targetRatios])
  // sync primary ratio from first selection in targetRatios
  useEffect(()=>{
    const primary = targetRatios[0] || '16:9'
    setTargetPlatform(primary)
    setVideoFormat(primary.replace(':','/'))
  },[targetRatios])
  useEffect(() => {
    if (!logoDataUrl) {
      logoImageRef.current = null
      return
    }

    const img = new Image()
    img.onload = () => {
      logoImageRef.current = img
    }
    img.src = logoDataUrl
  }, [logoDataUrl])

  const workDataUrls = workImages.map(image => image.dataUrl)
  const previewWorkImageSrc = workDataUrls.length ? workDataUrls[currentScene % workDataUrls.length] : ''

  useEffect(() => {
    if (!workDataUrls.length) {
      workImageRefs.current = []
      return
    }

    let cancelled = false

    Promise.all(workDataUrls.map(dataUrl => new Promise(resolve => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.src = dataUrl
    }))).then(images => {
      if (!cancelled) {
        workImageRefs.current = images
      }
    })

    return () => {
      cancelled = true
    }
  }, [workDataUrls])
  useEffect(()=>{
    const fn=()=>setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange',fn)
    return ()=>document.removeEventListener('fullscreenchange',fn)
  },[])

  const setP=(pct,lbl)=>{ setProgress(pct); setProgressLabel(lbl) }

  function persistGeneratedVideoDraft(nextVideo) {
    try {
      const accountId = user?.id || 'guest'
      const existing = JSON.parse(localStorage.getItem(getLocalVideosKey(accountId)) || '[]')
      const creationId = nextVideo.creationId || draftCreationIdRef.current || createVideoCreationId()
      const draftEntry = {
        id: creationId,
        title: nextVideo.title || 'Video Ad',
        topic: nextVideo.script?.slice(0, 120) || '',
        script: nextVideo.script || '',
        scenes: nextVideo.scenes || [],
        hashtags: deriveGeneratedHashtags(nextVideo),
        videoFormat:    nextVideo.videoFormat || '16/9',
        targetPlatform: nextVideo.targetPlatform || '16:9',
        targetRatios:   nextVideo.targetRatios || [nextVideo.targetPlatform || '16:9'],
        workImages: nextVideo.workImages || [],
        logoImage: nextVideo.logoImage || '',
        blobKey: nextVideo.blobKey || getVideoBlobKey(creationId),
        sizeMB: null,
        status: 'created',
        flagCount: 0,
        content_type: 'promotional',
        duration_seconds: (nextVideo.scenes?.length || 5) * 6,
        ai_service: 'groq',
        created_at: new Date().toISOString(),
        source: 'ai_generator',
      }

      const filtered = existing.filter(v => String(v.id) !== String(creationId))
      localStorage.setItem(getLocalVideosKey(accountId), JSON.stringify([draftEntry, ...filtered].slice(0, 50)))
      window.dispatchEvent(new Event('socialmind:local-videos-changed'))
      syncVideoUsage(user, updateUser, creationId)
    } catch (error) {
      console.error('Failed to persist generated video draft', error)
    }
  }

  function readImageFile(file, setter) {
    if (!file) {
      setter('')
      return
    }

    const reader = new FileReader()
    reader.onload = () => setter(String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  function readImageFiles(files, setter) {
    const selected = Array.from(files || []).slice(0, 15)
    if (!selected.length) {
      return
    }

    if ((files || []).length > 15) {
      toast.error('You can add up to 15 work images.')
    }

    Promise.all(selected.map(file => new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve({
        dataUrl: String(reader.result || ''),
        name: file.name,
      })
      reader.readAsDataURL(file)
    }))).then(newImages => {
      setter(prev => {
        const combined = [...prev, ...newImages]
        const deduped = []
        const seen = new Set()
        for (const image of combined) {
          const key = `${image.name}::${image.dataUrl.slice(0, 64)}`
          if (seen.has(key)) continue
          seen.add(key)
          deduped.push(image)
        }
        return deduped.slice(0, 15)
      })
    })
  }

  function removeWorkImage(indexToRemove) {
    setWorkImages(prev => prev.filter((_, index) => index !== indexToRemove))
  }

  async function generate() {
    setError('')
    // Block generation when free trial is exhausted
    if (isTrialExhausted(user)) {
      toast.error(`Free limit of ${TRIAL_VIDEO_LIMIT} videos is over. Subscribe to continue.`)
      window.dispatchEvent(new Event('sm:open-plans'))
      return
    }
    if (!usePrompt&&(!companyName||!industry||!offering))     { setError('⚠️ Fill Company, Industry & Offering.'); return }
    if (usePrompt&&!customPrompt)                             { setError('⚠️ Enter your custom prompt.'); return }
    stopEverything()
    draftCreationIdRef.current = createVideoCreationId()
    setGenerating(true); setProgress(0); setScenes([])
    setBlobUrl(null); setSizeMB(null); setRecState('idle')

    const productionNotes = 'Production notes: use the uploaded logo as a bottom-right watermark, and use all uploaded work images as primary visual assets in the final rendered video.'
    const promptText = usePrompt
      ? `You are a video ad scriptwriter. The user wants: "${customPrompt}"\nGenerate exactly ${sceneCount} scenes.\n${productionNotes}`
      : `You are a video ad scriptwriter. Generate a ${sceneCount}-scene video ad for:
Company: ${companyName}
Industry: ${industry}
Services: ${offering}
Target audience: ${audience}
Tone: ${tone}
Call to action: ${cta||'Contact us today'}
${productionNotes}`

    try {
      setP(15,'🤖 Groq AI writing your script...')
      const gr = await fetch('https://api.groq.com/openai/v1/chat/completions',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+groqKey},
        body:JSON.stringify({
          model:'llama-3.3-70b-versatile', max_tokens:1500, temperature:0.7,
          messages:[{role:'user',content:promptText+`\n\nRespond ONLY with valid JSON, no markdown:
{"title":"Ad title","fullScript":"Complete voiceover paragraph","scenes":[{"sceneNumber":1,"overlayText":"Max 6 word headline","voiceover":"1-2 sentence narration","pexelsQuery":"2-3 word video search","tags":["tag"]}]}`}]
        })
      })
      if (!gr.ok){ const e=await gr.json(); throw new Error('Groq: '+(e.error?.message||gr.status)) }
      const gd=await gr.json()
      const adData = parseAiVideoResponse(gd.choices?.[0]?.message?.content)

      setP(45,'🎬 Fetching Pexels stock videos...')
      const sv=await Promise.all(adData.scenes.map(async sc=>{
        try {
          const r=await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(sc.pexelsQuery)}&per_page=5&size=medium`,{headers:{Authorization:pexelsKey}})
          if (!r.ok) throw new Error()
          const d=await r.json()
          const v=d.videos?.[0]
          const vf=v?.video_files?.find(f=>f.quality==='hd')||v?.video_files?.find(f=>f.quality==='sd')||v?.video_files?.[0]
          return {...sc,videoUrl:vf?.link||null}
        } catch { return {...sc,videoUrl:null} }
      }))

      setP(85,'🎞️ Building player...')
      setScenes(sv)
      setAdTitle(adData.title||'Video Ad')
      setFullScript(adData.fullScript||'')
      setCurrentScene(0)
      setP(100,'✅ Press ▶ Play Ad — video records automatically while playing')
    } catch(err){ setError('❌ '+err.message) }
    setGenerating(false)
  }

  // ── Image Generator ───────────────────────────────────────────
  async function generateImage() {
    setImgError('')
    if (!groqKey)    { setImgError('⚠️ Enter your Groq API key above.'); return }
    if (!pexelsKey)  { setImgError('⚠️ Enter your Pexels API key above.'); return }
    if (!imgPrompt)  { setImgError('⚠️ Describe the image you want.'); return }
    setImgGenerating(true); setImgProgress(0); setImgResultUrl('')
    const setIP = (pct, lbl) => { setImgProgress(pct); setImgProgressLabel(lbl) }
    try {
      setIP(15, '🤖 Building search query...')
      const gr = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:'POST',
        headers:{'Content-Type':'application/json', Authorization:'Bearer '+groqKey},
        body: JSON.stringify({
          model:'llama-3.3-70b-versatile', max_tokens:80, temperature:0.85,
          messages:[
            {role:'system', content:'Output ONLY a 3-5 word Pexels image search query. No punctuation, no explanation. Be creative and specific.'},
            {role:'user', content:`Style: ${imgStyle}. Tone: ${imgTone}. Orientation: ${imgOrientation}. Description: ${imgPrompt}\nBest Pexels search query:`}
          ]
        })
      })
      if (!gr.ok) { const e=await gr.json().catch(()=>({})); throw new Error('Groq: '+(e.error?.message||gr.status)) }
      const gd = await gr.json()
      const query = (gd.choices?.[0]?.message?.content||'professional product photo').trim().replace(/[^a-zA-Z0-9 ]/g,'').trim()
      const randomPage = Math.floor(Math.random()*5)+1
      const perPage = 15
      const randomIndex = Math.floor(Math.random()*perPage)
      setIP(55, `🔍 Searching for "${query}"...`)
      const px = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${randomPage}&orientation=${imgOrientation}`,
        {headers:{Authorization:pexelsKey}}
      )
      if (!px.ok) throw new Error('Pexels error: '+px.status)
      const pd = await px.json()
      if (!pd.photos?.length) throw new Error('No images found. Try a different description or style.')
      const photo = pd.photos[Math.min(randomIndex, pd.photos.length-1)]
      const url = photo.src?.large2x || photo.src?.large || photo.src?.original
      setImgResultUrl(url)
      setImgResultMeta(`"${query}" · ${imgStyle} · ${imgTone} · via Pexels`)
      setIP(100, '✅ Done!')
      setTimeout(()=>{ setImgProgress(0); setImgProgressLabel('') }, 1600)
    } catch(err) {
      setImgError('❌ '+err.message)
      setImgProgress(0); setImgProgressLabel('')
    }
    setImgGenerating(false)
  }

  async function downloadGeneratedImage() {
    if (!imgResultUrl) return
    if (!isPro(user)) {
      toast.error('Subscribe to download assets.')
      window.dispatchEvent(new Event('sm:open-plans'))
      return
    }
    try {
      const res = await fetch(imgResultUrl)
      const blob = await res.blob()
      const ext = blob.type.includes('png') ? 'png' : 'jpg'
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href=objUrl; a.download='generated_image_'+Date.now()+'.'+ext
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(objUrl)
    } catch { window.open(imgResultUrl,'_blank') }
  }

  // ── Canvas recording helpers ──────────────────────────────────
  function startCanvasRecording() {
    try {
      const canvas = document.createElement('canvas')
      const fmt = videoFormatRef.current || videoFormat
      if (fmt === '9/16') { canvas.width = 720; canvas.height = 1280 }
      else if (fmt === '1/1') { canvas.width = 1080; canvas.height = 1080 }
      else { canvas.width = 1280; canvas.height = 720 }
      const ctx = canvas.getContext('2d')
      canvasRef.current=canvas; ctxRef.current=ctx

      const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']
        .find(m=>MediaRecorder.isTypeSupported(m))||'video/webm'
      const stream=canvas.captureStream(25)
      const mr=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2500000})
      chunksRef.current=[]
      mr.ondataavailable=e=>{ if(e.data?.size>0) chunksRef.current.push(e.data) }
      mr.onstop=finaliseVideo
      mr.start(250)
      mediaRecRef.current=mr
      isRecRef.current=true
      setRecState('recording')
      drawCanvasFrame()
    } catch(e) {
      console.warn('Canvas recording not supported:',e)
      isRecRef.current=false
      setRecState('error')
    }
  }

  function drawCanvasFrame() {
    if (!isRecRef.current||!canvasRef.current) return
    const W=1280,H=720,ctx=ctxRef.current
    const sc=scenesRef.current[currentSceneRef.current]||{}
    const heroImage = (workImageRefs.current || []).filter(Boolean)[currentSceneRef.current % Math.max(1, (workImageRefs.current || []).filter(Boolean).length)]

    ctx.fillStyle='#0d1528'
    ctx.fillRect(0,0,W,H)

    if (heroImage) {
      const t = performance.now() / 1000
      const sceneSeed = currentSceneRef.current * 0.73
      const zoom = 1.08 + 0.02 * Math.sin(t * 0.55 + sceneSeed)
      const swayX = Math.sin(t * 0.33 + sceneSeed) * 22
      const swayY = Math.cos(t * 0.27 + sceneSeed) * 16
      const drawW = W * zoom
      const drawH = H * zoom
      const dx = (W - drawW) / 2 + swayX
      const dy = (H - drawH) / 2 + swayY
      ctx.save()
      ctx.globalAlpha = 0.98
      ctx.drawImage(heroImage, dx, dy, drawW, drawH)
      ctx.restore()
    } else {
      const vid=document.getElementById('sm-player-video')
      if (vid&&vid.readyState>=2) {
        try { ctx.drawImage(vid,0,0,W,H) } catch { ctx.fillStyle='#0d1528'; ctx.fillRect(0,0,W,H) }
      } else {
        ctx.font='72px serif'; ctx.textAlign='center'; ctx.textBaseline='middle'
        ctx.fillText('🎬',W/2,H/2); ctx.textBaseline='alphabetic'
      }
    }

    // gradient for title readability
    const g=ctx.createLinearGradient(0,H*0.2,0,H)
    g.addColorStop(0,'rgba(0,0,0,0.05)')
    g.addColorStop(0.55,'rgba(0,0,0,0.18)')
    g.addColorStop(1,'rgba(0,0,0,0.88)')
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H)

    const logo = logoImageRef.current
    if (logo) {
      const logoW = 180
      const logoH = Math.max(54, (logo.height / logo.width) * logoW)
      const x = W - logoW - 42
      const y = H - logoH - 42
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.45)'
      ctx.shadowBlur = 12
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      canvasRoundRect(ctx, x - 10, y - 10, logoW + 20, logoH + 20, 18)
      ctx.fill()
      ctx.drawImage(logo, x, y, logoW, logoH)
      ctx.restore()
    }

    // headline
    ctx.shadowColor='rgba(0,0,0,0.95)'; ctx.shadowBlur=16
    if (sc.overlayText) {
      ctx.font='bold 56px Arial'; ctx.fillStyle='#ffffff'; ctx.textAlign='left'
      wrapCanvasText(ctx,sc.overlayText,50,H-108,W-80,64)
    }
    // voiceover caption
    if (sc.voiceover) {
      ctx.font='28px Arial'; ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.shadowBlur=8
      wrapCanvasText(ctx,sc.voiceover,50,H-30,W-80,36)
    }
    ctx.shadowBlur=0
    // scene badge
    ctx.fillStyle='rgba(59,130,246,0.88)'; canvasRoundRect(ctx,22,22,196,34,17)
    ctx.fillStyle='#fff'; ctx.font='bold 16px Arial'; ctx.textAlign='center'
    ctx.fillText(`Scene ${sc.sceneNumber||currentSceneRef.current+1} / ${scenesRef.current.length}`,120,44)
    // progress bar
    const pct=(currentSceneRef.current+1)/scenesRef.current.length
    ctx.fillStyle='rgba(255,255,255,0.15)'; ctx.fillRect(0,H-4,W,4)
    ctx.fillStyle='#3b82f6'; ctx.fillRect(0,H-4,W*pct,4)

    animRef.current=requestAnimationFrame(drawCanvasFrame)
  }

  function stopCanvasRecording() {
    isRecRef.current=false
    cancelAnimationFrame(animRef.current)
    if (mediaRecRef.current?.state!=='inactive') {
      mediaRecRef.current?.stop()
    }
  }

  async function finaliseVideo() {
    const chunks=chunksRef.current
    if (!chunks.length) { setRecState('error'); return }
    const blob=new Blob(chunks,{type:'video/webm'})
    const url=URL.createObjectURL(blob)
    const mb=(blob.size/1024/1024).toFixed(1)
    setBlobUrl(url); setSizeMB(mb); setRecState('done')
    // Persist to IndexedDB so it survives navigation
    await saveBlob(getVideoBlobKey(draftCreationIdRef.current), blob)
    toast.success(`🎬 Video saved! (${mb} MB) — navigate anytime safely`)
  }

  // ── TTS ───────────────────────────────────────────────────────
  function speakScene(idx) {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const sc=scenesRef.current[idx]; if (!sc) return
    const text=(sc.voiceover||sc.overlayText||'').trim(); if (!text) return
    const u=new SpeechSynthesisUtterance(text); u.rate=0.9
    const vs=window.speechSynthesis.getVoices()
    const pv=vs.find(v=>v.name.includes('Google')&&v.lang.startsWith('en'))||vs.find(v=>v.lang==='en-US')||vs.find(v=>v.lang.startsWith('en'))
    if (pv) u.voice=pv
    window.speechSynthesis.speak(u)
  }

  // ── Scene timer ───────────────────────────────────────────────
  function startSceneTimer(idx) {
    clearTimeout(sceneTimerRef.current)
    sceneTimerRef.current=setTimeout(()=>{
      const next=idx+1
      if (next<scenesRef.current.length) {
        setCurrentScene(next)
        speakScene(next)
        startSceneTimer(next)
      } else {
        // All scenes done
        setIsPlaying(false)
        window.speechSynthesis?.cancel()
        stopCanvasRecording() // triggers finaliseVideo via onstop
        toast.success('🎬 All scenes played! Moving to Review...')
        setTimeout(()=>{
          const nextVideo = {
            creationId:     draftCreationIdRef.current,
            title:          adTitleRef.current||'Video Ad',
            script:         fullScriptRef.current,
            scenes:         scenesRef.current,
            videoFormat:    videoFormatRef.current,
            targetPlatform: targetPlatformRef.current,
            targetRatios:   targetRatiosRef.current,
            workImages:     workDataUrls,
            logoImage:      logoDataUrl,
            blobKey:        getVideoBlobKey(draftCreationIdRef.current),
            // blobUrl & sizeMB will be loaded from IndexedDB in ReviewSection
          }
          persistGeneratedVideoDraft(nextVideo)
          onVideoReady(nextVideo)
        }, 1000)
      }
    }, SCENE_DURATION)
  }

  function playAd() {
    if (!scenes.length) return
    const workImagesLoaded = !workDataUrls.length || workImageRefs.current.length === workDataUrls.length
    const logoLoaded = !logoDataUrl || !!logoImageRef.current
    if (!workImagesLoaded || !logoLoaded) {
      toast('Please wait for the uploaded logo and work images to finish loading before playing.', { icon: '⏳' })
      return
    }
    setIsPlaying(true)
    // Start canvas recording silently
    if (recState==='idle'||recState==='error') startCanvasRecording()
    speakScene(currentSceneRef.current)
    startSceneTimer(currentSceneRef.current)
  }
  function pauseAd() {
    setIsPlaying(false)
    clearTimeout(sceneTimerRef.current)
    window.speechSynthesis?.cancel()
  }
  function stopEverything() {
    setIsPlaying(false)
    clearTimeout(sceneTimerRef.current)
    window.speechSynthesis?.cancel()
    stopCanvasRecording()
  }

  function toggleFullscreen() {
    const el=playerWrapRef.current; if (!el) return
    if (!document.fullscreenElement) el.requestFullscreen?.()
    else document.exitFullscreen?.()
  }

  const sc=scenes[currentScene]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-600/20 flex items-center justify-center"><Sparkles className="w-5 h-5 text-brand-400"/></div>
        <div>
          <h1 className="text-2xl font-bold text-white">AI Video Ad Generator</h1>
          <p className="text-white/40 text-sm">Groq + Pexels · Press ▶ Play — records automatically · navigates to Review when done</p>
        </div>
      </div>


  
      {/* Ad Details */}
      <div className="glass-card p-5">
        <div className="text-xs font-semibold text-brand-400 uppercase tracking-wider mb-3">📋 Ad Details</div>
        <div className="flex items-center gap-3 mb-4 cursor-pointer select-none" onClick={()=>setUsePrompt(p=>!p)}>
          <div className={`w-10 h-5 rounded-full relative transition-colors ${usePrompt?'bg-brand-600':'bg-white/20'}`}>
            <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${usePrompt?'left-5':'left-0.5'}`}/>
          </div>
          <span className="text-sm text-white/60">Use <strong className="text-white">custom prompt</strong></span>
        </div>

        {usePrompt ? (
          <div className="space-y-3">
            <div>
              <label className="label">Your Custom Prompt</label>
              <textarea className="input resize-none w-full" rows={5}
                placeholder="Describe the video you want: audience, services, tone, length, and call to action."
                value={customPrompt} onChange={e=>setCustomPrompt(e.target.value)}/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Scenes</label>
                <select className="input w-full" value={sceneCount} onChange={e=>setSceneCount(+e.target.value)}>
                  <option value={3}>3 Scenes (~18s)</option><option value={5}>5 Scenes (~30s)</option><option value={7}>7 Scenes (~42s)</option>
                </select>
              </div>
              <div>
                <label className="label mb-2 block">Video Format</label>
                <RatioSelector selected={targetRatios} onChange={setTargetRatios} />
                <p className="text-white/30 text-[11px] mt-1.5">Canvas preview & recording match the chosen ratio. Auto-resized per platform at scheduling.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Company Name *</label><input className="input w-full" placeholder="Enter your company name" value={companyName} onChange={e=>setCompanyName(e.target.value)}/></div>
            <div><label className="label">Industry *</label><input className="input w-full" placeholder="Enter your industry" value={industry} onChange={e=>setIndustry(e.target.value)}/></div>
            <div><label className="label">Target Audience</label><input className="input w-full" placeholder="Who should this video reach?" value={audience} onChange={e=>setAudience(e.target.value)}/></div>
            <div><label className="label">Tone</label>
              <select className="input w-full" value={tone} onChange={e=>setTone(e.target.value)}>
                {['Professional','Energetic & Bold','Warm & Friendly','Luxury & Premium','Minimalist & Clean'].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-2"><label className="label">What do you offer? *</label>
              <textarea className="input resize-none w-full" rows={2} placeholder="e.g. Graphic design, embroidery digitizing, e-commerce, AI/ML..." value={offering} onChange={e=>setOffering(e.target.value)}/>
            </div>
            <div><label className="label">Scenes</label>
              <select className="input w-full" value={sceneCount} onChange={e=>setSceneCount(+e.target.value)}>
                <option value={3}>3 (~18s)</option><option value={5}>5 (~30s)</option><option value={7}>7 (~42s)</option>
              </select>
            </div>
            <div><label className="label">Call to Action</label>
              <input className="input w-full" placeholder="Contact us today!" value={cta} onChange={e=>setCta(e.target.value)}/>
            </div>
            <div className="col-span-2">
              <label className="label mb-2 block">Video Format</label>
              <RatioSelector selected={targetRatios} onChange={setTargetRatios} />
              <p className="text-white/30 text-[11px] mt-1.5">Canvas preview & recording match the first chosen ratio. Auto-resized per platform at scheduling.</p>
            </div>
          </div>
        )}

        <div className="grid gap-3 mt-4 md:grid-cols-3">
          <div className="md:col-span-1">
            <label className="label">Logo / watermark</label>
            <input
              className="input w-full file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-brand-600/20 file:text-brand-300"
              type="file"
              accept="image/*"
              onChange={e => readImageFile(e.target.files?.[0], setLogoDataUrl)}
            />
          </div>
          <div className="md:col-span-1">
            <label className="label">Work images <span className="text-white/30 text-xs">(up to 15)</span></label>
            <input
              className="input w-full file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-brand-600/20 file:text-brand-300"
              type="file"
              accept="image/*"
              multiple
              onChange={e => readImageFiles(e.target.files, setWorkImages)}
            />
            <p className="mt-1 text-xs text-white/30">
              {workImages.length ? `${workImages.length} image${workImages.length > 1 ? 's' : ''} selected` : 'Add one or more product or work images'}
            </p>
            {workImages.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {workImages.map((image, index) => (
                  <div
                    key={`${image.name}-${index}`}
                    className="group inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70"
                    title={image.name}
                  >
                    <span className="truncate">{image.name}</span>
                    <button
                      type="button"
                      onClick={() => removeWorkImage(index)}
                      className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-white/50 transition hover:bg-red-500/20 hover:text-red-300"
                      aria-label={`Remove ${image.name}`}
                      title="Remove image"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="md:col-span-1">
            <label className="label">Title preview</label>
            <input
              className="input w-full"
              value={adTitle}
              onChange={e => setAdTitle(e.target.value)}
              placeholder="Your video title will appear here"
            />
          </div>
        </div>

        {error && <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}
        {generating && (
          <div className="mt-3">
            <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full transition-all duration-500" style={{width:progress+'%'}}/>
            </div>
            <p className="text-xs text-white/40 text-center mt-1">{progressLabel}</p>
          </div>
        )}
        <button onClick={generate} disabled={generating} className="btn-primary w-full mt-4 flex items-center justify-center gap-2">
          {generating?<><Loader2 className="w-4 h-4 animate-spin"/>Generating...</>:<><Sparkles className="w-4 h-4"/>✨ Generate Video Ad</>}
        </button>
      </div>

      {/* PLAYER */}
      {scenes.length>0 && (
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="min-w-[260px] flex-1">
              <label className="label mb-1.5 block text-xs">Video title</label>
              <input
                className="input w-full"
                value={adTitle}
                onChange={e => setAdTitle(e.target.value)}
                placeholder="Edit your title here"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {recState==='recording' && (
                <span className="text-xs px-3 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 font-medium flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block"/>Recording…
                </span>
              )}
              {recState==='done' && (
                <span className="text-xs px-3 py-1 rounded-full bg-green-500/15 border border-green-500/30 text-green-400 font-medium">
                  ✓ Saved {sizeMB} MB
                </span>
              )}
              {recState==='idle' && (
                <span className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/40">
                  Press ▶ to start recording
                </span>
              )}
            </div>
          </div>

          {/* Player — single ratio: classic player; multiple ratios: device-frame grid */}
          {targetRatios.length <= 1 ? (
            <div ref={playerWrapRef} className="relative rounded-xl overflow-hidden bg-black mb-3" style={{aspectRatio:videoFormat}}>
              {sc?.videoUrl
                ? <video id="sm-player-video" key={sc.videoUrl} src={sc.videoUrl} autoPlay muted loop playsInline className="w-full h-full object-cover"/>
                : <div id="sm-player-video" className="w-full h-full flex items-center justify-center text-5xl bg-gradient-to-br from-slate-900 to-slate-800">🎬</div>
              }
              {previewWorkImageSrc && (
                <img src={previewWorkImageSrc} alt="" className="absolute inset-0 w-full h-full object-cover z-10 pointer-events-none" style={{transform:'scale(1.02)'}}/>
              )}
              {logoDataUrl && (
                <img src={logoDataUrl} alt="" className="absolute bottom-3 right-16 z-20 w-24 h-auto rounded-lg border border-white/10 bg-black/20 p-1 shadow-lg pointer-events-none"/>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-transparent to-transparent flex flex-col justify-end p-5 pointer-events-none">
                <div className="font-bold text-white text-xl drop-shadow-lg mb-1 leading-tight">{sc?.overlayText}</div>
                <div className="text-white/85 text-sm leading-snug">{sc?.voiceover}</div>
              </div>
              <div className="absolute top-3 left-3 bg-blue-600/85 text-white text-xs font-bold px-3 py-1 rounded-full backdrop-blur-sm">
                Scene {sc?.sceneNumber||currentScene+1} / {scenes.length}
              </div>
              <button onClick={toggleFullscreen}
                className="absolute top-3 right-3 bg-black/55 hover:bg-blue-600/80 text-white rounded-lg px-3 py-1.5 text-xs font-medium backdrop-blur-sm border border-white/10 flex items-center gap-1.5 transition-all">
                {isFullscreen?<Minimize2 className="w-3.5 h-3.5"/>:<Maximize2 className="w-3.5 h-3.5"/>}
                {isFullscreen?'Exit':'Fullscreen'}
              </button>
            </div>
          ) : (
            /* Multi-ratio: one device-frame preview per selected ratio */
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-3">
                <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">Live Preview</div>
                <div className="flex gap-1.5">
                  {targetRatios.map(r => {
                    const rc = RATIO_COLORS[r] || '#6366F1'
                    return (
                      <span key={r} className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: rc+'20', color: rc, border:`1px solid ${rc}40` }}>{r}</span>
                    )
                  })}
                </div>
                <div className="text-[10px] text-white/25 ml-auto">Scene {sc?.sceneNumber||currentScene+1} / {scenes.length}</div>
              </div>
              <LiveMultiRatioPreview
                ratios={targetRatios}
                sceneVideoUrl={sc?.videoUrl}
                overlayText={sc?.overlayText}
                voiceover={sc?.voiceover}
                previewWorkImageSrc={previewWorkImageSrc}
                logoDataUrl={logoDataUrl}
                isRecording={recState === 'recording'}
              />
            </div>
          )}

          {/* Progress dots */}
          <div className="flex gap-1.5 justify-center mb-3">
            {scenes.map((_,i)=>(
              <div key={i} onClick={()=>{if(!isPlaying)setCurrentScene(i)}}
                className={`h-1.5 rounded-full transition-all cursor-pointer
                  ${i===currentScene?'w-5 bg-brand-400':i<currentScene?'w-1.5 bg-green-400':'w-1.5 bg-white/20'}`}/>
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <button onClick={()=>isPlaying?pauseAd():playAd()} className="btn-primary px-5 py-2 text-sm flex items-center gap-2">
              {isPlaying?'⏸ Pause':'▶ Play Ad'}
            </button>
            <button onClick={()=>{setCurrentScene(s=>Math.max(0,s-1));pauseAd()}} className="px-3 py-2 text-sm rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5">⏮</button>
            <button onClick={()=>{setCurrentScene(s=>Math.min(scenes.length-1,s+1));pauseAd()}} className="px-3 py-2 text-sm rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5">⏭</button>
            <button onClick={()=>{setCurrentScene(0);pauseAd()}} className="px-3 py-2 text-sm rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5">↺</button>
            {isPlaying && (
              <span className="text-xs text-white/30 ml-auto">Auto-continues to Review after last scene</span>
            )}
          </div>

          {/* Thumbnails */}
          <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
            {scenes.map((s,i)=>(
              <div key={i} onClick={()=>{if(!isPlaying)setCurrentScene(i)}}
                className={`flex-shrink-0 w-20 rounded-lg overflow-hidden border-2 cursor-pointer transition-all
                  ${i===currentScene?'border-brand-400':'border-white/10 hover:border-white/30'}`}>
                {s.videoUrl?<video src={s.videoUrl} muted className="w-full aspect-video object-cover"/>
                  :<div className="w-full aspect-video bg-slate-800 flex items-center justify-center">🎬</div>}
                <div className="bg-black/70 text-white text-center py-0.5" style={{fontSize:'0.55rem'}}>Scene {s.sceneNumber}</div>
              </div>
            ))}
          </div>

          {/* Download button — shows when recording is done */}
          {recState==='done' && blobUrl && (
            isPro(user) ? (
              <a href={blobUrl} download={`${(adTitle||'video_ad').replace(/[^a-z0-9]/gi,'_').toLowerCase()}.webm`}
                className="w-full mb-3 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-green-600/15 border border-green-500/30 text-green-400 font-semibold hover:bg-green-600/25 transition text-sm">
                <Download className="w-4 h-4"/> Download Video to My Computer ({sizeMB} MB)
              </a>
            ) : (
              <button onClick={() => { toast.error('Subscribe to download videos.'); window.dispatchEvent(new Event('sm:open-plans')) }}
                className="w-full mb-3 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white/35 font-semibold cursor-not-allowed text-sm">
                <Download className="w-4 h-4"/> Subscribe to Download
              </button>
            )
          )}

          {/* Script */}
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">📝 Full AI Script</div>
            <p className="text-white/70 text-sm leading-relaxed">{fullScript}</p>
          </div>

          {/* Manual continue */}
          <button onClick={() => {
          const nextCreationId = createVideoCreationId()
          const nextVideo = {
            creationId:     nextCreationId,
            title:          adTitle,
            script:         fullScript,
            scenes,
            videoFormat,
            targetPlatform: targetPlatformRef.current,
            targetRatios:   targetRatiosRef.current,
            workImages:     workDataUrls,
            logoImage:      logoDataUrl,
            blobKey:        getVideoBlobKey(nextCreationId),
          }
            persistGeneratedVideoDraft(nextVideo)
            onVideoReady(nextVideo)
          }}
            className="w-full mt-3 px-4 py-3 rounded-xl border border-brand-600/40 bg-brand-600/10 text-brand-400 hover:bg-brand-600/20 text-sm font-medium transition flex items-center justify-center gap-2">
            Continue to Content Review →
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// STEP 2 — REVIEW + DOWNLOAD
// ─────────────────────────────────────────────────────────────────
function ReviewSection({ video, onApprove, onRegenerate }) {
  const user = useAuthStore(state => state.user)
  const canDownload = isPro(user)
  const [currentScene, setCurrentScene] = useState(0)
  const [blobUrl,      setBlobUrl]      = useState(null)
  const [sizeMB,       setSizeMB]       = useState(null)
  const [loadingBlob,  setLoadingBlob]  = useState(true)

  // Load recorded video from IndexedDB
  useEffect(()=>{
    let url=null
    const blobKey = video.blobKey || getVideoBlobKey(video.creationId || video.id)
    loadBlob(blobKey).then(blob=>{
      if (blob) {
        url=URL.createObjectURL(blob)
        setBlobUrl(url)
        setSizeMB((blob.size/1024/1024).toFixed(1))
      } else if (blobKey !== VIDEO_KEY) {
        loadBlob(VIDEO_KEY).then(fallbackBlob => {
          if (fallbackBlob) {
            url = URL.createObjectURL(fallbackBlob)
            setBlobUrl(url)
            setSizeMB((fallbackBlob.size/1024/1024).toFixed(1))
          }
        })
      }
    }).finally(()=>setLoadingBlob(false))
    return ()=>{ if(url) URL.revokeObjectURL(url) }
  },[])

  const scriptLower=(video.script||'').toLowerCase()
  const flaggedIssues=FLAGGED_TERMS.filter(f=>scriptLower.includes(f.term.toLowerCase()))
  const overallSafe=flaggedIssues.length===0

  const platformChecks=PLATFORMS.map(p=>{
    const issues=[]
    const len=video.script?.length||0
    if (len>p.rules.maxChars) issues.push(`Caption too long (${len}/${p.rules.maxChars} chars)`)
    if (flaggedIssues.length>0) issues.push(`${flaggedIssues.length} flagged term${flaggedIssues.length>1?'s':''}`)
    return {...p,issues,safe:issues.length===0}
  })

  function renderHighlightedScript(text){
    if (!text) return <span className="text-white/70 text-sm">No script.</span>
    let parts=[]
    let remaining=text
    flaggedIssues.forEach(f=>{
      remaining=remaining.replace(new RegExp(`(${f.term})`,'gi'),`\x00${f.term}\x00`)
    })
    remaining.split('\x00').forEach((chunk,i)=>{
      const match=flaggedIssues.find(f=>f.term.toLowerCase()===chunk.toLowerCase())
      if (match) {
        parts.push(
          <span key={i} title={match.reason}
            className="bg-yellow-400/25 text-yellow-300 border-b-2 border-yellow-400 px-0.5 rounded cursor-help">
            {chunk}
          </span>
        )
      } else parts.push(<span key={i} className="text-white/70 text-sm">{chunk}</span>)
    })
    return <>{parts}</>
  }

  const sc=video.scenes?.[currentScene]
  const filename=`${(video.title||'video_ad').replace(/[^a-z0-9]/gi,'_').toLowerCase()}.webm`

  // Ratios to preview — prefer what was selected at generate time
  const reviewRatios = Array.isArray(video.targetRatios) && video.targetRatios.length > 0
    ? video.targetRatios
    : (['9:16','16:9','1:1'].includes(video.targetPlatform) ? [video.targetPlatform] : ['16:9'])

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${overallSafe?'bg-green-600/20':'bg-yellow-600/20'}`}>
            {overallSafe?<ShieldCheck className="w-5 h-5 text-green-400"/>:<AlertTriangle className="w-5 h-5 text-yellow-400"/>}
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Content Review</h2>
            <p className="text-white/40 text-sm">
              {overallSafe?'✅ No issues — safe to post':`⚠️ ${flaggedIssues.length} potential issue${flaggedIssues.length>1?'s':''} detected`}
            </p>
          </div>
        </div>
        {/* Format badges */}
        <div className="flex gap-1.5 flex-shrink-0">
          {reviewRatios.map(r => {
            const rc = RATIO_COLORS[r] || '#6366F1'
            return (
              <span key={r} className="text-xs font-bold px-2 py-0.5 rounded-lg"
                style={{ background: rc+'20', color: rc, border:`1px solid ${rc}40` }}>
                {r}
              </span>
            )
          })}
        </div>
      </div>

      {/* ── Safety banner ── */}
      {overallSafe ? (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/30">
          <ShieldCheck className="w-5 h-5 text-green-400 flex-shrink-0"/>
          <div>
            <p className="text-green-400 font-semibold text-sm">Content is suitable for all platforms</p>
            <p className="text-white/50 text-xs mt-0.5">No policy violations detected.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
          <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5"/>
          <div>
            <p className="text-yellow-400 font-semibold text-sm">{flaggedIssues.length} potential issue{flaggedIssues.length>1?'s':''} — hover highlighted terms for details</p>
            <p className="text-white/50 text-xs mt-0.5">You can still post, but consider editing the flagged terms first.</p>
          </div>
        </div>
      )}

      {/* ── PER-RATIO VIDEO PREVIEWS ── */}
      <div className="glass-card p-5">
        <div className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Save className="w-3.5 h-3.5"/> Your Video
          {reviewRatios.length > 1 && (
            <span className="text-white/30 font-normal normal-case tracking-normal">
              — {reviewRatios.length} formats ready
            </span>
          )}
        </div>

        {loadingBlob ? (
          <div className="flex items-center gap-2 text-white/40 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin"/> Loading saved video...
          </div>
        ) : (
          <>
            {/* Per-platform device-frame previews */}
            <PlatformReviewGrid
              selectedRatios={reviewRatios}
              blobUrl={blobUrl}
              sceneVideoUrl={sc?.videoUrl}
              sceneText={sc?.overlayText}
              canDownload={canDownload}
            />

            {/* No blob fallback note + scene strip */}
            {!blobUrl && (
              <>
                {video.scenes?.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1 mt-4">
                    {video.scenes.map((s,i)=>(
                      <div key={i} onClick={()=>setCurrentScene(i)}
                        className={`flex-shrink-0 w-14 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${i===currentScene?'border-brand-400':'border-white/10'}`}>
                        {s.videoUrl
                          ?<video src={s.videoUrl} muted className="w-full aspect-video object-cover"/>
                          :<div className="w-full aspect-video bg-slate-800 flex items-center justify-center text-xs">🎬</div>}
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-white/35 text-xs p-3 rounded-xl bg-white/5 border border-white/10 mt-3">
                  ℹ️ Full video was not recorded — go back to Generate, press ▶ Play Ad and let all scenes finish to auto-record.
                </p>
              </>
            )}

            {/* Download row */}
            {blobUrl && (
              <div className="flex items-center gap-3 flex-wrap mt-4 pt-4 border-t border-white/8">
                <a
                  href={canDownload ? blobUrl : undefined}
                  download={canDownload ? filename : undefined}
                  onClick={e => {
                    if (canDownload) return
                    e.preventDefault()
                    toast.error('Subscribe to download videos.')
                    window.dispatchEvent(new Event('sm:open-plans'))
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600/20 border border-green-500/35 text-green-400 font-semibold hover:bg-green-600/30 transition text-sm">
                  <Download className="w-4 h-4"/> Download ({sizeMB} MB · WebM)
                </a>
                <span className="text-white/25 text-xs">Saved in browser storage — download to keep permanently</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Script with highlights */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold text-purple-400 uppercase tracking-wider">📝 Script Analysis</div>
          {flaggedIssues.length>0 && (
            <span className="text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded-full">{flaggedIssues.length} flagged</span>
          )}
        </div>
        <div className="text-sm leading-relaxed p-3 rounded-xl bg-white/5 border border-white/10">
          {renderHighlightedScript(video.script)}
        </div>
        {flaggedIssues.length>0 && (
          <div className="mt-3 space-y-2">
            {flaggedIssues.map((f,i)=>(
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-yellow-500/8 border border-yellow-500/20">
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5"/>
                <div>
                  <span className="text-yellow-300 text-xs font-semibold">"{f.term}"</span>
                  <span className="text-white/50 text-xs"> — {f.reason}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Platform grid */}
      <div className="glass-card p-5">
        <div className="text-xs font-semibold text-brand-400 uppercase tracking-wider mb-4">📱 Platform Compatibility</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {platformChecks.map(p=>(
            <div key={p.id} className={`p-3 rounded-xl border ${p.safe?'border-green-500/25 bg-green-500/5':'border-yellow-500/25 bg-yellow-500/5'}`}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{p.icon}</span>
                  <span className="text-white text-sm font-semibold">{p.label}</span>
                </div>
                {p.safe?<ShieldCheck className="w-4 h-4 text-green-400"/>:<AlertTriangle className="w-4 h-4 text-yellow-400"/>}
              </div>
              {p.safe?<p className="text-green-400 text-xs">✓ Compatible</p>
                :<ul className="space-y-0.5">{p.issues.map((iss,j)=><li key={j} className="text-yellow-300 text-xs">• {iss}</li>)}</ul>}
            </div>
          ))}
        </div>
      </div>

      {/* ── ACCEPT / REJECT / REGENERATE ── */}
      <ReviewDecision
        video={video}
        blobUrl={blobUrl}
        sizeMB={sizeMB}
        overallSafe={overallSafe}
        flaggedIssues={flaggedIssues}
        onRegenerate={onRegenerate}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// REVIEW DECISION COMPONENT
// ─────────────────────────────────────────────────────────────────
function ReviewDecision({ video, blobUrl, sizeMB, overallSafe, flaggedIssues, onRegenerate }) {
  const navigate = useNavigate()
  const [decision, setDecision] = useState(null) // null | 'accepted' | 'created'
  const [saving,   setSaving]   = useState(false)
  const user = useAuthStore(state => state.user)
  const updateUser = useAuthStore(state => state.updateUser)
  const accountId = user?.id || 'guest'

  function saveToLocalVideos(status) {
    try {
      const existing = JSON.parse(localStorage.getItem(getLocalVideosKey(accountId)) || '[]')
      const creationId = video.creationId || video.id || createVideoCreationId()
      const newEntry = {
        id:            creationId,
        title:         video.title || 'Video Ad',
        topic:         video.script?.slice(0, 120) || '',
        script:        video.script || '',
        scenes:        video.scenes || [],
        hashtags:      deriveGeneratedHashtags(video),
        videoFormat:   video.videoFormat || '16/9',
        workImages:    video.workImages || [],
        logoImage:     video.logoImage || '',
        blobKey:       video.blobKey || getVideoBlobKey(creationId), // IndexedDB key
        sizeMB:        sizeMB,
        status:        status,              // 'created' | 'approved'
        flagCount:     flaggedIssues.length,
        content_type:  'promotional',
        duration_seconds: (video.scenes?.length || 5) * 6,
        ai_service:    'groq',
        created_at:    new Date().toISOString(),
        source:        'ai_generator',
      }
      // Upsert: replace the same generated video instance only
      const filtered = existing.filter(v => String(v.id) !== String(creationId))
      localStorage.setItem(getLocalVideosKey(accountId), JSON.stringify([newEntry, ...filtered].slice(0, 50)))
      window.dispatchEvent(new Event('socialmind:local-videos-changed'))
      return { entry: newEntry }
    } catch(e) { return null }
  }

  async function handleAccept() {
    setSaving(true)
    saveToLocalVideos('approved')
    await new Promise(r => setTimeout(r, 600))
    setSaving(false)
    setDecision('accepted')
    toast.success('✅ Video approved and saved to Videos!')
    setTimeout(() => navigate('/videos'), 1800)
  }

  async function handleReject() {
    setSaving(true)
    saveToLocalVideos('created')
    await new Promise(r => setTimeout(r, 400))
    setSaving(false)
    setDecision('created')
    toast('Video saved as created. Approve it later when ready.', { icon: '💾' })
    setTimeout(() => navigate('/videos'), 1800)
  }

  if (decision === 'accepted') {
    return (
      <div className="glass-card p-8 text-center">
        <div className="text-5xl mb-3">🎉</div>
        <h3 className="text-xl font-bold text-white mb-1">Video Approved!</h3>
        <p className="text-white/50 text-sm">Saved to your Videos. Go to <strong className="text-brand-400">Videos → select it → Schedule Post</strong></p>
        <p className="text-white/30 text-xs mt-2">Redirecting to Videos...</p>
      </div>
    )
  }

  if (decision === 'created') {
    return (
      <div className="glass-card p-8 text-center">
        <div className="text-5xl mb-3">💾</div>
        <h3 className="text-xl font-bold text-white mb-1">Video Created</h3>
        <p className="text-white/50 text-sm">Saved to Videos with "Created" status. You can approve it anytime.</p>
        <p className="text-white/30 text-xs mt-2">Redirecting to Videos...</p>
      </div>
    )
  }

  return (
    <div className="glass-card p-5">
      <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">📋 Your Decision</div>
      <div className="flex flex-col gap-3">
        {/* Accept */}
        <button onClick={handleAccept} disabled={saving}
          className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-green-500/40 bg-green-500/8 hover:bg-green-500/15 transition-all group disabled:opacity-50">
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-green-500/30 transition-colors">
            {saving ? <Loader2 className="w-5 h-5 text-green-400 animate-spin"/> : <CheckCircle className="w-5 h-5 text-green-400"/>}
          </div>
          <div className="text-left flex-1">
            <div className="text-green-400 font-bold text-sm">✅ Accept Video</div>
            <div className="text-white/40 text-xs mt-0.5">Saves to Videos as "Approved" · go to Videos to schedule & post</div>
          </div>
          <ChevronRight className="w-4 h-4 text-green-400/60 group-hover:text-green-400 transition-colors"/>
        </button>

        {/* Reject */}
        <button onClick={handleReject} disabled={saving}
          className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-red-500/30 bg-red-500/5 hover:bg-red-500/12 transition-all group disabled:opacity-50">
          <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0 group-hover:bg-red-500/25 transition-colors">
            <XCircle className="w-5 h-5 text-red-400"/>
          </div>
          <div className="text-left flex-1">
            <div className="text-red-400 font-bold text-sm">💾 Save as Created</div>
            <div className="text-white/40 text-xs mt-0.5">Saves to Videos as "Created" so you can approve it later</div>
          </div>
          <ChevronRight className="w-4 h-4 text-red-400/60 group-hover:text-red-400 transition-colors"/>
        </button>

        {/* Regenerate */}
        <button onClick={onRegenerate} disabled={saving}
          className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-white/10 bg-white/3 hover:bg-white/8 transition-all group disabled:opacity-50">
          <div className="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0 group-hover:bg-white/15 transition-colors">
            <RefreshCw className="w-5 h-5 text-white/60"/>
          </div>
          <div className="text-left flex-1">
            <div className="text-white/70 font-bold text-sm">↺ Regenerate</div>
            <div className="text-white/40 text-xs mt-0.5">Go back and generate a completely new version</div>
          </div>
          <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors"/>
        </button>
      </div>

      {!overallSafe && (
        <p className="text-yellow-400/70 text-xs mt-3 text-center">
          ⚠️ {flaggedIssues.length} flagged term{flaggedIssues.length>1?'s':''} detected — consider regenerating for cleaner content
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// STEP 3 — SCHEDULE
// New flow: ratio select → platform cards → caption/time → schedule
// ─────────────────────────────────────────────────────────────────
function ScheduleSection({ video }) {
  const navigate = useNavigate()
  const user = useAuthStore(state => state.user)
  const updateUser = useAuthStore(state => state.updateUser)
  const effectiveMonthlyQuota = monthlyVideoQuota(user)
  const accountId = user?.id || 'guest'
  const postKit = buildSocialPostKit(video)
  const filename = `${(video.title||'video_ad').replace(/[^a-z0-9]/gi,'_').toLowerCase()}.webm`

  // ── Step 1: which ratios are in scope ──────────────────────────
  const [selectedRatios, setSelectedRatios] = useState(() => {
    if (Array.isArray(video.targetRatios) && video.targetRatios.length > 0) return video.targetRatios
    const tp = video.targetPlatform || '16:9'
    if (['9:16','16:9','1:1'].includes(tp)) return [tp]
    return ['16:9']
  })

  // ── Step 2: which platform cards are checked ───────────────────
  // Default: all platforms whose ratio is in selectedRatios
  const [selectedPlatformIds, setSelectedPlatformIds] = useState(() => {
    const initRatios = Array.isArray(video.targetRatios) && video.targetRatios.length > 0
      ? video.targetRatios : ['16:9']
    return PLATFORM_SCHEDULE_CONFIGS
      .filter(p => initRatios.includes(p.ratio))
      .map(p => p.id)
  })

  // Keep platform selection in sync when ratios change
  function handleRatiosChange(newRatios) {
    setSelectedRatios(newRatios)
    // Keep already-selected platforms that are still valid; auto-add new platforms for newly added ratios
    setSelectedPlatformIds(prev => {
      const stillValid = prev.filter(id => {
        const cfg = PLATFORM_SCHEDULE_CONFIGS.find(p => p.id === id)
        return cfg && newRatios.includes(cfg.ratio)
      })
      const newlyAdded = PLATFORM_SCHEDULE_CONFIGS
        .filter(p => newRatios.includes(p.ratio) && !stillValid.includes(p.id))
        .map(p => p.id)
      return [...stillValid, ...newlyAdded]
    })
  }

  function togglePlatform(id) {
    setSelectedPlatformIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // ── Caption / schedule fields ──────────────────────────────────
  const [scheduledAt, setScheduledAt] = useState('')
  const [postTitle,   setPostTitle]   = useState(postKit.title)
  const [caption,     setCaption]     = useState(postKit.caption)
  const [hashtags,    setHashtags]    = useState(postKit.hashtagsText)
  const [done,        setDone]        = useState(false)
  const [blobUrl,     setBlobUrl]     = useState(null)
  const [sizeMB,      setSizeMB]      = useState(null)

  useEffect(()=>{
    let url=null
    const blobKey = video.blobKey || getVideoBlobKey(video.creationId || video.id)
    loadBlob(blobKey).then(blob=>{
      if (blob) { url=URL.createObjectURL(blob); setBlobUrl(url); setSizeMB((blob.size/1024/1024).toFixed(1)) }
      else if (blobKey !== VIDEO_KEY) {
        loadBlob(VIDEO_KEY).then(fb=>{ if(fb){ url=URL.createObjectURL(fb); setBlobUrl(url); setSizeMB((fb.size/1024/1024).toFixed(1)) } })
      }
    })
    return ()=>{ if(url) URL.revokeObjectURL(url) }
  },[])

  useEffect(()=>{
    setPostTitle(postKit.title); setCaption(postKit.caption); setHashtags(postKit.hashtagsText)
  },[video?.title, video?.topic, video?.description, video?.script, video?.scenes])

  // ── Schedule handler ───────────────────────────────────────────
  function handleSchedule() {
    if (!selectedPlatformIds.length){ toast.error('Select at least one platform'); return }
    if (!scheduledAt){ toast.error('Pick a schedule date & time'); return }
    const used = Number(user?.videos_generated_this_month || 0)
    if (!isPro(user) && used >= TRIAL_VIDEO_LIMIT) {
      toast.error(`Free limit of ${TRIAL_VIDEO_LIMIT} videos is over. Subscribe to continue.`)
      window.dispatchEvent(new Event('sm:open-plans'))
      return
    }
    if (isPro(user) && used >= effectiveMonthlyQuota) {
      toast.error('Monthly limit reached. Please upgrade.')
      return
    }
    const scheduledIso = new Date(scheduledAt).toISOString()
    if (Number.isNaN(new Date(scheduledAt).getTime())) { toast.error('Invalid date/time'); return }

    const chosenPlatforms = PLATFORM_SCHEDULE_CONFIGS.filter(p => selectedPlatformIds.includes(p.id))
    try {
      const existing = JSON.parse(localStorage.getItem(getLocalVideosKey(accountId)) || '[]')
      const hashtagList = parseHashtagText(hashtags)
      const videoId = video.creationId || video.id || createVideoCreationId()
      const storedVideo = {
        id: videoId, title: postTitle || postKit.title || 'Video Ad',
        description: caption || postKit.description || '',
        topic: video.script?.slice(0, 120) || '', script: video.script || '',
        scenes: video.scenes || [], hashtags: hashtagList.length ? hashtagList : postKit.hashtags,
        videoFormat: video.videoFormat || '16/9', workImages: video.workImages || [],
        logoImage: video.logoImage || '', blobKey: video.blobKey || getVideoBlobKey(videoId),
        sizeMB, status: 'approved', content_type: 'promotional',
        duration_seconds: (video.scenes?.length||5)*6,
        ai_service: 'groq', created_at: new Date().toISOString(), source: 'ai_generator',
      }
      let scheduledVideo = storedVideo
      chosenPlatforms.forEach((p, i) => {
        scheduledVideo = appendScheduleEntry(scheduledVideo, {
          id: `schedule_${Date.now()}_${i}`,
          scheduledAt: scheduledIso,
          scheduledRatio: p.ratio,
          scheduledPlatformId: p.id,
          scheduledPlatformLabel: p.label,
          scheduledPlatformFormat: p.format,
          scheduledTitle: postTitle || postKit.title || 'Video Ad',
          scheduledCaption: caption, scheduledHashtags: hashtags,
          scheduledCopyKit: postKit,
          postStatus: new Date(scheduledAt).getTime() <= Date.now() ? 'publishing' : 'scheduled',
        })
      })
      const filtered = existing.filter(v => String(v.id) !== String(storedVideo.id))
      localStorage.setItem(getLocalVideosKey(accountId), JSON.stringify([scheduledVideo, ...filtered].slice(0, 50)))
      window.dispatchEvent(new Event('socialmind:local-videos-changed'))
    } catch (e) { toast.error('Failed to save schedule'); return }

    toast.success(`✅ Scheduled to ${chosenPlatforms.length} platform${chosenPlatforms.length!==1?'s':''}!`)
    setDone(true)
    setTimeout(()=>navigate('/schedule'), 1500)
  }

  // Platforms visible given selected ratios
  const visiblePlatforms = PLATFORM_SCHEDULE_CONFIGS.filter(p => selectedRatios.includes(p.ratio))
  // Group by ratio for the section headers
  const platformsByRatio = ['9:16','16:9','1:1'].reduce((acc, r) => {
    const list = visiblePlatforms.filter(p => p.ratio === r)
    if (list.length) acc[r] = list
    return acc
  }, {})

  const ratioGroupLabel = { '9:16':'Vertical (9:16)', '16:9':'Horizontal (16:9)', '1:1':'Square (1:1)' }

  if (done) return (
    <div className="text-center py-20">
      <div className="text-6xl mb-4">🎉</div>
      <h2 className="text-2xl font-bold text-white mb-2">Post Scheduled!</h2>
      <p className="text-white/50 text-sm">Redirecting to your Schedule…</p>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-600/20 flex items-center justify-center">
          <Calendar className="w-5 h-5 text-brand-400"/>
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Schedule Your Post</h2>
          <p className="text-white/40 text-sm">Choose platforms, preview each ratio, set a time</p>
        </div>
      </div>

      {/* ── STEP 1: Ratio selector ─────────────────────────────── */}
      <div className="glass-card p-5">
        <div className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">
          Step 1 — Video Formats
        </div>
        <RatioSelector selected={selectedRatios} onChange={handleRatiosChange} />
        <p className="text-white/25 text-[11px] mt-3">
          Canvas preview & recording match the first chosen ratio. Each format is auto-resized by the backend at publish time.
        </p>
      </div>

      {/* ── STEP 2: Platform cards grouped by ratio ─────────────── */}
      {selectedRatios.length > 0 && (
        <div className="space-y-5">
          <div className="text-xs font-bold text-white/40 uppercase tracking-widest px-1">
            Step 2 — Select platforms to post to
          </div>

          {Object.entries(platformsByRatio).map(([ratio, platforms]) => {
            const rc = RATIO_COLORS[ratio] || '#6366F1'
            const is916 = ratio === '9:16'
            const is169 = ratio === '16:9'
            return (
              <div key={ratio}>
                {/* Ratio group header */}
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className="text-xs font-extrabold px-2 py-0.5 rounded-lg"
                    style={{ background: rc+'22', color: rc, border:`1px solid ${rc}40` }}>{ratio}</div>
                  <span className="text-xs text-white/50">{ratioGroupLabel[ratio]}</span>
                  <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg,${rc}30,transparent)` }}/>
                  <span className="text-[10px] text-white/30">{platforms.filter(p=>selectedPlatformIds.includes(p.id)).length}/{platforms.length} selected</span>
                </div>

                {/* Platform cards */}
                <div className={`grid gap-3 ${
                  is916 ? 'grid-cols-2 sm:grid-cols-3' :
                  is169 ? 'grid-cols-1 sm:grid-cols-2' :
                  'grid-cols-2 sm:grid-cols-3'
                }`}>
                  {platforms.map(platform => {
                    const sel = selectedPlatformIds.includes(platform.id)
                    return (
                      <PlatformScheduleCard
                        key={platform.id}
                        platform={platform}
                        selected={sel}
                        onToggle={() => togglePlatform(platform.id)}
                        blobUrl={blobUrl}
                        sceneVideoUrl={video.scenes?.[0]?.videoUrl}
                        sceneText={video.scenes?.[0]?.overlayText}
                        filename={filename}
                        sizeMB={sizeMB}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── STEP 3: Caption / schedule details ──────────────────── */}
      <div className="glass-card p-5 space-y-4">
        <div className="text-xs font-bold text-white/40 uppercase tracking-widest">
          Step 3 — Caption &amp; Schedule Time
        </div>

        {/* Date/time */}
        <div>
          <label className="label">Schedule Date &amp; Time</label>
          <input type="datetime-local" className="input w-full" value={scheduledAt}
            onChange={e=>setScheduledAt(e.target.value)} min={(() => {
              const d = new Date()
              const offset = d.getTimezoneOffset()
              return new Date(d.getTime() - offset * 60 * 1000).toISOString().slice(0, 16)
            })()}/>
        </div>

        {/* Title */}
        <div>
          <label className="label">Title <span className="text-white/30 font-normal">(auto-generated)</span></label>
          <input className="input w-full" value={postTitle}
            onChange={e=>setPostTitle(e.target.value)} placeholder="AI will generate a title here"/>
        </div>

        {/* Caption */}
        <div>
          <label className="label">Caption / Description <span className="text-white/30 font-normal">({caption.length} chars)</span></label>
          <textarea className="input resize-none w-full" rows={4} value={caption}
            onChange={e=>setCaption(e.target.value)} placeholder="Write your post caption…"/>
          {selectedRatios.includes('16:9') && caption.length>280 && (
            <p className="text-red-400 text-xs mt-1">⚠️ Twitter/X limit is 280 characters.</p>
          )}
        </div>

        {/* Hashtags */}
        <div>
          <label className="label">Hashtags</label>
          <input className="input w-full" value={hashtags}
            onChange={e=>setHashtags(e.target.value)} placeholder="#brand #ai #marketing"/>
        </div>

        {/* Reset to AI */}
        <button type="button" className="text-brand-400 hover:text-brand-300 text-xs font-medium"
          onClick={()=>{ setPostTitle(postKit.title); setCaption(postKit.caption); setHashtags(postKit.hashtagsText) }}>
          ↺ Reset caption to AI draft
        </button>

        {/* Summary */}
        {selectedPlatformIds.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/4 p-3">
            <p className="text-xs text-white/40 mb-2">Scheduling to:</p>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORM_SCHEDULE_CONFIGS.filter(p=>selectedPlatformIds.includes(p.id)).map(p=>{
                const rc = RATIO_COLORS[p.ratio]||'#6366F1'
                return (
                  <span key={p.id} className="text-xs font-semibold px-2 py-0.5 rounded-lg"
                    style={{ background: p.color+'18', color: p.color, border:`1px solid ${p.color}40` }}>
                    {p.icon} {p.label} <span className="opacity-50 text-[9px]">{p.ratio}</span>
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 pt-1">
          <button onClick={()=>{ toast('Video saved in browser. Schedule it later from Videos.', {icon:'💾'}); navigate('/videos') }}
            className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 text-sm transition flex items-center justify-center gap-1.5">
            <Save className="w-3.5 h-3.5"/> Save &amp; Exit
          </button>
          <button onClick={handleSchedule}
            disabled={!selectedPlatformIds.length || !scheduledAt}
            className="flex-1 btn-primary flex items-center justify-center gap-2 py-3 disabled:opacity-40 disabled:cursor-not-allowed">
            <Send className="w-4 h-4"/>
            Schedule {selectedPlatformIds.length > 0 ? `(${selectedPlatformIds.length})` : ''}
          </button>
        </div>
        <p className="text-xs text-white/25 text-center -mt-2">
          💾 Your video is stored in your browser — it won't be lost if you exit
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// PLATFORM SCHEDULE CARD
// Clickable card showing platform name + video in its ratio's device frame
// ─────────────────────────────────────────────────────────────────
function PlatformScheduleCard({ platform, selected, onToggle, blobUrl, sceneVideoUrl, sceneText, filename, sizeMB }) {
  const rc = RATIO_COLORS[platform.ratio] || '#6366F1'
  const hasVideo = !!(blobUrl || sceneVideoUrl)
  const canDownload = isPro(useAuthStore(state => state.user))

  return (
    <div
      onClick={onToggle}
      className="cursor-pointer rounded-2xl transition-all duration-200 overflow-hidden select-none"
      style={{
        border: `2px solid ${selected ? platform.color : 'rgba(255,255,255,0.08)'}`,
        background: selected ? `linear-gradient(145deg, ${platform.color}12 0%, ${platform.color}05 100%)` : 'rgba(255,255,255,0.03)',
        boxShadow: selected ? `0 0 20px ${platform.color}25, 0 0 0 1px ${platform.color}20` : 'none',
      }}
    >
      {/* Card header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        {/* Checkbox */}
        <div className="flex-shrink-0 w-4 h-4 rounded flex items-center justify-center transition-all"
          style={selected
            ? { background: platform.color, boxShadow: `0 0 6px ${platform.color}80` }
            : { border: '1.5px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.04)' }}>
          {selected && (
            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        <span className="text-xs font-bold text-white flex-1 truncate">{platform.icon} {platform.label}</span>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
          style={{ background: rc+'20', color: rc, border:`1px solid ${rc}35` }}>{platform.ratio}</span>
      </div>

      {/* Video preview in device frame */}
      <div className="px-3 pb-3">
        <div className="relative">
          <DeviceFrame ratio={platform.ratio}>
            {hasVideo ? (
              <video
                key={`${blobUrl||sceneVideoUrl}-${platform.ratio}`}
                src={blobUrl || sceneVideoUrl}
                muted loop autoPlay playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5"
                style={{ background: `linear-gradient(135deg, ${platform.color}12, #000)` }}>
                <Play className="w-6 h-6 text-white/15" />
                <span className="text-[9px] text-white/20">No preview yet</span>
              </div>
            )}
            {/* LIVE / REC badge */}
            {hasVideo && (
              <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full"
                style={{ background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"/>
                <span className="text-white text-[8px] font-bold">LIVE</span>
              </div>
            )}
            {/* Caption overlay */}
            {sceneText && (
              <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
                style={{ background:'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)', padding:'14px 6px 8px' }}>
                <p className="text-white text-[8px] leading-snug line-clamp-2 font-medium">{sceneText}</p>
              </div>
            )}
          </DeviceFrame>
          {/* Glow when selected */}
          {selected && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3/4 h-3 blur-lg rounded-full pointer-events-none"
              style={{ background: platform.color+'50' }} />
          )}
        </div>

        {/* Download link for this ratio version */}
        {selected && blobUrl && filename && (
          <a
            href={canDownload ? blobUrl : undefined}
            download={canDownload ? filename : undefined}
            onClick={e => {
              e.stopPropagation()
              if (canDownload) return
              e.preventDefault()
              toast.error('Subscribe to download videos.')
              window.dispatchEvent(new Event('sm:open-plans'))
            }}
            className="mt-2 flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-semibold transition-all"
            style={{ background: platform.color+'15', color: platform.color, border:`1px solid ${platform.color}30` }}>
            <Download className="w-2.5 h-2.5"/> {canDownload ? `Download ${sizeMB} MB` : 'Subscribe to Download'}
          </a>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// RATIO COLORS — one accent per ratio family
// ─────────────────────────────────────────────────────────────────
const RATIO_COLORS = { '16:9': '#3B82F6', '9:16': '#8B5CF6', '1:1': '#EC4899' }

// ─────────────────────────────────────────────────────────────────
// RATIO THUMBNAIL — frame shape that mirrors the actual aspect ratio
// ─────────────────────────────────────────────────────────────────
function RatioThumbnail({ ratio, size = 'md' }) {
  const color  = RATIO_COLORS[ratio] || '#6366F1'
  // Physical dimensions (px) keyed by ratio + size
  const dims = {
    '16:9': { sm: [34, 19], md: [44, 25] },
    '9:16': { sm: [15, 27], md: [20, 36] },
    '1:1':  { sm: [23, 23], md: [30, 30] },
  }
  const [w, h] = (dims[ratio] || dims['16:9'])[size] || dims['16:9'].md
  return (
    <div className="flex-shrink-0 rounded-sm overflow-hidden"
      style={{
        width: w, height: h,
        background: `linear-gradient(135deg, ${color}30, ${color}10)`,
        border: `1.5px solid ${color}70`,
        boxShadow: `0 0 8px ${color}40`,
      }} />
  )
}

// ─────────────────────────────────────────────────────────────────
// PLATFORM SELECTOR — visual dropdown grouped by aspect ratio
// ─────────────────────────────────────────────────────────────────
function PlatformSelector({ selected = [], onChange, singleSelect = false }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    function onOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  const grouped = {
    '16:9': ALL_PLATFORMS.filter(p => p.ratio === '16:9'),
    '9:16': ALL_PLATFORMS.filter(p => p.ratio === '9:16'),
    '1:1':  ALL_PLATFORMS.filter(p => p.ratio === '1:1'),
  }

  function toggle(id) {
    if (singleSelect) { onChange([id]); setOpen(false) }
    else onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id])
  }

  const selectedObjs = ALL_PLATFORMS.filter(p => selected.includes(p.id))

  return (
    <div className="relative" ref={wrapRef}>

      {/* ── Trigger ── */}
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-3 rounded-xl text-left min-h-[52px] transition-all"
        style={{
          background: open ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.04)',
          border: `1.5px solid ${open ? 'rgba(99,102,241,0.45)' : 'rgba(255,255,255,0.12)'}`,
          boxShadow: open ? '0 0 0 3px rgba(99,102,241,0.12)' : 'none',
        }}>
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          {selectedObjs.length === 0 ? (
            <span className="text-white/35 text-sm">Choose platform(s)…</span>
          ) : selectedObjs.map(p => (
            <span key={p.id}
              className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ background: p.color + '25', color: p.color, border: `1px solid ${p.color}55` }}>
              <RatioThumbnail ratio={p.ratio} size="sm" />
              {p.icon} {p.label}
              <span className="opacity-55 font-normal">{p.ratio}</span>
            </span>
          ))}
        </div>
        <ChevronDown className={`w-4 h-4 text-white/40 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-2 rounded-xl overflow-hidden"
          style={{
            background: '#0c1021',
            border: '1.5px solid rgba(255,255,255,0.12)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.08)',
            maxHeight: 420, overflowY: 'auto',
          }}>
          {Object.entries(grouped).map(([ratio, platforms], gi) => {
            const rc = RATIO_COLORS[ratio]
            return (
              <div key={ratio}>
                {/* ── Ratio group header ── */}
                <div className="flex items-center gap-3 px-4 py-3 sticky top-0 z-10"
                  style={{
                    background: `linear-gradient(90deg, ${rc}18 0%, rgba(12,16,33,0.98) 100%)`,
                    borderLeft: `3px solid ${rc}`,
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                    borderTop: gi > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  }}>
                  <RatioThumbnail ratio={ratio} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold" style={{ color: rc }}>{ratio}</div>
                    <div className="text-[10px] text-white/35 truncate">{RATIO_CATEGORY_LABEL[ratio]}</div>
                  </div>
                </div>

                {/* ── Platform rows ── */}
                {platforms.map((p, pi) => {
                  const sel = selected.includes(p.id)
                  return (
                    <button key={p.id} type="button" onClick={() => toggle(p.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 transition-all relative"
                      style={{
                        borderBottom: pi < platforms.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        borderLeft: `3px solid ${sel ? p.color : 'transparent'}`,
                        background: sel
                          ? `linear-gradient(90deg, ${p.color}14 0%, transparent 70%)`
                          : 'transparent',
                      }}
                      onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                      onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent' }}>

                      {/* Custom checkbox */}
                      <div className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center transition-all"
                        style={sel
                          ? { background: p.color, boxShadow: `0 0 8px ${p.color}60` }
                          : { border: '1.5px solid rgba(255,255,255,0.22)', background: 'transparent' }}>
                        {sel && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2.2"
                              strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>

                      {/* Platform icon */}
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-lg"
                        style={{ background: p.color + '20' }}>
                        {p.icon}
                      </div>

                      {/* Name + meta */}
                      <div className="flex-1 text-left min-w-0">
                        <div className={`text-sm font-semibold ${sel ? 'text-white' : 'text-white/75'}`}>
                          {p.label}
                        </div>
                        <div className="text-[10px] text-white/30 mt-0.5">
                          {p.rules.maxDuration}s max · {p.rules.maxChars.toLocaleString()} chars
                        </div>
                      </div>

                      {/* Ratio pill */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <RatioThumbnail ratio={p.ratio} size="sm" />
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: p.color + '20', color: p.color, border: `1px solid ${p.color}45` }}>
                          {p.ratio}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}

          {/* Footer */}
          {!singleSelect && (
            <div className="flex items-center justify-between px-4 py-2.5 sticky bottom-0"
              style={{ background: '#0c1021', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-xs text-white/40">
                {selected.length > 0
                  ? `${selected.length} platform${selected.length > 1 ? 's' : ''} selected`
                  : 'No platforms selected'}
              </span>
              {selected.length > 0 && (
                <button type="button" onClick={() => onChange([])}
                  className="text-[11px] text-white/35 hover:text-white/65 transition-colors px-2 py-1 rounded hover:bg-white/5">
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// PLATFORM PREVIEW GRID — each platform shown in its exact ratio
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// LIVE MULTI-RATIO PREVIEW — shown in Generate step when 2+ ratios
// Shows the current scene video in each selected ratio's device frame
// ─────────────────────────────────────────────────────────────────
function LiveMultiRatioPreview({ ratios, sceneVideoUrl, overlayText, voiceover, previewWorkImageSrc, logoDataUrl, isRecording }) {
  const portrait  = ratios.filter(r => r === '9:16')
  const landscape = ratios.filter(r => r === '16:9')
  const square    = ratios.filter(r => r === '1:1')
  const nonPortrait = [...landscape, ...square]

  function RatioSlot({ ratio }) {
    const rc = RATIO_COLORS[ratio] || '#6366F1'
    const group = RATIO_GROUPS.find(g => g.ratio === ratio)
    return (
      <div className="flex flex-col gap-1.5">
        {/* Label */}
        <div className="flex items-center gap-1.5 px-0.5">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: rc+'22', color: rc, border:`1px solid ${rc}40` }}>{ratio}</span>
          <span className="text-[9px] text-white/35 truncate">{group?.platforms.join(' · ')}</span>
          {isRecording && (
            <span className="ml-auto flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[9px] text-red-400 font-bold">REC</span>
            </span>
          )}
        </div>
        {/* Device frame */}
        <div className="relative">
          <DeviceFrame ratio={ratio}>
            {sceneVideoUrl ? (
              <video key={`${sceneVideoUrl}-${ratio}`} src={sceneVideoUrl} autoPlay muted loop playsInline
                className="absolute inset-0 w-full h-full object-contain" style={{ background: '#000' }} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-4xl bg-gradient-to-br from-slate-900 to-slate-800">🎬</div>
            )}
            {previewWorkImageSrc && (
              <img src={previewWorkImageSrc} alt="" className="absolute inset-0 w-full h-full object-cover z-10 pointer-events-none" style={{transform:'scale(1.02)'}}/>
            )}
            {logoDataUrl && (
              <img src={logoDataUrl} alt="" className="absolute bottom-2 right-2 z-20 w-10 h-auto rounded pointer-events-none opacity-80"/>
            )}
            {overlayText && (
              <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
                style={{ background:'linear-gradient(to top,rgba(0,0,0,0.88) 0%,transparent 100%)', padding:'16px 8px 10px' }}>
                <p className="text-white text-[9px] leading-snug line-clamp-2 font-semibold drop-shadow">{overlayText}</p>
              </div>
            )}
          </DeviceFrame>
          {/* Glow */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3/4 h-3 blur-xl rounded-full pointer-events-none"
            style={{ background: rc+'40' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Landscape + Square side by side */}
      {nonPortrait.length > 0 && (
        <div className={`grid gap-4 ${nonPortrait.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {nonPortrait.map(r => <RatioSlot key={r} ratio={r} />)}
        </div>
      )}
      {/* Portrait — centred, max width constrained */}
      {portrait.length > 0 && (
        <div className="flex justify-center">
          <div style={{ width: portrait.length === 1 ? 180 : '100%', maxWidth: 360 }}
            className={`grid gap-4 ${portrait.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {portrait.map(r => <RatioSlot key={r} ratio={r} />)}
          </div>
        </div>
      )}
    </div>
  )
}


function DeviceFrame({ ratio, children }) {
  if (ratio === '9:16') {
    return (
      <div className="relative mx-auto" style={{ width: '62%', maxWidth: 170 }}>
        {/* Phone shell */}
        <div className="rounded-[28px] overflow-hidden relative"
          style={{ aspectRatio: '9/16', border: '3px solid rgba(255,255,255,0.18)', background: '#000',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 20px 50px rgba(0,0,0,0.6)' }}>
          {/* Dynamic island */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 rounded-full bg-black"
            style={{ width: 44, height: 10, border: '1px solid rgba(255,255,255,0.08)' }} />
          {children}
          {/* Home bar */}
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-20 rounded-full bg-white/30"
            style={{ width: 36, height: 4 }} />
        </div>
      </div>
    )
  }
  if (ratio === '16:9') {
    return (
      <div>
        <div className="rounded-lg overflow-hidden relative"
          style={{ aspectRatio: '16/9', border: '2.5px solid rgba(255,255,255,0.18)', background: '#000',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 12px 40px rgba(0,0,0,0.5)' }}>
          {children}
        </div>
        {/* Monitor stand */}
        <div className="flex justify-center mt-1">
          <div className="rounded-b" style={{ width: 48, height: 8, background: 'rgba(255,255,255,0.08)' }} />
        </div>
        <div className="flex justify-center">
          <div className="rounded" style={{ width: 80, height: 5, background: 'rgba(255,255,255,0.06)' }} />
        </div>
      </div>
    )
  }
  // 1:1 — Instagram-style frame
  return (
    <div className="rounded-xl overflow-hidden relative"
      style={{ aspectRatio: '1/1', border: '2px solid rgba(255,255,255,0.18)', background: '#000',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 12px 30px rgba(0,0,0,0.5)' }}>
      {children}
    </div>
  )
}

function PlatformPreviewCard({ platform, blobUrl, sceneVideoUrl, sceneText, filename, sizeMB }) {
  const hasVideo = !!(blobUrl || sceneVideoUrl)
  const rc = RATIO_COLORS[platform.ratio] || platform.color
  const canDownload = isPro(useAuthStore(state => state.user))

  const videoEl = hasVideo ? (
    <video
      src={blobUrl || sceneVideoUrl}
      muted loop autoPlay playsInline
      className="absolute inset-0 w-full h-full object-cover" />
  ) : (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"
      style={{ background: `linear-gradient(135deg, ${platform.color}18, #000)` }}>
      <Play className="w-8 h-8 text-white/20" />
      <span className="text-[10px] text-white/20">No preview yet</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-2">
      {/* Platform label row */}
      <div className="flex items-center gap-2 px-1">
        <div className="w-6 h-6 rounded-md flex items-center justify-center text-sm flex-shrink-0"
          style={{ background: platform.color + '25' }}>
          {platform.icon}
        </div>
        <span className="text-xs font-semibold text-white flex-1 truncate">{platform.label}</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <RatioThumbnail ratio={platform.ratio} size="sm" />
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: rc + '22', color: rc, border: `1px solid ${rc}45` }}>
            {platform.ratio}
          </span>
        </div>
      </div>

      {/* Device frame wrapping the video */}
      <div className="relative">
        <DeviceFrame ratio={platform.ratio}>
          {videoEl}
          {/* LIVE indicator */}
          {hasVideo && (
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-[9px] font-bold tracking-wide">LIVE</span>
            </div>
          )}
          {/* Caption overlay */}
          {sceneText && (
            <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, transparent 100%)', padding: '20px 10px 14px' }}>
              <p className="text-white text-[10px] leading-snug line-clamp-2 font-medium drop-shadow">
                {sceneText}
              </p>
            </div>
          )}
        </DeviceFrame>

        {/* Glow under the device */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3/4 h-4 blur-xl rounded-full pointer-events-none"
          style={{ background: rc + '30' }} />
      </div>

      {/* Download button */}
      {blobUrl && filename && (
        <a
          href={canDownload ? blobUrl : undefined}
          download={canDownload ? filename : undefined}
          onClick={e => {
            if (canDownload) return
            e.preventDefault()
            toast.error('Subscribe to download videos.')
            window.dispatchEvent(new Event('sm:open-plans'))
          }}
          className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
          style={{ background: platform.color + '18', color: platform.color, border: `1px solid ${platform.color}35` }}>
          <Download className="w-3 h-3" />
          {canDownload ? `Download · ${sizeMB} MB` : 'Subscribe to Download'}
        </a>
      )}
    </div>
  )
}

function PlatformPreviewGrid({ selectedIds, blobUrl, sceneVideoUrl, sceneText, filename, sizeMB }) {
  const selected = ALL_PLATFORMS.filter(p => selectedIds.includes(p.id))
  if (!selected.length) return null

  const portrait  = selected.filter(p => p.ratio === '9:16')
  const other     = selected.filter(p => p.ratio !== '9:16')
  const mixed     = portrait.length > 0 && other.length > 0

  // Portrait cards need a narrower column so they don't stretch — put them in a separate row
  const otherCols =
    other.length === 0 ? '' :
    other.length === 1 ? 'grid-cols-1 max-w-xs' :
    other.length === 2 ? 'grid-cols-2' :
    'grid-cols-2 md:grid-cols-3'

  const portraitCols =
    portrait.length === 1 ? 'grid-cols-1 max-w-[200px]' :
    portrait.length === 2 ? 'grid-cols-2' :
    'grid-cols-3'

  return (
    <div className="space-y-4 pt-1">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {['16:9','9:16','1:1'].filter(r => selected.some(p => p.ratio === r)).map(r => (
            <RatioThumbnail key={r} ratio={r} size="sm" />
          ))}
        </div>
        <div className="text-xs font-semibold text-white/50 uppercase tracking-wider">Video Previews</div>
        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.1) 0%, transparent 100%)' }} />
        <span className="text-[10px] text-white/25">{selected.length} platform{selected.length > 1 ? 's' : ''}</span>
      </div>

      {/* Mixed-ratio notice */}
      {mixed && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-[11px]"
          style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <span className="text-amber-400 mt-0.5 flex-shrink-0">⚡</span>
          <span className="text-amber-300/80">
            Mixed ratios detected — your video will be <strong>smart-cropped</strong> to fit each platform's required frame when scheduled. No black bars added.
          </span>
        </div>
      )}

      {/* Landscape + Square previews */}
      {other.length > 0 && (
        <div className={`grid gap-5 ${otherCols}`}>
          {other.map(p => (
            <PlatformPreviewCard key={p.id} platform={p}
              blobUrl={blobUrl} sceneVideoUrl={sceneVideoUrl}
              sceneText={sceneText} filename={filename} sizeMB={sizeMB} />
          ))}
        </div>
      )}

      {/* Portrait previews — centred, naturally narrower */}
      {portrait.length > 0 && (
        <div className={`grid gap-5 mx-auto w-full ${portraitCols}`}
          style={{ maxWidth: portrait.length === 1 ? 240 : portrait.length === 2 ? 420 : '100%' }}>
          {portrait.map(p => (
            <PlatformPreviewCard key={p.id} platform={p}
              blobUrl={blobUrl} sceneVideoUrl={sceneVideoUrl}
              sceneText={sceneText} filename={filename} sizeMB={sizeMB} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// RATIO SELECTOR — 3-card checkbox grid (9:16 / 16:9 / 1:1)
// ─────────────────────────────────────────────────────────────────
function RatioSelector({ selected, onChange, singleSelect = false }) {
  function toggle(ratio) {
    if (singleSelect) { onChange([ratio]); return }
    onChange(selected.includes(ratio) ? selected.filter(r => r !== ratio) : [...selected, ratio])
  }

  return (
    <div className="flex flex-col gap-2">
      {RATIO_GROUPS.map(rg => {
        const sel = selected.includes(rg.ratio)
        const rc  = rg.color

        // Small frame shape dims
        const frameW = rg.ratio === '16:9' ? 38 : rg.ratio === '9:16' ? 17 : 26
        const frameH = rg.ratio === '16:9' ? 21 : rg.ratio === '9:16' ? 30 : 26

        return (
          <button key={rg.ratio} type="button" onClick={() => toggle(rg.ratio)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all select-none text-left w-full"
            style={{
              border: `2px solid ${sel ? rc : 'rgba(255,255,255,0.1)'}`,
              background: sel
                ? `linear-gradient(145deg, ${rc}1a 0%, ${rc}08 100%)`
                : 'rgba(255,255,255,0.03)',
              boxShadow: sel ? `0 0 20px ${rc}28, 0 0 0 1px ${rc}22` : 'none',
            }}>

            {/* Checkbox */}
            <div className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center transition-all"
              style={sel
                ? { background: rc, boxShadow: `0 0 8px ${rc}80` }
                : { border: '2px solid rgba(255,255,255,0.28)', background: 'rgba(255,255,255,0.04)' }}>
              {sel && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2.4"
                    strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>

            {/* Ratio frame shape */}
            <div className="flex-shrink-0 rounded-sm"
              style={{
                width: frameW, height: frameH,
                background: sel ? `linear-gradient(135deg, ${rc}55, ${rc}22)` : 'rgba(255,255,255,0.07)',
                border: `1.5px solid ${sel ? rc : 'rgba(255,255,255,0.18)'}`,
                boxShadow: sel ? `0 0 8px ${rc}45` : 'none',
              }} />

            {/* "RATIO — Platform1 · Platform2 · …" */}
            <div className="flex-1 min-w-0 leading-snug">
              <span className="font-extrabold text-sm mr-1"
                style={{ color: sel ? rc : 'rgba(255,255,255,0.75)' }}>
                {rg.ratio}
              </span>
              <span className="text-sm"
                style={{ color: sel ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.35)' }}>
                — {rg.platforms.join(' · ')}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// RATIO PREVIEW GRID — separate preview for each selected ratio
// ─────────────────────────────────────────────────────────────────
function RatioPreviewCard({ group, blobUrl, sceneVideoUrl, sceneText, filename, sizeMB }) {
  const rc      = group.color
  const hasVideo = !!(blobUrl || sceneVideoUrl)

  const videoEl = hasVideo ? (
    <video src={blobUrl || sceneVideoUrl} muted loop autoPlay playsInline
      className="absolute inset-0 w-full h-full object-contain" style={{ background: '#000' }} />
  ) : (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"
      style={{ background: `linear-gradient(135deg, ${rc}15, #000)` }}>
      <Play className="w-8 h-8 text-white/20" />
      <span className="text-[10px] text-white/20">Play ad first to preview</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-2">
      {/* Card header */}
      <div className="flex items-center gap-2 px-0.5">
        <div className="flex items-center gap-1">
          {group.platformIcons.map((icon, i) => (
            <span key={i} className="text-sm leading-none" title={group.platforms[i]}>{icon}</span>
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-bold text-white">{group.ratio}</span>
          <span className="text-white/35 text-[10px] ml-1.5">{group.platforms.join(', ')}</span>
        </div>
        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ background: rc + '20', color: rc, border: `1px solid ${rc}40` }}>
          {group.label}
        </span>
      </div>

      {/* Device frame */}
      <div className="relative">
        <DeviceFrame ratio={group.ratio}>
          {videoEl}
          {hasVideo && (
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-[9px] font-bold">LIVE</span>
            </div>
          )}
          {sceneText && (
            <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, transparent 100%)', padding: '20px 10px 14px' }}>
              <p className="text-white text-[10px] leading-snug line-clamp-2 font-medium">{sceneText}</p>
            </div>
          )}
        </DeviceFrame>
        {/* Glow */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3/4 h-4 blur-xl rounded-full pointer-events-none"
          style={{ background: rc + '35' }} />
      </div>

    </div>
  )
}

function RatioPreviewGrid({ selectedRatios, blobUrl, sceneVideoUrl, sceneText, filename, sizeMB }) {
  const groups = RATIO_GROUPS.filter(g => selectedRatios.includes(g.ratio))
  if (!groups.length) return null

  // Portrait (9:16) cards must be narrow — put them in a max-width constraint
  const portrait  = groups.filter(g => g.ratio === '9:16')
  const other     = groups.filter(g => g.ratio !== '9:16')

  const otherCols =
    other.length === 1 ? 'grid-cols-1' :
    other.length === 2 ? 'grid-cols-2' : 'grid-cols-3'

  const portraitCols =
    portrait.length === 1 ? 'grid-cols-1' :
    portrait.length === 2 ? 'grid-cols-2' : 'grid-cols-3'

  const portraitMaxW =
    portrait.length === 1 ? 200 :
    portrait.length === 2 ? 380 : '100%'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5">
          {groups.map(g => (
            <div key={g.ratio} className="rounded text-[9px] font-bold px-1.5 py-0.5"
              style={{ background: g.color + '20', color: g.color, border: `1px solid ${g.color}40` }}>
              {g.ratio}
            </div>
          ))}
        </div>
        <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Video Previews</span>
        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.1), transparent)' }} />
        <span className="text-[10px] text-white/25">{groups.length} format{groups.length > 1 ? 's' : ''}</span>
      </div>

      {/* Landscape + Square */}
      {other.length > 0 && (
        <div className={`grid gap-6 ${otherCols}`}>
          {other.map(g => (
            <RatioPreviewCard key={g.ratio} group={g}
              blobUrl={blobUrl} sceneVideoUrl={sceneVideoUrl}
              sceneText={sceneText} filename={filename} sizeMB={sizeMB} />
          ))}
        </div>
      )}

      {/* Portrait — centred and naturally narrow */}
      {portrait.length > 0 && (
        <div className={`grid gap-6 mx-auto ${portraitCols}`}
          style={{ maxWidth: portraitMaxW }}>
          {portrait.map(g => (
            <RatioPreviewCard key={g.ratio} group={g}
              blobUrl={blobUrl} sceneVideoUrl={sceneVideoUrl}
              sceneText={sceneText} filename={filename} sizeMB={sizeMB} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// PLATFORM REVIEW CARD — one card per platform, in its correct ratio
// ─────────────────────────────────────────────────────────────────
function PlatformReviewCard({ platform, blobUrl, sceneVideoUrl, sceneText }) {
  const rc = platform.color
  const hasVideo = !!(blobUrl || sceneVideoUrl)

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center gap-2 px-0.5">
        <span className="text-sm leading-none">{platform.icon}</span>
        <span className="text-xs font-bold text-white truncate">{platform.label}</span>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto flex-shrink-0"
          style={{ background: rc + '20', color: rc, border: `1px solid ${rc}40` }}>
          {platform.ratio}
        </span>
      </div>

      {/* Device frame */}
      <div className="relative">
        <DeviceFrame ratio={platform.ratio}>
          {hasVideo ? (
            <video src={blobUrl || sceneVideoUrl} muted loop autoPlay playsInline
              className="absolute inset-0 w-full h-full object-contain" style={{ background: '#000' }} />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"
              style={{ background: `linear-gradient(135deg, ${rc}15, #000)` }}>
              <Play className="w-8 h-8 text-white/20" />
              <span className="text-[10px] text-white/20">Play ad first</span>
            </div>
          )}
          {hasVideo && (
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-[9px] font-bold">LIVE</span>
            </div>
          )}
          {sceneText && (
            <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, transparent 100%)', padding: '20px 10px 14px' }}>
              <p className="text-white text-[10px] leading-snug line-clamp-2 font-medium">{sceneText}</p>
            </div>
          )}
        </DeviceFrame>
        {/* Glow */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3/4 h-4 blur-xl rounded-full pointer-events-none"
          style={{ background: rc + '35' }} />
      </div>
    </div>
  )
}

function PlatformReviewGrid({ selectedRatios, blobUrl, sceneVideoUrl, sceneText }) {
  const platforms = PLATFORM_SCHEDULE_CONFIGS.filter(p => selectedRatios.includes(p.ratio))
  if (!platforms.length) return null

  const landscape = platforms.filter(p => p.ratio === '16:9')
  const portrait  = platforms.filter(p => p.ratio === '9:16')
  const square    = platforms.filter(p => p.ratio === '1:1')

  const landscapeCols =
    landscape.length <= 2 ? `grid-cols-${landscape.length}` :
    landscape.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'

  const portraitCols =
    portrait.length === 1 ? 'grid-cols-1' :
    portrait.length === 2 ? 'grid-cols-2' : 'grid-cols-3'

  const portraitMaxW =
    portrait.length === 1 ? 200 :
    portrait.length === 2 ? 380 : 560

  return (
    <div className="space-y-6">
      {/* Landscape platforms */}
      {landscape.length > 0 && (
        <div className={`grid gap-4 ${landscapeCols}`}>
          {landscape.map(p => (
            <PlatformReviewCard key={p.id} platform={p}
              blobUrl={blobUrl} sceneVideoUrl={sceneVideoUrl} sceneText={sceneText} />
          ))}
        </div>
      )}

      {/* Portrait platforms — constrained and centred */}
      {portrait.length > 0 && (
        <div className={`grid gap-4 mx-auto ${portraitCols}`}
          style={{ maxWidth: portraitMaxW }}>
          {portrait.map(p => (
            <PlatformReviewCard key={p.id} platform={p}
              blobUrl={blobUrl} sceneVideoUrl={sceneVideoUrl} sceneText={sceneText} />
          ))}
        </div>
      )}

      {/* Square platform — centred */}
      {square.length > 0 && (
        <div className="mx-auto" style={{ maxWidth: 240 }}>
          {square.map(p => (
            <PlatformReviewCard key={p.id} platform={p}
              blobUrl={blobUrl} sceneVideoUrl={sceneVideoUrl} sceneText={sceneText} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Canvas helpers ────────────────────────────────────────────────
function wrapCanvasText(ctx,text,x,y,maxW,lineH){
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