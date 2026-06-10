import { useState, useRef, useEffect, useCallback } from 'react'
import {
  X, Send, HelpCircle, Mail, Bot,
  Video, Calendar, Link2, Zap, BarChart3, Download,
  BookOpen, Headphones, Sparkles, RefreshCw, Mic, Wand2,
  Clock, Pencil, Globe2, Settings, Trash2, AlertCircle,
  LayoutDashboard, User, CreditCard, Eye,
} from 'lucide-react'

const SUPPORT_EMAIL = 'natasha@oddinfotech.com'

// ─── Complete Knowledge Base ──────────────────────────────────────────────────
const KB = [

  // ── DASHBOARD
  {
    id: 'dashboard',
    patterns: /dashboard|home page|main page|overview|stat card|videos created|scheduled post|total publish|quota remain/,
    icon: LayoutDashboard, color: '#6366f1',
    chips: ['create', 'schedule', 'analytics'],
    question: 'What does the Dashboard show?',
    answer: `The **Dashboard** is your SocialMind home — it shows everything at a glance:\n\n• **Videos Created** — total AI videos you've generated this month\n• **Scheduled Posts** — posts waiting to be published\n• **Total Published** — posts successfully live on social platforms\n• **Quota Remaining** — how many AI videos you can still create this month\n• **Recent Videos** — your last 5 videos with status and quick actions\n• **Upcoming Posts** — next scheduled posts across all platforms\n• **Platform Performance** — likes, views, and posts per platform`,
  },

  // ── CREATE VIDEO
  {
    id: 'create',
    patterns: /creat|make|generat|new video|ai video|script|start|how.*video|video.*how|produce|build.*video/,
    icon: Video, color: '#22d3ee',
    chips: ['ai_how', 'schedule', 'upload'],
    question: 'How do I create a video?',
    answer: `Creating a video is simple:\n\n• Click **+ Create Video** in the sidebar or Dashboard\n• Choose **AI Generate** — enter a topic or paste your script\n• Or choose **Upload** — use your own video file\n• Pick a style, add a voiceover, preview — then save!\n\nYour video appears in the **Videos** page, ready to schedule.`,
  },

  // ── UPLOAD VIDEO
  {
    id: 'upload',
    patterns: /upload|my own video|own file|import video|bring.*video|add.*video/,
    icon: Video, color: '#7c3aed',
    chips: ['create', 'schedule'],
    question: 'Can I upload my own video?',
    answer: `Yes! You can upload your own video files:\n\n• Click **+ Create Video → Upload**\n• Select your MP4 or video file from your device\n• Add a title and description\n• Save — your video is ready to schedule!\n\nUploaded videos do **not** count against your monthly AI quota. They are free to upload in unlimited quantity.`,
  },

  // ── HOW AI WORKS
  {
    id: 'ai_how',
    patterns: /how.*ai work|ai.*work|how.*generat|ai generat|what is ai|how.*creat.*ai|ai.*video.*how|ai.*make|machine learn|artificial/,
    icon: Wand2, color: '#a78bfa',
    chips: ['ai_voice', 'ai_topics', 'ai_time'],
    question: 'How does AI video generation work?',
    answer: `SocialMind AI creates professional videos in minutes:\n\n• **You give a topic or script** — e.g. "5 tips for productivity"\n• **AI writes the content** and structures the video scenes\n• **AI selects matching footage** from a large media library\n• **Text overlays & transitions** are added automatically\n• **AI voiceover** narrates the video in a natural voice\n• **You preview and save** — then schedule immediately!\n\nNo editing skills needed. The whole process takes 1–3 minutes. 🎬`,
  },

  // ── AI VOICEOVER
  {
    id: 'ai_voice',
    patterns: /voice|voiceover|voice over|narrat|audio|speak|sound|tts|text.to.speech|narrator/,
    icon: Mic, color: '#8b5cf6',
    chips: ['ai_how', 'ai_lang', 'ai_edit'],
    question: 'How does AI voiceover work?',
    answer: `SocialMind generates natural-sounding AI voiceovers:\n\n• AI reads your script in a clear, human-like voice\n• Choose from **multiple voice styles** — professional, casual, energetic\n• Voiceover is **auto-synced** with the video scenes\n• You can **re-generate** the voice if you want a different tone\n• Works in English, Hindi, Tamil, Telugu and more\n\nNo recording equipment needed! 🎙️`,
  },

  // ── AI TOPICS
  {
    id: 'ai_topics',
    patterns: /what.*topic|what.*creat|what.*make|what.*video|type.*video|kind.*video|about what|niche|subject/,
    icon: Wand2, color: '#f59e0b',
    chips: ['ai_how', 'create'],
    question: 'What topics can I create videos about?',
    answer: `You can create videos about virtually any topic:\n\n• **Business & Marketing** — product promos, brand stories, ads\n• **Education** — tips, tutorials, how-to guides, explainers\n• **Social Media** — reels, shorts, trending content\n• **News & Updates** — announcements, company news\n• **Entertainment** — fun facts, quotes, motivational content\n• **E-commerce** — product showcases, offers, reviews\n• **Real Estate, Health, Finance** — any industry\n\nJust type your topic and AI handles the rest! ✨`,
  },

  // ── AI GENERATION TIME
  {
    id: 'ai_time',
    patterns: /how long|how.*fast|time.*tak|wait|minut|second|slow|quick|speed|process.*time|generat.*time/,
    icon: Clock, color: '#10b981',
    chips: ['ai_how', 'create'],
    question: 'How long does AI take to generate a video?',
    answer: `AI video generation is fast:\n\n• **Short videos (15–30s)** → ready in about **1 minute**\n• **Medium videos (30–60s)** → ready in **1–2 minutes**\n• **Longer videos (60s+)** → ready in **2–4 minutes**\n\nA progress indicator shows while it generates. Once done, preview it immediately and schedule — all within minutes! ⚡`,
  },

  // ── EDIT VIDEO
  {
    id: 'ai_edit',
    patterns: /edit|change.*video|modif|adjust|redo|customiz|tweak|update.*video|alter|revis/,
    icon: Pencil, color: '#ec4899',
    chips: ['ai_how', 'schedule', 'download'],
    question: 'Can I edit an AI-generated video?',
    answer: `Yes, you have full control after AI generates your video:\n\n• **Re-generate** the entire video with a new script\n• **Change the voiceover** style or tone\n• **Swap visuals** — replace scenes you don't like\n• **Edit the title and description** before scheduling\n• **Download** and edit in external tools like CapCut or Premiere\n\nAI is just your starting point — you're always in control! 🎨`,
  },

  // ── DELETE VIDEO
  {
    id: 'delete_video',
    patterns: /delet.*video|remov.*video|trash.*video|get rid.*video|video.*delet/,
    icon: Trash2, color: '#ef4444',
    chips: ['create', 'download'],
    question: 'How do I delete a video?',
    answer: `To delete a video:\n\n• Go to the **Videos** page in the sidebar\n• Find the video you want to remove\n• Click the **trash / delete icon** on the video card\n• Confirm the deletion\n\n⚠️ Deleted videos cannot be recovered. If the video has scheduled posts, those posts will also be cancelled.`,
  },

  // ── PREVIEW VIDEO
  {
    id: 'preview_video',
    patterns: /preview|watch.*video|view.*video|play.*video|see.*video|video.*preview/,
    icon: Eye, color: '#3b82f6',
    chips: ['create', 'schedule'],
    question: 'How do I preview a video before publishing?',
    answer: `You can preview any video before scheduling:\n\n• Go to **Videos** in the sidebar\n• Click on any video card to open it\n• Use the **built-in player** to watch the full video\n• Check voiceover, visuals, and text overlays\n• Make any changes, then proceed to Schedule\n\nAlways preview before publishing to ensure quality! 👀`,
  },

  // ── LANGUAGE SUPPORT
  {
    id: 'ai_lang',
    patterns: /language|lang|english|hindi|tamil|telugu|multilingual|translat|region|locale/,
    icon: Globe2, color: '#14b8a6',
    chips: ['ai_voice', 'ai_how'],
    question: 'What languages does AI support?',
    answer: `SocialMind AI currently supports:\n\n• **English** — full support (all voices, styles, and scenes)\n• **Hindi** — voiceover support\n• **Tamil** — voiceover support\n• **Telugu** — voiceover support\n• **More languages** are being added regularly\n\nFor best results, write your script in your preferred language. The AI voiceover will match the language of your script. 🌍`,
  },

  // ── SCHEDULE POST
  {
    id: 'schedule',
    patterns: /schedul|when.*post|auto.*post|set.*time|pick.*time|queue|plan.*post|publish.*time/,
    icon: Calendar, color: '#3b82f6',
    chips: ['connect', 'reschedule', 'posted'],
    question: 'How do I schedule a post?',
    answer: `Scheduling posts is seamless:\n\n• Open your video from the **Videos** page\n• Click the **Schedule** button\n• Select platforms — Instagram, Facebook, LinkedIn, YouTube\n• Pick a **date & time**, then confirm\n\nYour post appears in the **Schedule** page and publishes automatically at the set time — even if you're offline! 📅`,
  },

  // ── RESCHEDULE / CANCEL POST
  {
    id: 'reschedule',
    patterns: /reschedul|cancel.*post|cancel.*schedul|change.*time|edit.*schedul|delete.*schedul|remove.*schedul/,
    icon: Calendar, color: '#22d3ee',
    chips: ['schedule', 'posted'],
    question: 'Can I reschedule or cancel a scheduled post?',
    answer: `Yes, you can manage your scheduled posts:\n\n• Go to the **Schedule** page in the sidebar\n• Find the post you want to change\n• Click **Edit** to change the date/time or platforms\n• Click **Delete / Cancel** to remove the scheduled post\n\n⚠️ You can only reschedule posts that haven't been published yet. Once a post is live, it cannot be unpublished from SocialMind.`,
  },

  // ── MULTIPLE PLATFORMS AT ONCE
  {
    id: 'multi_platform',
    patterns: /multiple platform|all platform|same time|at once|together|simultaneous|cross.post|cross post/,
    icon: Globe2, color: '#8b5cf6',
    chips: ['schedule', 'connect'],
    question: 'Can I post to multiple platforms at once?',
    answer: `Yes! SocialMind lets you post to multiple platforms simultaneously:\n\n• When scheduling, select **all the platforms** you want\n• One video → published to Instagram, Facebook, LinkedIn, YouTube — all at once\n• Each platform gets its own optimized post\n• You can set a **single time** or different times per platform\n\nThis saves hours of manual cross-posting! 🚀`,
  },

  // ── POST FAILED
  {
    id: 'post_failed',
    patterns: /fail|error.*post|post.*error|not publish|didn.*publish|issue.*post|problem.*post|post.*fail|went wrong/,
    icon: AlertCircle, color: '#ef4444',
    chips: ['connect', 'contact'],
    question: 'What if a post fails to publish?',
    answer: `If a post fails to publish, here's what to do:\n\n• Go to **Schedule** or **Posted** page — the post shows a **red Failed** badge\n• Click the post to see the **error message** — it explains why it failed\n• Common reasons: social account disconnected, token expired, or platform issue\n• **Reconnect your social account** in Settings → Social Accounts\n• Then re-schedule the post\n\nIf the issue persists, email us at **${SUPPORT_EMAIL}** with the error message.`,
    isContact: true,
  },

  // ── CONNECT SOCIAL ACCOUNTS
  {
    id: 'connect',
    patterns: /connect|link.*account|social.*account|add.*account|instagram|facebook|linkedin|youtube|platform.*account/,
    icon: Link2, color: '#8b5cf6',
    chips: ['disconnect', 'multi_platform', 'schedule'],
    question: 'How do I connect my social accounts?',
    answer: `Connecting your social accounts takes under a minute:\n\n• Go to **Settings → Social Accounts**\n• Click **Connect** next to the platform you want\n• Log in and authorize SocialMind access\n• Done! That platform is now available for scheduling\n\nSupported platforms: **Instagram, Facebook, LinkedIn, YouTube**\nYou can connect multiple accounts across all platforms! 🔗`,
  },

  // ── DISCONNECT SOCIAL ACCOUNT
  {
    id: 'disconnect',
    patterns: /disconnect|unlink|remove.*account|detach|deauthoriz|revoke/,
    icon: Link2, color: '#f59e0b',
    chips: ['connect', 'settings'],
    question: 'How do I disconnect a social account?',
    answer: `To disconnect a social account:\n\n• Go to **Settings → Social Accounts**\n• Find the connected account you want to remove\n• Click **Disconnect** or **Remove**\n• Confirm the action\n\n⚠️ Disconnecting an account will cancel any **pending scheduled posts** for that platform. Reconnect anytime by clicking Connect again.`,
  },

  // ── QUOTA
  {
    id: 'quota',
    patterns: /quota|limit|how many video|50 video|plan limit|video credit|run out|month.*video|video.*month/,
    icon: Zap, color: '#f59e0b',
    chips: ['upgrade', 'create', 'upload'],
    question: 'What is my video quota?',
    answer: `Your monthly video quota controls how many AI videos you can generate:\n\n• Shown at the bottom of the sidebar — e.g. **"0/50 videos this month"**\n• Each **AI-generated video** uses 1 quota slot\n• **Uploaded videos** are completely free — no quota used\n• Quota automatically **resets every month**\n\nIf you hit the limit, go to **Settings → Plan** to upgrade instantly! ⚡`,
  },

  // ── UPGRADE PLAN
  {
    id: 'upgrade',
    patterns: /upgrad|plan|pric|paid|premium|subscrib|tier|standard|advanced|enterprise|buy|purchas/,
    icon: CreditCard, color: '#22d3ee',
    chips: ['quota', 'contact'],
    question: 'How do I upgrade my plan?',
    answer: `To upgrade your SocialMind plan:\n\n• Go to **Settings** in the sidebar\n• Click **View Plans**\n• Choose **Individual** or **Team**\n• Complete checkout with PayPal to activate your subscription\n\n**Available Plans:**\n• **Individual** — $20/month · 50 AI videos/month\n• **Team** — $79/month · Up to 5 members, SSO, priority support\n\nNeed help choosing? Email us at **${SUPPORT_EMAIL}**`,
    isContact: true,
  },

  // ── POSTED / PUBLISHED
  {
    id: 'posted',
    patterns: /posted|published|live|went live|see.*publish|check.*post|view.*post|post.*live/,
    icon: Sparkles, color: '#10b981',
    chips: ['analytics', 'reschedule'],
    question: 'Where can I see my published posts?',
    answer: `All published content is in one place:\n\n• Click **Posted** in the sidebar\n• See every post that went live across all platforms\n• View likes, views, comments and shares per post\n• Filter by platform or date range\n• See which platform each post was published on\n\nPosts show a **green Published** badge when successful. ✅`,
  },

  // ── ANALYTICS
  {
    id: 'analytics',
    patterns: /analytic|stat|like|view|performance|insight|report|engage|metric|data|reach|impression/,
    icon: BarChart3, color: '#6366f1',
    chips: ['posted', 'quota'],
    question: 'How do I view analytics?',
    answer: `Your analytics give a complete performance picture:\n\n• Click **Analytics** in the sidebar\n• See **total posts, likes, views** across all platforms\n• **Platform breakdown** — Instagram, Facebook, LinkedIn, YouTube stats\n• Track growth over time\n• The **Dashboard** also shows a quick Platform Performance summary\n\nData updates in real time as your posts receive activity! 📈`,
  },

  // ── DOWNLOAD VIDEOS
  {
    id: 'download',
    patterns: /download|save.*video|export|offline|get.*file|mp4|store.*video|local/,
    icon: Download, color: '#ec4899',
    chips: ['create', 'ai_edit'],
    question: 'Can I download my videos?',
    answer: `Yes, download any video directly to your device:\n\n• Click **Downloads** in the sidebar\n• Find the video you want\n• Click the **Download** button\n• Saved as an **MP4 file** to your device\n\nDownloaded videos can be shared anywhere or edited in tools like CapCut, Premiere, or DaVinci Resolve. ⬇️`,
  },

  // ── SETTINGS
  {
    id: 'settings',
    patterns: /setting|account setting|profile|preference|config|option|setup/,
    icon: Settings, color: '#64748b',
    chips: ['connect', 'upgrade', 'profile'],
    question: 'What can I manage in Settings?',
    answer: `The **Settings** page is your control center:\n\n• **Profile** — Update your name, email, username, and photo\n• **Password** — Change your account password\n• **Social Accounts** — Connect or disconnect Instagram, Facebook, LinkedIn, YouTube\n• **Plan / Upgrade** — View your current plan and upgrade\n• **Notifications** — Manage email and in-app notifications\n\nAccess Settings anytime from the sidebar. ⚙️`,
  },

  // ── PROFILE / PASSWORD
  {
    id: 'profile',
    patterns: /password|change.*pass|reset.*pass|update.*profile|edit.*profile|my name|my email|username|photo|avatar|profile pic/,
    icon: User, color: '#3b82f6',
    chips: ['settings', 'contact'],
    question: 'How do I update my profile or password?',
    answer: `To update your profile or change your password:\n\n• Go to **Settings** in the sidebar\n• Click **Profile** to update your name, username, or email\n• Click **Password** to set a new password\n• Save your changes\n\nIf you forgot your password, click **Forgot password?** on the login page — we'll send a reset code to your email. 🔐`,
  },

  // ── HOW IT WORKS PAGE
  {
    id: 'howworks',
    patterns: /how.*work|guide|tutorial|walkthrough|learn|explain|overview|get.*start|beginner|new.*user|step.*step/,
    icon: BookOpen, color: '#14b8a6',
    chips: ['create', 'schedule', 'ai_how'],
    question: 'How does SocialMind work?',
    answer: `SocialMind is your complete AI social media workflow:\n\n**Step 1 — Create** AI generates a video from your topic in 1–3 minutes\n**Step 2 — Review** Preview and make any adjustments\n**Step 3 — Schedule** Pick your platforms and posting time\n**Step 4 — Publish** SocialMind posts automatically — even while you sleep\n**Step 5 — Analyse** Track likes, views, and performance\n\nClick **How it Works** in the sidebar for a full visual guide with screenshots! 🚀`,
  },

  // ── NOTIFICATIONS
  {
    id: 'notifications',
    patterns: /notif|alert|bell|remind|update.*me|inform|tell me/,
    icon: Sparkles, color: '#f59e0b',
    chips: ['posted', 'analytics'],
    question: 'How do notifications work?',
    answer: `SocialMind keeps you updated with real-time notifications:\n\n• The **bell icon** in the top header shows your notifications\n• Get notified when posts are **published successfully**\n• Get alerted if a post **fails** to publish\n• See when you get new **likes, views, or comments**\n• Notifications auto-dismiss after 8 seconds\n\nClick any notification to jump directly to the relevant post or analytics page. 🔔`,
  },

  // ── SUPPORTED PLATFORMS
  {
    id: 'platforms',
    patterns: /which platform|what platform|support.*platform|platform.*support|twitter|x\.com|tiktok|pinterest|snapchat|whatsapp/,
    icon: Globe2, color: '#8b5cf6',
    chips: ['connect', 'schedule'],
    question: 'Which social platforms are supported?',
    answer: `SocialMind currently supports these platforms:\n\n• **Instagram** — Reels, posts, and stories\n• **Facebook** — Page posts and video uploads\n• **LinkedIn** — Professional posts and videos\n• **YouTube** — YouTube Shorts and regular uploads\n\nMore platforms like **Twitter/X, TikTok, and Pinterest** are planned for future updates. Connect your accounts in **Settings → Social Accounts**.`,
  },

  // ── VIDEO FORMATS / SPECS
  {
    id: 'video_specs',
    patterns: /format|mp4|resolution|quality|size|dimension|aspect ratio|hd|1080|720|spec|file.*type/,
    icon: Video, color: '#22d3ee',
    chips: ['create', 'upload', 'download'],
    question: 'What video formats and quality does SocialMind support?',
    answer: `SocialMind works with these video specs:\n\n• **AI-generated videos** — exported in HD MP4 format\n• **Upload formats** — MP4, MOV, AVI, and other common formats\n• **Aspect ratios** — 9:16 (Reels/Shorts), 1:1 (Square), 16:9 (Landscape)\n• **Quality** — Up to 1080p HD\n• **Max upload size** — depends on your plan tier\n\nAI automatically optimizes the format for each platform when publishing. 📹`,
  },

  // ── ACCOUNT / LOGIN ISSUES
  {
    id: 'login_issue',
    patterns: /login|sign in|can.*t.*log|not.*log|password.*wrong|forgot|locked|access|otp|verification/,
    icon: User, color: '#ef4444',
    chips: ['profile', 'contact'],
    question: 'I can\'t log in to my account',
    answer: `If you're having trouble logging in:\n\n• Click **Forgot password?** on the login page\n• Enter your email — we'll send a **6-digit reset code**\n• Enter the code and set a new password\n• Check your **spam folder** if the email doesn't arrive\n\nIf your account is locked or you're not receiving OTPs, email us at **${SUPPORT_EMAIL}** and we'll fix it for you right away! 🔑`,
    isContact: true,
  },

  // ── APP NOT WORKING / TECHNICAL ISSUES
  {
    id: 'app_issue',
    patterns: /not working|broken|bug|glitch|error|issue|problem|crash|blank|loading|stuck|freeze|slow.*app|app.*slow/,
    icon: AlertCircle, color: '#ef4444',
    chips: ['contact', 'post_failed'],
    question: 'The app is not working properly',
    answer: `If something isn't working, try these steps:\n\n• **Refresh the page** — press Ctrl+R (or Cmd+R on Mac)\n• **Clear browser cache** — Ctrl+Shift+Delete → clear cached data\n• **Try a different browser** — Chrome or Edge work best\n• **Log out and log back in** — fixes most session issues\n• **Disable browser extensions** — some block webapp features\n\nIf the issue continues, email us at **${SUPPORT_EMAIL}** with a screenshot and description. We'll fix it fast! 🛠️`,
    isContact: true,
  },

  // ── BEST TIME TO POST
  {
    id: 'best_time',
    patterns: /best time|when.*post|optimal time|right time|when.*publish|peak.*time|time.*post/,
    icon: Clock, color: '#10b981',
    chips: ['schedule', 'analytics'],
    question: 'What is the best time to post on social media?',
    answer: `Here are the generally recommended posting times:\n\n• **Instagram** — Weekdays 9–11 AM or 6–8 PM (your audience's local time)\n• **Facebook** — Tuesday to Thursday, 1–3 PM\n• **LinkedIn** — Tuesday to Thursday, 8–10 AM or 12 PM\n• **YouTube** — Thursday to Saturday, 2–4 PM\n\nCheck your **Analytics** page to see when your own audience is most active — that's always the best guide! 📊`,
  },

  // ── MULTIPLE ACCOUNTS (switching)
  {
    id: 'multi_account',
    patterns: /multiple account|switch account|another account|second account|different account|add.*another user/,
    icon: User, color: '#6366f1',
    chips: ['settings', 'connect'],
    question: 'Can I manage multiple accounts?',
    answer: `Yes! SocialMind supports multiple accounts:\n\n• Click your **profile name** in the top-right header\n• You'll see a **Switch account** option if you have multiple accounts saved\n• Click any account to switch to it (password verification required)\n• Each account has its own videos, scheduled posts, and analytics\n\nTo connect multiple **social media** accounts per platform, go to **Settings → Social Accounts**.`,
  },

  // ── HOW IT WORKS PAGE FEATURE
  {
    id: 'hiw_page',
    patterns: /how it work page|howit|tutorial page|guide page|help.*page|onboard/,
    icon: BookOpen, color: '#14b8a6',
    chips: ['create', 'schedule'],
    question: 'What is the "How it Works" page?',
    answer: `The **How it Works** page is your visual guide to SocialMind:\n\n• Step-by-step walkthrough of the entire workflow\n• Screenshots and explanations for every feature\n• Tips for getting the best results from AI videos\n• How to optimize posts for each platform\n\nFind it in the sidebar — look for the **How it Works** link at the bottom of the navigation menu. Perfect for new users! 📖`,
  },

  // ── CONTACT SUPPORT
  {
    id: 'contact',
    patterns: /contact|support team|help.*human|speak.*someone|email.*support|reach.*out|ticket|issue.*solve/,
    icon: Headphones, color: '#f43f5e',
    chips: [],
    question: 'Contact our support team',
    answer: `Our support team is always here for you! 🙌\n\nEmail us at **${SUPPORT_EMAIL}** with:\n• A short description of your issue\n• Screenshots if helpful\n• Your account email\n\nWe typically reply within a **few hours** during business hours. For urgent issues, mention "URGENT" in the subject line.`,
    isContact: true,
  },
]

