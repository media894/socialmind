import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'

export default function GoogleCallbackPage() {
  const navigate = useNavigate()
  const completeAuth = useAuthStore(s => s.completeAuth)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const access = params.get('access')
    const refresh = params.get('refresh')
    const action = params.get('action')
    const googleEmail = params.get('google_email')

    if (action === 'signup' && googleEmail) {
      // New user — redirect to login page with signup tab pre-filled
      navigate(
        `/login?google_email=${encodeURIComponent(googleEmail)}&action=signup`,
        { replace: true }
      )
    } else if (access && refresh) {
      // Existing user — complete login and go to dashboard
      completeAuth({ access, refresh })
      navigate('/dashboard', { replace: true })
    } else {
      navigate('/login?error=google_failed', { replace: true })
    }
  }, [])

  return <p style={{ color: 'white', textAlign: 'center', marginTop: '40px' }}>Signing you in...</p>
}