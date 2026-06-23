import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function GoogleCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const access = params.get('access')
    const refresh = params.get('refresh')
    const email = params.get('email')
    const action = params.get('action')
    const googleEmail = params.get('google_email')

    if (action === 'signup' && googleEmail) {
      // New user — redirect to signup form pre-filled with Google email
      navigate(
        `/login?google_email=${encodeURIComponent(googleEmail)}&action=signup`,
        { replace: true }
      )
    } else if (access && refresh && email) {
      // Existing user — do NOT auto-login. Store tokens temporarily and ask for password.
      // Tokens are stored so we can complete auth after password is verified.
      sessionStorage.setItem('__sm_google_tokens__', JSON.stringify({ access, refresh }))
      navigate(
        `/login?google_verified=${encodeURIComponent(email)}`,
        { replace: true }
      )
    } else {
      navigate('/login?error=google_failed', { replace: true })
    }
  }, [])

  return <p style={{ color: 'white', textAlign: 'center', marginTop: '40px' }}>Signing you in…</p>
}