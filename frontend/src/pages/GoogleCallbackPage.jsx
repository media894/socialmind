import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function GoogleCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const access = params.get('access')
    const refresh = params.get('refresh')

    if (access && refresh) {
      // Store temporarily for the auth component to pick up
      localStorage.setItem('__sm_google_auth__', JSON.stringify({
        type: 'socialmind-google-auth',
        access,
        refresh,
      }))
      navigate('/login', { replace: true })
    } else {
      navigate('/login?error=google_failed', { replace: true })
    }
  }, [])

  return <p style={{ color: 'white', textAlign: 'center', marginTop: '40px' }}>Signing you in...</p>
}