import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Chrome, Eye, EyeOff, Loader2, ShieldCheck, Sparkles, X } from 'lucide-react'

import toast from 'react-hot-toast'
import axios from 'axios'

import { authApi, socialAccountsApi } from '@/api/client'
import { useAuthStore } from '@/store/auth'
import { smSavePwd, smVerifyPwd } from '@/utils/pwdHash'

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim())
}

function PasswordField({ value, onChange, placeholder, autoFocus }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="input pr-11"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition"
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

function PasswordStrength({ password }) {
  if (!password) return null
  const checks = [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'Uppercase letter (A–Z)', ok: /[A-Z]/.test(password) },
    { label: 'Lowercase letter (a–z)', ok: /[a-z]/.test(password) },
    { label: 'Number (0–9)', ok: /\d/.test(password) },
    { label: 'Special character (!@#$…)', ok: /[^A-Za-z0-9]/.test(password) },
  ]
  const score = checks.filter(c => c.ok).length
  const bar = score <= 1 ? 'bg-red-500' : score <= 2 ? 'bg-orange-500' : score === 3 ? 'bg-amber-500' : score === 4 ? 'bg-blue-500' : 'bg-emerald-500'
  const label = score <= 1 ? 'Weak' : score <= 2 ? 'Fair' : score === 3 ? 'Good' : score === 4 ? 'Strong' : 'Very strong'
  const lc = score <= 1 ? 'text-red-400' : score <= 2 ? 'text-orange-400' : score === 3 ? 'text-amber-400' : score === 4 ? 'text-blue-400' : 'text-emerald-400'
  return (
    <div className="mt-3 space-y-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-3">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= score ? bar : 'bg-white/10'}`} />
          ))}
        </div>
        <span className={`text-[11px] font-bold ${lc}`}>{label}</span>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {checks.map(c => (
          <div key={c.label} className={`flex items-center gap-1.5 text-[11px] transition-colors ${c.ok ? 'text-emerald-400' : 'text-white/30'}`}>
            <CheckCircle2 className={`w-3 h-3 flex-shrink-0 ${c.ok ? 'text-emerald-400' : 'text-white/15'}`} />
            {c.label}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function EmailOtpAuth({
  mode = 'login',
  prefillEmail = '',
  variant = 'embedded',
  open = true,
  onClose,
  onComplete,
}) {
  const completeAuth = useAuthStore(state => state.completeAuth)
  const googlePopupRef = useRef(null)

  // ── Navigation ───────────────────────────────────────────────────────────────
  // tab: 'login' | 'signup'
  // stage: 'main' | 'signup_otp' | 'forgot_send' | 'forgot_otp' | 'forgot_set' | 'google_password'
  const [tab, setTab] = useState(mode === 'register' ? 'signup' : 'login')
  const [stage, setStage] = useState('main')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // ── Login states ─────────────────────────────────────────────────────────────
  const [loginStep, setLoginStep] = useState('email') // 'email' | 'password'
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPwd, setLoginPwd] = useState('')
  const [loginEmailCheck, setLoginEmailCheck] = useState(null)

  // ── Signup states ────────────────────────────────────────────────────────────
  const [signupUsername, setSignupUsername] = useState('')
  useEffect(() => { setTimeout(() => setSignupUsername(''), 100) }, [])
  const [signupEmail, setSignupEmail] = useState('')
  const [signupEmailCheck, setSignupEmailCheck] = useState(null)
  const [signupPwd, setSignupPwd] = useState('')
  const [signupPwdConfirm, setSignupPwdConfirm] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [usernameChecking, setUsernameChecking] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState(null) // null | true | false
  const [usernameError, setUsernameError] = useState('')

  // ── OTP (signup verification) ─────────────────────────────────────────────
  const [challenge, setChallenge] = useState(null)
  const [otp, setOtp] = useState('')

  // ── Forgot password ───────────────────────────────────────────────────────────
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotChallenge, setForgotChallenge] = useState(null)
  const [forgotOtp, setForgotOtp] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [newPwdConfirm, setNewPwdConfirm] = useState('')

  // ── OAuth password gate (Google / Facebook) ───────────────────────────────────
  const [oauthProvider, setOauthProvider] = useState('google') // 'google' | 'facebook'
  const [googleAuthPending, setGoogleAuthPending] = useState(null)
  const [googleEmail, setGoogleEmail] = useState('')
  const [googleAccPwd, setGoogleAccPwd] = useState('')
  const [googleAccPwdConfirm, setGoogleAccPwdConfirm] = useState('')
  const [googlePasswordMode, setGooglePasswordMode] = useState('set')
  const [googleUsername, setGoogleUsername] = useState('')
  const [googleUsernameChecking, setGoogleUsernameChecking] = useState(false)
  const [googleUsernameError, setGoogleUsernameError] = useState('')
  const [googleUsernameOk, setGoogleUsernameOk] = useState(false)

  useEffect(() => { if (!open) resetAll() }, [open])

  // If prefillEmail provided (Google OAuth new user), pre-fill signup email and switch to signup tab
  useEffect(() => {
    if (prefillEmail) {
      setSignupEmail(prefillEmail.trim().toLowerCase())
      setSignupUsername('') // never pre-fill username from email
      setTab('signup')
    }
  }, [prefillEmail])
  useEffect(() => {
  setTimeout(() => {
    const pending = sessionStorage.getItem('__sm_google_pending__')
    if (pending) {
      sessionStorage.removeItem('__sm_google_pending__')
      try {
        const parsed = JSON.parse(pending)
        openGooglePasswordGate({ 
          type: 'socialmind-google-auth', 
          access: parsed.access, 
          refresh: parsed.refresh,
          user: parsed.user
        })
      } catch {}
    }
  }, 100)
}, [])

  const resetAll = () => {
    if (googlePopupRef.current && !googlePopupRef.current.closed) googlePopupRef.current.close()
    googlePopupRef.current = null
    setOauthProvider('google')
    setTab(mode === 'register' ? 'signup' : 'login')
    setStage('main')
    setLoading(false)
    setError('')
    setLoginEmail('')
    setLoginPwd('')
    setLoginEmailCheck(null)
    setSignupUsername('')
    setSignupEmail('')
    setSignupEmailCheck(null)
    setSignupPwd('')
    setSignupPwdConfirm('')
    setTermsAccepted(false)
    setUsernameChecking(false)
    setUsernameAvailable(null)
    setUsernameError('')
    setChallenge(null)
    setOtp('')
    setForgotEmail('')
    setForgotChallenge(null)
    setForgotOtp('')
    setNewPwd('')
    setNewPwdConfirm('')
    setGoogleAuthPending(null)
    setGoogleEmail('')
    setGoogleAccPwd('')
    setGoogleAccPwdConfirm('')
    setGooglePasswordMode('set')
    setGoogleUsername('')
    setGoogleUsernameChecking(false)
    setGoogleUsernameError('')
    setGoogleUsernameOk(false)
  }

  const switchTab = (newTab) => { setTab(newTab); setStage('main'); setError(''); setLoginStep('email'); setLoginEmailCheck(null) }
  const close = () => { if (onClose) onClose() }

  // ── Google OAuth listeners ────────────────────────────────────────────────────
  const openGooglePasswordGate = (data, provider = 'google') => {
    if (googlePopupRef.current && !googlePopupRef.current.closed) googlePopupRef.current.close()
    googlePopupRef.current = null
    setOauthProvider(provider)
    const userEmail = data.user?.email || ''
    const hasPassword = data.user?.has_password === true || localStorage.getItem(`sm_google_has_pwd_${userEmail}`) === '1'
    setGoogleAuthPending(data)
    setGoogleEmail(userEmail)
    setGooglePasswordMode(hasPassword ? 'enter' : 'set')
    setGoogleAccPwd('')
    setGoogleAccPwdConfirm('')
    setGoogleUsername('')
    setGoogleUsernameOk(false)
    setError('')
    setStage('google_password')
    toast.success(hasPassword
      ? 'Google verified. Enter your password to continue.'
      : 'Google verified. Create a password to secure your account.')
  }

  useEffect(() => {
    const handle = (event) => {
      const data = event.data
      if (!data || data.type !== 'socialmind-google-auth') return
      if (!data.access || !data.refresh || !data.user) return
      openGooglePasswordGate(data, 'google')
    }
    window.addEventListener('message', handle)
    return () => window.removeEventListener('message', handle)
  }, [])

  useEffect(() => {
    const handle = (event) => {
      if (event.key !== '__sm_google_auth__') return
      try {
        const data = JSON.parse(event.newValue)
        if (!data || data.type !== 'socialmind-google-auth') return
        if (!data.access || !data.refresh || !data.user) return
        localStorage.removeItem(event.key)
        openGooglePasswordGate(data, 'google')
      } catch {}
    }
    window.addEventListener('storage', handle)
    return () => window.removeEventListener('storage', handle)
  }, [])

  const openGooglePopup = () => {
    socialAccountsApi.googleAuthStart()
      .then(({ data }) => {
        if (!data?.auth_url) throw new Error('No auth URL')
        window.location.href = data.auth_url
      })
      .catch(err => {
        toast.error(err.response?.data?.error || err.message || 'Failed to start Google sign-in.')
      })
  }



  // ── Handlers ─────────────────────────────────────────────────────────────────

  const checkLoginIdentifierExists = async () => {
    const identifier = loginEmail.trim()
    if (!identifier) return null
    setLoginEmailCheck({ checking: true })
    try {
      if (isValidEmail(identifier)) {
        const { data } = await authApi.checkEmail(identifier.toLowerCase())
        const next = { checking: false, kind: 'email', ...data }
        setLoginEmailCheck(next)
        return next
      }

      const { data } = await authApi.checkUsername(identifier)
      const next = { checking: false, kind: 'username', exists: data.taken === true || data.exists === true || data.available === false }
      setLoginEmailCheck(next)
      return next
    } catch {
      const next = { checking: false, exists: false, deliverable: false, reason: 'Could not check this account. Try again.' }
      setLoginEmailCheck(next)
      return next
    }
  }

  const checkSignupEmailAvailability = async () => {
    const email = signupEmail.trim().toLowerCase()
    if (!isValidEmail(email)) return null
    setSignupEmailCheck({ checking: true })
    try {
      const { data } = await authApi.checkEmail(email)
      const next = { checking: false, ...data }
      setSignupEmailCheck(next)
      return next
    } catch {
      const next = { checking: false, exists: false, deliverable: false, reason: 'Could not check this email. Try again.' }
      setSignupEmailCheck(next)
      return next
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    if (!loginEmail.trim()) { setError('Enter your email or username.'); return }
    if (!loginPwd) { setError('Enter your password.'); return }
    setLoading(true)
    try {
      const accountCheck = loginEmailCheck?.exists === true ? loginEmailCheck : await checkLoginIdentifierExists()
      if (!accountCheck?.exists) {
        setError('')
        setLoading(false)
        return
      }
      const { data } = await authApi.loginWithPassword(loginEmail.trim(), loginPwd)
      completeAuth(data)
      if (onComplete) onComplete(data)
      toast.success('Signed in successfully.')
      close()
    } catch (err) {
      const detail = err.response?.data?.detail || ''
      setError(detail || 'Wrong email or password. Please try again.')
    } finally { setLoading(false) }
  }

  const checkUsernameAvail = async (uname) => {
    if (!uname || uname.length < 3) return
    setUsernameChecking(true)
    try {
      const { data } = await authApi.checkUsername(uname.trim())
      if (data.taken === true || data.available === false || data.exists === true) {
        setUsernameError('This username is already taken.')
        setUsernameAvailable(false)
      } else {
        setUsernameAvailable(true)
        setUsernameError('')
      }
    } catch { setUsernameError('') }
    finally { setUsernameChecking(false) }
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    setError('')
    if (!signupUsername.trim() || signupUsername.length < 3) { setError('Username must be at least 3 characters.'); return }
    if (usernameAvailable === false) { setError(usernameError || 'Choose a different username.'); return }
    if (!isValidEmail(signupEmail)) { setError('Enter a valid email address.'); return }
    const emailCheck = signupEmailCheck?.exists === true ? signupEmailCheck : await checkSignupEmailAvailability()
    if (emailCheck?.exists) {
      setError('You already have an account. Please login with your password.')
      return
    }
    if (emailCheck && emailCheck.deliverable === false) {
      setError(emailCheck.reason || 'Enter a real, reachable email address.')
      return
    }
    if (signupPwd.length < 8 || !/[A-Z]/.test(signupPwd) || !/\d/.test(signupPwd)) {
      setError('Password must be 8+ chars with uppercase and a number.'); return
    }
    if (signupPwd !== signupPwdConfirm) { setError('Passwords do not match.'); return }
    if (!termsAccepted) { setError('Please accept the Terms and Privacy Policy to create an account.'); return }
    setLoading(true)
    try {
  const { data } = await authApi.register({
    username: signupUsername.trim(),
    email: signupEmail.trim().toLowerCase(),
    password: signupPwd,
    password_confirm: signupPwdConfirm,
  })
  completeAuth(data)
  if (onComplete) onComplete(data)
  toast.success('Account created! Welcome to SocialMind.')
  close()
} catch (err) {
  const detail = err.response?.data?.detail || err.response?.data?.email?.[0] || err.response?.data?.error || ''
  if (detail.toLowerCase().includes('already') || detail.toLowerCase().includes('exist')) {
    setError('Email already registered. Sign in instead.')
  } else {
    setError(detail || 'Could not create account. Please try again.')
  }
}
}

  const handleVerifySignupOtp = async (e) => {
    e.preventDefault()
    if (!challenge?.challenge_token || otp.length < 6 || loading) return
    setLoading(true)
    setError('')
    try {
      const payload = {
        challenge_token: challenge.challenge_token,
        otp,
        ...(signupPwd && { password: signupPwd }),
        ...(signupUsername && { username: signupUsername }),
      }
      const { data } = await authApi.verifyRegisterOtp(payload)
      completeAuth(data)
      if (onComplete) onComplete(data)
      toast.success('Account created! Welcome to SocialMind.')
      close()
    } catch (err) {
      setError(err.response?.data?.detail || 'Incorrect verification code.')
    } finally { setLoading(false) }
  }

  const handleForgotSend = async (e) => {
    e.preventDefault()
    setError('')
    if (!isValidEmail(forgotEmail)) { setError('Enter a valid email address.'); return }
    setLoading(true)
    try {
      const { data } = await authApi.passwordResetStart(forgotEmail.trim().toLowerCase())
      setForgotChallenge(data)
      setForgotOtp('')
      setStage('forgot_otp')
      toast.success('Reset code sent to your email.')
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not send reset code.')
    } finally { setLoading(false) }
  }

  const handleForgotOtp = (e) => {
    e.preventDefault()
    if (forgotOtp.length === 6) setStage('forgot_set')
  }

  const handleForgotSet = async (e) => {
    e.preventDefault()
    if (newPwd !== newPwdConfirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    setError('')
    try {
      const { data } = await authApi.passwordResetConfirm({
        challenge_token: forgotChallenge.challenge_token,
        otp: forgotOtp,
        new_password: newPwd,
      })
      completeAuth(data)
      if (onComplete) onComplete(data)
      toast.success('Password reset. You are now signed in.')
      close()
    } catch (err) {
      setError(err.response?.data?.detail || 'Reset failed. Please try again.')
      setStage('forgot_otp')
    } finally { setLoading(false) }
  }

  const generateStrongPassword = () => {
    const u = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', l = 'abcdefghijklmnopqrstuvwxyz'
    const d = '0123456789', s = '!@#$%^&*', all = u + l + d + s
    const rand = set => set[Math.floor(Math.random() * set.length)]
    let pwd = rand(u) + rand(l) + rand(d) + rand(s)
    for (let i = 0; i < 8; i++) pwd += rand(all)
    return pwd.split('').sort(() => Math.random() - 0.5).join('')
  }

  const handleGooglePassword = async (e) => {
    e.preventDefault()
    if (loading || !googleAuthPending) return
    setError('')
    if (googlePasswordMode === 'set') {
      if (googleAccPwd.length < 8) { setError('Password must be at least 8 characters.'); return }
      if (!/[A-Z]/.test(googleAccPwd)) { setError('Add at least one uppercase letter.'); return }
      if (!/\d/.test(googleAccPwd)) { setError('Add at least one number.'); return }
      if (googleAccPwd !== googleAccPwdConfirm) { setError('Passwords do not match.'); return }
    } else {
      if (!googleAccPwd) { setError('Enter your password.'); return }
    }
    setLoading(true)
    try {
      if (googlePasswordMode === 'set') {
        await smSavePwd(googleEmail, googleAccPwd)
        localStorage.setItem(`sm_google_has_pwd_${googleEmail}`, '1')
        const h = { Authorization: `Bearer ${googleAuthPending.access}`, 'Content-Type': 'application/json' }
        await axios.patch('/api/v1/auth/profile/', { password: googleAccPwd }, { headers: h })
          .catch(() => axios.patch('/api/v1/auth/profile/', { new_password: googleAccPwd }, { headers: h }).catch(() => null))
        if (googleUsername.trim()) {
          await axios.patch('/api/v1/auth/profile/', { username: googleUsername.trim() }, { headers: h }).catch(() => null)
        }
        completeAuth(googleAuthPending)
        if (onComplete) onComplete(googleAuthPending)
        toast.success('Password saved. Welcome to SocialMind!')
        close()
      } else {
        const localOk = await smVerifyPwd(googleEmail, googleAccPwd)
        if (localOk) {
          completeAuth(googleAuthPending)
          if (onComplete) onComplete(googleAuthPending)
          toast.success('Authentication complete.')
          close()
          return
        }
        try {
          const { data: ld } = await authApi.loginWithPassword(googleEmail, googleAccPwd)
          await smSavePwd(googleEmail, googleAccPwd)
          completeAuth(ld)
          if (onComplete) onComplete(ld)
          toast.success('Authentication complete.')
          close()
        } catch {
          setGooglePasswordMode('set')
          setGoogleAccPwd('')
          setGoogleAccPwdConfirm('')
          setGoogleUsername('')
          setGoogleUsernameOk(false)
          setError('Password not recognised. Create a new password below.')
        }
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally { setLoading(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  const wrapperClass = variant === 'modal'
    ? 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm'
    : 'w-full'
  const cardClass = variant === 'modal'
    ? 'relative w-full max-w-md rounded-3xl border border-white/[0.08] bg-surface shadow-[0_32px_90px_rgba(0,0,0,0.55)] overflow-hidden'
    : 'w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-8 shadow-[0_32px_72px_rgba(0,0,0,0.45)]'

  if (variant === 'modal' && !open) return null

  const GoogleBtn = () => (
    <button type="button" onClick={openGooglePopup}
      className="w-full inline-flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-white text-[#111827] px-4 py-3 font-semibold transition hover:bg-white/95">
      <Chrome className="h-5 w-5 text-[#4285F4]" />
      Continue with Google
    </button>
  )


  const Divider = () => (
    <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.22em] text-white/25 my-4">
      <span className="h-px flex-1 bg-white/10" />or<span className="h-px flex-1 bg-white/10" />
    </div>
  )

  return (
    <div className={wrapperClass}>
      <div className={cardClass}>
        {variant === 'modal' && (
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-sky-400 to-emerald-400" />
        )}
        {variant === 'modal' && (
          <button type="button" onClick={close}
            className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/[0.04] p-2 text-white/50 transition hover:text-white hover:bg-white/[0.08]">
            <X className="h-4 w-4" />
          </button>
        )}

        <div className={variant === 'modal' ? 'p-8 pt-10' : ''}>

          {/* ── Main: Login / Signup tabs ── */}
          {stage === 'main' && (
            <>
              {/* Tab switcher */}
              <div className="flex rounded-xl border border-white/[0.08] bg-white/[0.03] p-1 mb-6">
                {[{ id: 'login', label: 'Log In' }, { id: 'signup', label: 'Sign Up' }].map(t => (
                  <button key={t.id} type="button" onClick={() => switchTab(t.id)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
                      tab === t.id ? 'bg-brand-600 text-white shadow-sm' : 'text-white/40 hover:text-white/70'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <GoogleBtn />
              </div>
              <Divider />

              {/* ── Log In form ── */}
              {tab === 'login' && (
                <div className="space-y-4">
                  {/* ── Step 1: Email entry ── */}
                  {loginStep === 'email' && (
                    <form onSubmit={async (e) => {
                      e.preventDefault()
                      setError('')
                      if (!loginEmail.trim()) { setError('Enter your email or username.'); return }
                      setLoading(true)
                      const result = await checkLoginIdentifierExists()
                      setLoading(false)
                      if (result?.exists) {
                        setLoginStep('password')
                      } else {
                        // No account found — switch to signup and pre-fill email
                        if (isValidEmail(loginEmail.trim())) {
                          setSignupEmail(loginEmail.trim().toLowerCase())
                        }
                        switchTab('signup')
                        setError('')
                        toast('No account found. Please sign up to continue.')
                      }
                    }} className="space-y-4">
                      <div>
                        <label className="label">Email or username</label>
                        <div className="relative">
                          <input
                            type="text"
                            className={`input pr-10 ${loginEmailCheck && !loginEmailCheck.checking && !loginEmailCheck.exists ? 'border-red-500/50' : loginEmailCheck?.exists ? 'border-emerald-500/50' : error ? 'border-red-500/50' : ''}`}
                            placeholder="you@company.com or username"
                            value={loginEmail}
                            autoFocus
                            onChange={e => { setLoginEmail(e.target.value); setLoginEmailCheck(null); setError('') }}
                            required
                          />
                          {loginEmailCheck?.checking && <Loader2 className="w-4 h-4 text-white/35 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />}
                          {loginEmailCheck?.exists && <CheckCircle2 className="w-4 h-4 text-emerald-400 absolute right-3 top-1/2 -translate-y-1/2" />}
                        </div>
                        {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
                      </div>
                      <button type="submit" disabled={loading}
                        className="btn-primary w-full h-12 flex items-center justify-center gap-2 disabled:opacity-60">
                        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking…</> : 'Continue'}
                      </button>
                      <p className="text-center text-xs text-white/30">
                        Don't have an account?{' '}
                        <button type="button" onClick={() => switchTab('signup')}
                          className="text-brand-400 hover:text-brand-300 transition font-medium">
                          Sign up free
                        </button>
                      </p>
                    </form>
                  )}

                  {/* ── Step 2: Password entry (account confirmed to exist) ── */}
                  {loginStep === 'password' && (
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm text-white/80">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          <span className="truncate">{loginEmail}</span>
                        </div>
                        <button type="button"
                          onClick={() => { setLoginStep('email'); setLoginPwd(''); setLoginEmailCheck(null); setError('') }}
                          className="text-xs text-brand-400 hover:text-brand-300 transition flex-shrink-0">
                          Change
                        </button>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="label">Password</label>
                          <button type="button"
                            onClick={() => { setForgotEmail(isValidEmail(loginEmail) ? loginEmail : ''); setStage('forgot_send'); setError('') }}
                            className="text-[11px] text-brand-400 hover:text-brand-300 transition">
                            Forgot password?
                          </button>
                        </div>
                        <PasswordField value={loginPwd}
                          onChange={e => { setLoginPwd(e.target.value); setError('') }}
                          placeholder="Enter your password"
                          autoFocus />
                      </div>
                      {error && <p className="text-xs text-red-400">{error}</p>}
                      <button type="submit" disabled={loading}
                        className="btn-primary w-full h-12 flex items-center justify-center gap-2 disabled:opacity-60">
                        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : 'Sign In'}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* ── Sign Up form ── */}
              {tab === 'signup' && (
                <form onSubmit={handleSignup} className="space-y-4" autoComplete="off">
                  <div>
                    <label className="label">Username</label>
                    <input type="text"
                      className={`input ${usernameAvailable === false ? 'border-red-500/50' : usernameAvailable === true ? 'border-emerald-500/50' : ''}`}
                      placeholder="Choose a username" value={signupUsername} autoComplete="new-password"
                      onChange={e => {
                        const v = e.target.value.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 30)
                        setSignupUsername(v)
                        setUsernameAvailable(null)
                        setUsernameError('')
                      }}
                      onBlur={() => checkUsernameAvail(signupUsername)}
                    />
                    {usernameChecking && <p className="mt-1.5 text-xs text-white/40">Checking availability…</p>}
                    {usernameError && <p className="mt-1.5 text-xs text-red-400">{usernameError}</p>}
                    {usernameAvailable === true && (
                      <p className="mt-1.5 text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Username available
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-white/25">Letters, numbers, _ . - only · Min 3 chars</p>
                  </div>
                  <div>
                    <label className="label">Email address</label>
                    <div className="relative">
                      <input type="email" className={`input pr-10 ${signupEmailCheck?.exists ? 'border-red-500/50' : signupEmailCheck?.deliverable && !signupEmailCheck.exists ? 'border-emerald-500/50' : ''}`} placeholder="you@company.com" value={signupEmail}
                        onChange={e => { setSignupEmail(e.target.value); setSignupEmailCheck(null); setError('') }}
                        onBlur={checkSignupEmailAvailability}
                        required />
                      {signupEmailCheck?.checking && <Loader2 className="w-4 h-4 text-white/35 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />}
                      {signupEmailCheck?.deliverable && !signupEmailCheck.exists && <CheckCircle2 className="w-4 h-4 text-emerald-400 absolute right-3 top-1/2 -translate-y-1/2" />}
                    </div>
                    {signupEmailCheck?.exists && (
                      <p className="mt-1.5 text-xs text-amber-400 flex items-center gap-1">
                        This email is already registered.{' '}
                        <button type="button" onClick={() => { switchTab('login'); setLoginEmail(signupEmail) }}
                          className="text-brand-400 hover:underline font-semibold">Log in instead →</button>
                      </p>
                    )}
                    {signupEmailCheck && !signupEmailCheck.checking && signupEmailCheck.deliverable === false && (
                      <p className="mt-1.5 text-xs text-red-400">{signupEmailCheck.reason || 'Enter a real, reachable email address.'}</p>
                    )}
                    {signupEmailCheck?.deliverable && !signupEmailCheck.exists && (
                      <p className="mt-1.5 text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Email available
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="label">Password</label>
                      <button type="button"
                        onClick={() => { const s = generateStrongPassword(); setSignupPwd(s); setSignupPwdConfirm(s) }}
                        className="flex items-center gap-1 text-[11px] text-brand-400 hover:text-brand-300 transition">
                        <Sparkles className="w-3 h-3" /> Suggest password
                      </button>
                    </div>
                    <PasswordField value={signupPwd}
                      onChange={e => { setSignupPwd(e.target.value); setError('') }}
                      placeholder="Min. 8 characters" />
                    <PasswordStrength password={signupPwd} />
                  </div>
                  <div>
                    <label className="label">Confirm password</label>
                    <PasswordField value={signupPwdConfirm}
                      onChange={e => { setSignupPwdConfirm(e.target.value); setError('') }}
                      placeholder="Repeat your password" />
                    {signupPwd && signupPwdConfirm && signupPwd === signupPwdConfirm && (
                      <p className="mt-1.5 text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Passwords match
                      </p>
                    )}
                    {signupPwd && signupPwdConfirm && signupPwd !== signupPwdConfirm && (
                      <p className="mt-1.5 text-xs text-red-400">Passwords do not match</p>
                    )}
                  </div>
                                    <label className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-xs leading-relaxed text-white/45">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={e => { setTermsAccepted(e.target.checked); setError('') }}
                      className="mt-0.5 h-4 w-4 rounded border-white/20 bg-transparent accent-brand-500"
                    />
                    <span>
                      I have read and agree to SocialMind's{' '}
                      <Link to="/terms" className="font-semibold text-brand-300 hover:text-brand-200">
                        Terms and Conditions
                      </Link>{' '}
                      and{' '}
                      <Link to="/privacy" className="font-semibold text-brand-300 hover:text-brand-200">
                        Privacy Policy
                      </Link>
                      .
                    </span>
                  </label>                  {error && (
                    <p className="text-xs text-red-400">
                      {error}
                      {error.includes('Sign in') && (
                        <button type="button" onClick={() => switchTab('login')}
                          className="ml-1 text-brand-400 hover:underline">Sign in</button>
                      )}
                    </p>
                  )}
                  <button type="submit"
                    disabled={
                      loading ||
                      !signupUsername || signupUsername.length < 3 ||
                      usernameAvailable === false ||
                      signupEmailCheck?.exists === true ||
                      signupEmailCheck?.deliverable === false ||
                      signupPwd.length < 8 ||
                      !/[A-Z]/.test(signupPwd) ||
                      !/\d/.test(signupPwd) ||
                      signupPwd !== signupPwdConfirm ||
                      !termsAccepted
                    }
                    className="btn-primary w-full h-12 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating account…</> : 'Create Account'}
                  </button>
                  <p className="text-center text-xs text-white/30">
                    Already have an account?{' '}
                    <button type="button" onClick={() => switchTab('login')}
                      className="text-brand-400 hover:text-brand-300 transition font-medium">
                      Sign in
                    </button>
                  </p>
                </form>
              )}
            </>
          )}

          {/* ── Signup OTP verification ── */}
          {stage === 'signup_otp' && (
            <form onSubmit={handleVerifySignupOtp} className="space-y-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-brand-400/80 mb-3">
                <ShieldCheck className="w-4 h-4" />
                Verify Your Email
              </div>
              <h2 className="text-2xl font-bold text-white mb-1.5">Check your inbox</h2>
              <div className="rounded-2xl border border-brand-500/20 bg-brand-500/10 px-4 py-3 text-sm text-white/80">
                A 6-digit code was sent to <span className="text-white font-medium">{signupEmail}</span>
              </div>
              <div>
                <label className="label">Verification code</label>
                <input type="text" inputMode="numeric" maxLength={6}
                  className="input text-center tracking-[0.45em] text-lg"
                  placeholder="000000" value={otp} autoFocus
                  onChange={e => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }} required />
                {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
                <p className="mt-1.5 text-xs text-white/35">Check your spam folder if it doesn't arrive.</p>
              </div>
              <button type="submit" disabled={loading || otp.length !== 6}
                className="btn-primary w-full h-12 flex items-center justify-center gap-2 disabled:opacity-50">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Verifying…' : 'Verify & Create Account'}
              </button>
              <button type="button" onClick={() => { setStage('main'); setOtp(''); setError('') }}
                className="btn-ghost w-full h-12">
                Back
              </button>
            </form>
          )}

          {/* ── Forgot password: send OTP ── */}
          {stage === 'forgot_send' && (
            <form onSubmit={handleForgotSend} className="space-y-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-brand-400/80 mb-3">
                <ShieldCheck className="w-4 h-4" /> Reset Password
              </div>
              <h2 className="text-2xl font-bold text-white mb-1.5">Forgot your password?</h2>
              <p className="text-white/40 text-sm mb-4">We'll send a 6-digit reset code to your email.</p>
              <div>
                <label className="label">Email address</label>
                <input type="email" className="input" value={forgotEmail} autoFocus
                  onChange={e => { setForgotEmail(e.target.value); setError('') }} required />
                {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
              </div>
              <button type="submit" disabled={loading}
                className="btn-primary w-full h-12 flex items-center justify-center gap-2 disabled:opacity-50">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Sending…' : 'Send reset code'}
              </button>
              <button type="button" onClick={() => { setStage('main'); setError('') }}
                className="btn-ghost w-full h-12">Back</button>
            </form>
          )}

          {/* ── Forgot password: enter OTP ── */}
          {stage === 'forgot_otp' && (
            <form onSubmit={handleForgotOtp} className="space-y-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-brand-400/80 mb-3">
                <ShieldCheck className="w-4 h-4" /> Reset Password
              </div>
              <h2 className="text-2xl font-bold text-white mb-1.5">Enter reset code</h2>
              <div className="rounded-2xl border border-brand-500/20 bg-brand-500/10 px-4 py-3 text-sm text-white/80">
                Code sent to <span className="text-white font-medium">{forgotEmail}</span>
              </div>
              <div>
                <label className="label">6-digit code</label>
                <input type="text" inputMode="numeric" maxLength={6}
                  className="input text-center tracking-[0.45em] text-lg"
                  placeholder="000000" value={forgotOtp} autoFocus
                  onChange={e => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} required />
                <p className="mt-1.5 text-xs text-white/35">Check your spam folder if it doesn't arrive.</p>
              </div>
              <button type="submit" disabled={forgotOtp.length !== 6}
                className="btn-primary w-full h-12 flex items-center justify-center gap-2 disabled:opacity-50">
                Continue
              </button>
              <button type="button" onClick={() => setStage('forgot_send')}
                className="btn-ghost w-full h-12">Resend code</button>
            </form>
          )}

          {/* ── Forgot password: set new password ── */}
          {stage === 'forgot_set' && (
            <form onSubmit={handleForgotSet} className="space-y-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-brand-400/80 mb-3">
                <ShieldCheck className="w-4 h-4" /> Reset Password
              </div>
              <h2 className="text-2xl font-bold text-white mb-1.5">Set a new password</h2>
              <div>
                <label className="label">New password</label>
                <PasswordField value={newPwd} onChange={e => { setNewPwd(e.target.value); setError('') }}
                  placeholder="Min. 8 characters" autoFocus />
                <PasswordStrength password={newPwd} />
              </div>
              <div>
                <label className="label">Confirm new password</label>
                <PasswordField value={newPwdConfirm} onChange={e => setNewPwdConfirm(e.target.value)}
                  placeholder="Repeat password" />
                {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
                {newPwd && newPwdConfirm && newPwd === newPwdConfirm && (
                  <p className="mt-1.5 text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Passwords match
                  </p>
                )}
                {newPwd && newPwdConfirm && newPwd !== newPwdConfirm && (
                  <p className="mt-1.5 text-xs text-red-400">Passwords do not match</p>
                )}
              </div>
              <button type="submit"
                disabled={loading || newPwd.length < 8 || newPwd !== newPwdConfirm || !/[A-Z]/.test(newPwd) || !/\d/.test(newPwd)}
                className="btn-primary w-full h-12 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Saving…' : 'Reset password & sign in'}
              </button>
            </form>
          )}

          {/* ── Google OAuth → password gate ── */}
          {stage === 'google_password' && (
            <>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-brand-400/80 mb-3">
                <ShieldCheck className="w-4 h-4" />
                {googlePasswordMode === 'set' ? 'Protect Your Account' : 'Verify Your Identity'}
              </div>
              <h2 className="text-2xl font-bold text-white mb-1.5">
                {googlePasswordMode === 'set' ? 'Set your password' : 'Enter your password'}
              </h2>
              <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 mb-4">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-[#4285F4]/20">
                  <Chrome className="w-3.5 h-3.5 text-[#4285F4]" />
                </div>
                <span className="text-white/60 text-sm truncate">{googleEmail}</span>
                <span className="ml-auto text-[10px] text-emerald-400 font-semibold">
                  Google verified
                </span>
              </div>
              {googlePasswordMode === 'set' && (
                <p className="text-white/40 text-sm mb-5">
                  Create a password so you can also sign in with email. This secures your account.
                </p>
              )}

              <form onSubmit={handleGooglePassword} className="space-y-4">
                {googlePasswordMode === 'set' && (
                  <div>
                    <label className="label">Username</label>
                    <input type="text"
                      className={`input ${googleUsernameError ? 'border-red-500/50' : googleUsernameOk ? 'border-emerald-500/50' : ''}`}
                      placeholder="Choose a username" value={googleUsername} autoComplete="new-password"
                      onChange={e => {
                        const v = e.target.value.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 30)
                        setGoogleUsername(v); setGoogleUsernameOk(false); setGoogleUsernameError('')
                      }}
                      onBlur={async () => {
                        if (!googleUsername.trim() || googleUsername.length < 3) return
                        setGoogleUsernameChecking(true)
                        try {
                          const { data } = await authApi.checkUsername(googleUsername.trim())
                          if (data.taken === true || data.available === false || data.exists === true) {
                            setGoogleUsernameError('Username already taken. Try another.')
                            setGoogleUsernameOk(false)
                          } else { setGoogleUsernameOk(true); setGoogleUsernameError('') }
                        } catch { setGoogleUsernameError('') }
                        finally { setGoogleUsernameChecking(false) }
                      }}
                    />
                    {googleUsernameChecking && <p className="mt-1.5 text-xs text-white/40">Checking…</p>}
                    {googleUsernameError && <p className="mt-1.5 text-xs text-red-400">{googleUsernameError}</p>}
                    {googleUsernameOk && <p className="mt-1.5 text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Username available</p>}
                    <p className="mt-1 text-[11px] text-white/25">Letters, numbers, _ . - only · Min 3 chars</p>
                  </div>
                )}

                <div>
                  {googlePasswordMode === 'set' ? (
                    <div className="flex items-center justify-between mb-1">
                      <label className="label">Password</label>
                      <button type="button"
                        onClick={() => { const s = generateStrongPassword(); setGoogleAccPwd(s); setGoogleAccPwdConfirm(s) }}
                        className="flex items-center gap-1 text-[11px] text-brand-400 hover:text-brand-300 transition">
                        <Sparkles className="w-3 h-3" /> Suggest strong password
                      </button>
                    </div>
                  ) : (
                    <label className="label">Password</label>
                  )}
                  <PasswordField value={googleAccPwd}
                    onChange={e => { setGoogleAccPwd(e.target.value); setError('') }}
                    placeholder={googlePasswordMode === 'set' ? 'Min. 8 characters' : 'Enter your password'}
                    autoFocus />
                  {googlePasswordMode === 'set' && <PasswordStrength password={googleAccPwd} />}
                  {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
                </div>

                {googlePasswordMode === 'set' && (
                  <div>
                    <label className="label">Confirm password</label>
                    <PasswordField value={googleAccPwdConfirm}
                      onChange={e => { setGoogleAccPwdConfirm(e.target.value); setError('') }}
                      placeholder="Repeat your password" />
                    {googleAccPwd && googleAccPwdConfirm && googleAccPwd === googleAccPwdConfirm && (
                      <p className="mt-1.5 text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Passwords match
                      </p>
                    )}
                    {googleAccPwd && googleAccPwdConfirm && googleAccPwd !== googleAccPwdConfirm && (
                      <p className="mt-1.5 text-xs text-red-400">Passwords do not match</p>
                    )}
                  </div>
                )}

                <button type="submit"
                  disabled={
                    loading || !googleAccPwd ||
                    (googlePasswordMode === 'set' && (
                      googleAccPwd.length < 8 || !/[A-Z]/.test(googleAccPwd) ||
                      !/\d/.test(googleAccPwd) || googleAccPwd !== googleAccPwdConfirm
                    ))
                  }
                  className="btn-primary w-full h-12 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Please wait…' : googlePasswordMode === 'set' ? 'Secure & Continue' : 'Verify & Sign in'}
                </button>

                {googlePasswordMode === 'enter' && (
                  <button type="button"
                    onClick={() => { setForgotEmail(googleEmail); setStage('forgot_send'); setError('') }}
                    className="w-full text-center text-sm text-brand-400 hover:text-brand-300 transition py-1">
                    Forgot password?
                  </button>
                )}
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  )
}



