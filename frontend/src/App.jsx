import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from '@/store/auth'
import { getAccessLevel } from '@/utils/trialAccess.js'

// Pages
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import TrialPage from '@/pages/TrialPage'
import DashboardPage from '@/pages/DashboardPage'
import VideosPage from '@/pages/VideosPage'
import VideoDetailPage from '@/pages/VideoDetailPage'
import CreateVideoPage from '@/pages/CreateVideoPage'
import SchedulePage from '@/pages/SchedulePageLocal'
import PostedPage from '@/pages/PostedPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import SettingsPage from '@/pages/SettingsPage'
import LocalVideoDetailPage from '@/pages/LocalVideoDetailPage'
import UploadVideoPage from '@/pages/UploadVideoPage'
import MultiPlatformSchedulePage from '@/pages/MultiPlatformSchedulePage'
import DownloadsPageWithPlayer from '@/pages/DownloadsPageWithPlayer'
import HomePage from '@/pages/HomePage'
import HowItWorksPage from '@/pages/HowItWorksPage'
import WatchPage from '@/pages/WatchPage'

// Layout
import AppLayout from '@/components/layout/AppLayout'
import LoadingScreen from '@/components/ui/LoadingScreen'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore()
  if (isLoading) return <LoadingScreen />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

/** Routes that require a subscription — trial users see TrialPage instead */
function AccessRoute({ gate, children }) {
  const { isAuthenticated, isLoading, user } = useAuthStore()
  if (isLoading) return <LoadingScreen />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  const access = getAccessLevel(user)
  if (!access[gate]) return <TrialPage />
  return children
}

function PublicRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore()
  if (isLoading) return <LoadingScreen />
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  const init = useAuthStore(s => s.init)
  useEffect(() => { init() }, [init])
  useEffect(() => {
    const theme = localStorage.getItem('theme') || 'dark'
    document.documentElement.classList.toggle('theme-light', theme === 'light')
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/watch/:projectId" element={<WatchPage />} />
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="videos" element={<AccessRoute gate="videosEnabled"><VideosPage /></AccessRoute>} />
            <Route path="videos/new" element={<ProtectedRoute><CreateVideoPage /></ProtectedRoute>} />
            <Route path="videos/upload" element={<ProtectedRoute><UploadVideoPage /></ProtectedRoute>} />
            <Route path="videos/:id" element={<AccessRoute gate="videosEnabled"><VideoDetailPage /></AccessRoute>} />
            <Route path="videos/:id/schedule" element={<AccessRoute gate="scheduleEnabled"><MultiPlatformSchedulePage /></AccessRoute>} />
            <Route path="videos/local/:localId" element={<AccessRoute gate="videosEnabled"><LocalVideoDetailPage /></AccessRoute>} />
            <Route path="schedule" element={<ProtectedRoute><SchedulePage /></ProtectedRoute>} />
            <Route path="posted" element={<AccessRoute gate="postedEnabled"><PostedPage /></AccessRoute>} />
            <Route path="downloads" element={<AccessRoute gate="downloadsEnabled"><DownloadsPageWithPlayer /></AccessRoute>} />
            <Route path="analytics" element={<AccessRoute gate="analyticsEnabled"><AnalyticsPage /></AccessRoute>} />
            <Route path="settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="how-it-works" element={<ProtectedRoute><HowItWorksPage /></ProtectedRoute>} />
            <Route path="subscription" element={<ProtectedRoute><TrialPage /></ProtectedRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'linear-gradient(135deg, rgba(17,20,42,0.96), rgba(13,16,36,0.96))',
            color: '#fff',
            border: '1px solid rgba(139,92,246,0.32)',
            borderRadius: '16px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.38)',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#11142a' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#11142a' } },
        }}
      />
    </QueryClientProvider>
  )
}