const KB_MAP = Object.fromEntries(KB.map(k => [k.id, k]))

// ─── Smart multi-pass matcher ─────────────────────────────────────────────────
function findAnswer(query) {
  const q = query.toLowerCase().trim()
  if (!q) return null

  // Greetings
  if (/^(hi+|hello|hey|yo|sup|hai+|vanakam|namaste|good morning|good afternoon|good evening|wassup|what'?s up)/.test(q)) {
    return {
      id: '_greet',
      answer: `Hello! 👋 I'm your **SocialMind AI Assistant** — I know everything about this app!\n\nAsk me anything about creating videos, scheduling posts, analytics, connecting social accounts, or any feature. I'm here to help!`,
      chips: ['ai_how', 'create', 'schedule'],
    }
  }

  // Thanks
  if (/^(thank|thanks|thx|ty|great|awesome|perfect|nice|superb|good|cool|ok|okay|got it|understood|clear)/.test(q)) {
    return {
      id: '_thanks',
      answer: `You're welcome! 😊 Feel free to ask me anything else about SocialMind — I'm always here to help!`,
      chips: ['create', 'analytics', 'schedule'],
    }
  }

  // Pass 1 — exact pattern match
  for (const item of KB) {
    if (item.patterns.test(q)) return item
  }

  // Pass 2 — word-level keyword scan across all KB answers/questions
  const words = q.split(/\s+/).filter(w => w.length > 3)
  const scores = KB.map(item => {
    let score = 0
    const haystack = (item.question + ' ' + item.answer).toLowerCase()
    words.forEach(word => { if (haystack.includes(word)) score++ })
    return { item, score }
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score)

  if (scores.length > 0) return scores[0].item

  // Pass 3 — never say "I don't know" — give a helpful general answer
  return {
    id: '_general',
    answer: `Great question! Here's a quick overview of what SocialMind can help you with:\n\n• **Create AI Videos** — Generate professional videos from any topic in minutes\n• **Schedule Posts** — Auto-publish to Instagram, Facebook, LinkedIn, YouTube\n• **Analytics** — Track likes, views, and performance across platforms\n• **Downloads** — Save your videos as MP4 files\n• **Settings** — Manage your profile, social accounts, and plan\n\nCould you rephrase your question or pick a topic above? I'll give you a detailed answer! 😊`,
    chips: ['create', 'schedule', 'analytics'],
  }
}

// ─── Bold + bullet text formatter ────────────────────────────────────────────
function FormatText({ text }) {
  return (
    <div className="space-y-1">
      {text.split('\n').map((line, i) => {
        if (!line) return <div key={i} className="h-1" />
        const renderBold = (str) => str.split(/\*\*(.+?)\*\*/g).map((p, j) =>
          j % 2 === 1 ? <strong key={j} className="font-semibold text-white">{p}</strong> : <span key={j}>{p}</span>
        )
        if (line.startsWith('• ')) {
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-brand-400 flex-shrink-0" />
              <span>{renderBold(line.slice(2))}</span>
            </div>
          )
        }
        return <div key={i}>{renderBold(line)}</div>
      })}
    </div>
  )
}

// ─── Typing dots ──────────────────────────────────────────────────────────────
function TypingBubble() {
  return (
    <div className="flex items-end gap-2.5 px-5">
      <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center border border-cyan-300/20 shadow-[0_8px_24px_rgba(139,92,246,0.24)]"
        style={{ background: 'linear-gradient(135deg,#7c3aed,#8b5cf6 55%,#22d3ee)' }}>
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-bl-sm border border-cyan-300/10 shadow-[0_10px_28px_rgba(0,0,0,0.24)]"
        style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.075),rgba(139,92,246,0.08))' }}>
        <div className="flex items-center gap-1.5">
          {[0, 160, 320].map(d => (
            <span key={d} className="w-2 h-2 rounded-full bg-cyan-300 animate-bounce"
              style={{ animationDelay: `${d}ms`, animationDuration: '0.9s' }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Suggestion chip ──────────────────────────────────────────────────────────
function Chip({ id, onSelect }) {
  const item = KB_MAP[id]
  if (!item) return null
  const Icon = item.icon
  return (
    <button
      onClick={() => onSelect(item)}
      className="group flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full text-[11px] font-medium
                 border border-white/10 bg-white/[0.045] text-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]
                 hover:border-cyan-300/30 hover:bg-cyan-300/[0.08] hover:text-white/95 hover:shadow-[0_8px_20px_rgba(139,92,246,0.12)]
                 transition-all duration-150 active:scale-95"
    >
      <Icon className="w-3 h-3 flex-shrink-0" style={{ color: item.color }} />
      {item.question}
    </button>
  )
}

// ─── Timestamp ────────────────────────────────────────────────────────────────
function Stamp({ date }) {
  const t = date instanceof Date ? date : new Date(date)
  return (
    <div className="text-[10px] text-white/20 mt-1 select-none">
      {t.getHours().toString().padStart(2, '0')}:{t.getMinutes().toString().padStart(2, '0')}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function HelpSupportChatbot({ userName, showFloatingButton = false }) {
  const makeGreeting = () => ({
    id: 0,
    role: 'bot',
    text: `Hi${userName ? ` ${userName}` : ''}! 👋 I'm your **SocialMind AI Assistant**.\n\nI know everything about this app — creating videos, scheduling posts, analytics, settings, and more.\n\nWhat would you like to know?`,
    chips: ['ai_how', 'create', 'schedule'],
    time: new Date(),
  })

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([makeGreeting()])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const timer = useRef(null)

  useEffect(() => {
    const h = () => setOpen(true)
    window.addEventListener('sm:open-help', h)
    return () => window.removeEventListener('sm:open-help', h)
  }, [])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      if (!isTyping) inputRef.current?.focus()
    }, 80)
    return () => clearTimeout(t)
  }, [open, messages, isTyping])

  useEffect(() => () => clearTimeout(timer.current), [])

  const deliver = useCallback((kb, delay = 700 + Math.random() * 500) => {
    setIsTyping(true)
    timer.current = setTimeout(() => {
      setIsTyping(false)
      setMessages(prev => {
        const cleared = prev.map(m => m.role === 'bot' ? { ...m, chips: [] } : m)
        return [...cleared, {
          id: Date.now(),
          role: 'bot',
          text: kb.answer,
          chips: kb.chips ?? [],
          isContact: kb.isContact,
          time: new Date(),
        }]
      })
    }, delay)
  }, [])

  const sendText = (text) => {
    const t = text.trim()
    if (!t || isTyping) return
    const kb = findAnswer(t)
    setMessages(prev => [
      ...prev.map(m => m.role === 'bot' ? { ...m, chips: [] } : m),
      { id: Date.now(), role: 'user', text: t, time: new Date() },
    ])
    setInput('')
    if (kb) deliver(kb)
  }

  const handleChip = (kb) => {
    if (isTyping) return
    setMessages(prev => [
      ...prev.map(m => m.role === 'bot' ? { ...m, chips: [] } : m),
      { id: Date.now(), role: 'user', text: kb.question, time: new Date() },
    ])
    deliver(kb)
  }

  const reset = () => {
    clearTimeout(timer.current)
    setIsTyping(false)
    setInput('')
    setMessages([makeGreeting()])
  }

  return (
    <>
      {showFloatingButton && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open support chat"
          title="Support chat"
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-[0_12px_34px_rgba(99,73,255,0.42)] transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-brand-400/70"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#8b5cf6 55%,#22d3ee)' }}
        >
          <Bot className="w-6 h-6" />
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full border-2 border-surface bg-emerald-400" />
        </button>
      )}

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-40 transition-all duration-300"
        style={{
          background: 'linear-gradient(90deg,rgba(3,7,18,0.58),rgba(15,15,26,0.42))',
          backdropFilter: open ? 'blur(4px)' : 'none',
          pointerEvents: open ? 'auto' : 'none',
          opacity: open ? 1 : 0,
        }}
      />

      {/* Side panel */}
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col transition-transform duration-300 ease-out"
        style={{
          width: 'min(420px, 100vw)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          background: 'linear-gradient(180deg,#11112a 0%,#0d1024 46%,#090917 100%)',
          borderLeft: '1px solid rgba(34,211,238,0.26)',
          boxShadow: open ? '-28px 0 90px rgba(0,0,0,0.68), -1px 0 0 rgba(139,92,246,0.16)' : 'none',
        }}
      >
        {/* Header */}
        <div
          className="relative flex items-center gap-3 px-5 py-4 flex-shrink-0 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg,rgba(139,92,246,0.42) 0%,rgba(34,211,238,0.24) 48%,rgba(139,92,246,0.14) 100%)',
            borderBottom: '1px solid rgba(34,211,238,0.2)',
            minHeight: 72,
          }}
        >
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent pointer-events-none" />

          <div className="relative flex-shrink-0">
            <div className="absolute inset-0 rounded-2xl blur-lg scale-110"
              style={{ background: 'rgba(139,92,246,0.24)' }} />
            <div className="relative w-11 h-11 rounded-2xl flex items-center justify-center border border-white/15 shadow-[0_10px_28px_rgba(139,92,246,0.38)]"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#8b5cf6 58%,#22d3ee)' }}>
              <Bot className="w-5 h-5 text-white" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2"
              style={{ borderColor: 'rgb(11,11,24)', boxShadow: '0 0 10px rgba(52,211,153,0.9)' }} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-bold text-white text-base tracking-wide leading-tight">SocialMind Support</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] text-emerald-300 font-medium">AI Assistant · Always Online</span>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={reset} title="Start over"
              className="w-8 h-8 flex items-center justify-center rounded-xl text-white/35 hover:text-white hover:bg-white/10 hover:border-cyan-300/20 border border-transparent transition-all">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <a href={`mailto:${SUPPORT_EMAIL}`} title="Email support"
              className="w-8 h-8 flex items-center justify-center rounded-xl text-white/35 hover:text-cyan-100 hover:bg-cyan-300/10 hover:border-cyan-300/20 border border-transparent transition-all">
              <Mail className="w-4 h-4" />
            </a>
            <button onClick={() => setOpen(false)} title="Close"
              className="w-8 h-8 flex items-center justify-center rounded-xl text-white/35 hover:text-white hover:bg-white/10 hover:border-white/10 border border-transparent transition-all ml-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Popular topics */}
        <div className="px-5 py-3 flex-shrink-0 border-b border-white/[0.07]"
          style={{ background: 'linear-gradient(180deg,rgba(255,255,255,0.035),rgba(139,92,246,0.035))' }}>
          <p className="text-[10px] text-cyan-100/55 uppercase tracking-widest font-semibold mb-2">Popular topics</p>
          <div className="flex flex-wrap gap-2">
            {['ai_how', 'create', 'schedule', 'ai_voice', 'analytics', 'contact'].map(id => (
              <Chip key={id} id={id} onSelect={handleChip} />
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-5 space-y-5"
          style={{ background: 'linear-gradient(180deg,rgba(255,255,255,0.01),rgba(139,92,246,0.025) 58%,rgba(34,211,238,0.025))' }}>
          {messages.map((msg, i) => {
            const isLast = i === messages.length - 1
            return (
              <div key={msg.id} className="px-5">
                <div className={`flex items-end gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'bot' && (
                    <div className="w-8 h-8 rounded-xl flex-shrink-0 mb-0.5 flex items-center justify-center border border-cyan-300/20 shadow-[0_8px_22px_rgba(139,92,246,0.26)]"
                      style={{ background: 'linear-gradient(135deg,#7c3aed,#8b5cf6 58%,#22d3ee)' }}>
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div className="max-w-[84%]">
                    <div
                      className={`rounded-2xl text-sm leading-relaxed
                        ${msg.role === 'user'
                          ? 'rounded-br-sm px-4 py-2.5 text-white font-medium'
                          : 'rounded-bl-sm px-4 py-3 text-white/85 border border-white/[0.08]'
                        }`}
                      style={msg.role === 'user'
                        ? { background: 'linear-gradient(135deg,#7c3aed,#8b5cf6 55%,#22d3ee)', boxShadow: '0 10px 28px rgba(139,92,246,0.34)' }
                        : { background: 'linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.035))', boxShadow: '0 10px 28px rgba(0,0,0,0.22)' }
                      }
                    >
                      {msg.role === 'bot' ? <FormatText text={msg.text} /> : msg.text}
                      {msg.isContact && (
                        <a href={`mailto:${SUPPORT_EMAIL}`}
                          className="mt-3 flex items-center gap-2 text-xs text-cyan-100 hover:text-white transition-colors font-medium">
                          <span className="flex items-center justify-center w-5 h-5 rounded-md"
                            style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.28)' }}>
                            <Mail className="w-3 h-3" />
                          </span>
                          {SUPPORT_EMAIL}
                        </a>
                      )}
                    </div>
                    <Stamp date={msg.time} />
                  </div>
                </div>

                {msg.role === 'bot' && isLast && msg.chips?.length > 0 && (
                  <div className="mt-3 ml-10 space-y-2">
                    <p className="text-[10px] text-cyan-100/45 uppercase tracking-widest font-semibold">You might also ask</p>
                    <div className="flex flex-wrap gap-2">
                      {msg.chips.map(id => <Chip key={id} id={id} onSelect={handleChip} />)}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {isTyping && <TypingBubble />}
          <div ref={bottomRef} />
        </div>

        {/* Email footer */}
        <div className="flex items-center justify-center gap-1.5 py-2 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(34,211,238,0.14)', background: 'rgba(255,255,255,0.018)' }}>
          <HelpCircle className="w-3 h-3 text-cyan-100/35" />
          <span className="text-[10px] text-white/30">Still need help?</span>
          <a href={`mailto:${SUPPORT_EMAIL}`}
            className="text-[10px] text-cyan-100/70 hover:text-white transition-colors underline underline-offset-2">
            {SUPPORT_EMAIL}
          </a>
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-2 flex-shrink-0"
          style={{ background: 'linear-gradient(180deg,rgba(13,16,36,0),rgba(9,9,23,0.92))' }}>
          <div
            className="flex items-center gap-2 rounded-2xl px-4 py-2.5 transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg,rgba(255,255,255,0.08),rgba(139,92,246,0.06))',
              border: input ? '1px solid rgba(139,92,246,0.38)' : '1px solid rgba(255,255,255,0.1)',
              boxShadow: input ? '0 0 0 2px rgba(139,92,246,0.18), 0 12px 30px rgba(0,0,0,0.26)' : '0 8px 24px rgba(0,0,0,0.18)',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendText(input)}
              placeholder={isTyping ? 'Typing…' : 'Ask me anything about SocialMind…'}
              disabled={isTyping}
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/20 focus:outline-none disabled:opacity-40"
            />
            <button
              onClick={() => sendText(input)}
              disabled={!input.trim() || isTyping}
              aria-label="Send"
              className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 disabled:opacity-25"
              style={{
                background: input.trim() && !isTyping ? 'linear-gradient(135deg,#7c3aed,#8b5cf6 55%,#22d3ee)' : 'rgba(255,255,255,0.08)',
                boxShadow: input.trim() && !isTyping ? '0 8px 18px rgba(139,92,246,0.24)' : 'none',
              }}
            >
              <Send className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
