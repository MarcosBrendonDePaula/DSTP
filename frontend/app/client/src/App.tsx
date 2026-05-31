import { Routes, Route, useSearchParams } from 'react-router'
import { LiveComponentsProvider } from '@/core/client'
import { DSTPanel } from './live/DSTPanel'
import { AutomationPage } from './automation/AutomationPage'
import { AuthGate } from './components/AuthGate'

function GatedRoute({ children }: { children: React.ReactNode }) {
  const [searchParams] = useSearchParams()
  const serverId = searchParams.get('server')
  return <AuthGate serverId={serverId}>{children}</AuthGate>
}

function AppContent() {
  return (
    <Routes>
      <Route path="/" element={<GatedRoute><DSTPanel /></GatedRoute>} />
      <Route path="/automation" element={<GatedRoute><AutomationPage /></GatedRoute>} />
      <Route path="*" element={<GatedRoute><DSTPanel /></GatedRoute>} />
    </Routes>
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
