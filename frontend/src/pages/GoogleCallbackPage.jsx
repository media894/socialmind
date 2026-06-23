import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { authApi } from '@/api/client'

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
      // Store tokens first so the profile request can be authenticated
      localStorage.setItem('access_token', access)
      localStorage.setItem('refresh_token', refresh)

      // Fetch user profile so completeAuth has the full user object
      authApi.getProfile()
        .then(({ data: user }) => {
          completeAuth({ access, refresh, user })
          navigate('/dashboard', { replace: true })
        })
        .catch(() => {
          // Profile fetch failed — still try to complete auth without user object
          // The app's init() will retry fetching the profile on next load
          completeAuth({ access, refresh, user: null })
          navigate('/dashboard', { replace: true })
        })
    } else {
      navigate('/login?error=google_failed', { replace: true })
    }
  }, [])

  return <p style={{ color: 'white', textAlign: 'center', marginTop: '40px' }}>Signing you in...</p>
}