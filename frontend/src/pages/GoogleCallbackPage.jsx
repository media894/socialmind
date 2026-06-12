import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function GoogleCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const access = params.get('access')
    const refresh = params.get('refresh')
    const email = params.get('email') || ''
    const has_password = params.get('has_password') === 'true'

    if (access && refresh) {
      sessionStorage.setItem('__sm_google_pending__', JSON.stringify({
        access, refresh,
        user: { email, has_password }
      }))
      navigate('/login', { replace: true })
    } else {
      navigate('/login?error=google_failed', { replace: true })
    }
  }, [])

  return <p style={{ color: 'white', textAlign: 'center', marginTop: '40px' }}>Signing you in...</p>
}