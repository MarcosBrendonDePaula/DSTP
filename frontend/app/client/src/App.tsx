import { lazy, Suspense } from 'react'
import { Routes, Route, useSearchParams } from 'react-router'
import { LiveComponentsProvider } from '@/core/client'
import { DSTPanel } from './live/DSTPanel'
import { AuthGate } from './components/AuthGate'

// AutomationPage pulls in React Flow + all 113 node UI modules — a heavy chunk
// the home/panel route never needs. Lazy-load it so it's fetched only when the
// /automation route is visited.
const AutomationPage = lazy(() => import('./automation/AutomationPage').then(m => ({ default: m.AutomationPage })))

function GatedRoute({ children }: { children: React.ReactNode }) {
  const [searchParams] = useSearchParams()
  const serverId = searchParams.get('server')
  return <AuthGate serverId={serverId}>{children}</AuthGate>
}

function AppContent() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', color: '#6b7280', background: '#0a0b0d' }}>Carregando…</div>}>
      <Routes>
        <Route path="/" element={<GatedRoute><DSTPanel /></GatedRoute>} />
        <Route path="/automation" element={<GatedRoute><AutomationPage /></GatedRoute>} />
        <Route path="*" element={<GatedRoute><DSTPanel /></GatedRoute>} />
      </Routes>
    </Suspense>
  )
}

function App() {
  return (
    <LiveComponentsProvider
      //url={wsUrl}
      autoConnect={true}
      reconnectInterval={1000}
      maxReconnectAttempts={5}
      heartbeatInterval={30000}
      debug={false}
    >
      <AppContent />
    </LiveComponentsProvider>
  )
}

export default App
