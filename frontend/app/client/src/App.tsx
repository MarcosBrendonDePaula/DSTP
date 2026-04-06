import { Routes, Route } from 'react-router'
import { LiveComponentsProvider } from '@/core/client'
import { DSTPanel } from './live/DSTPanel'
import { AutomationPage } from './automation/AutomationPage'

function AppContent() {
  return (
    <Routes>
      <Route path="/" element={<DSTPanel />} />
      <Route path="/automation" element={<AutomationPage />} />
      <Route path="*" element={<DSTPanel />} />
    </Routes>
  )
}

function App() {
  // In dev, connect WebSocket directly to backend (port 3000) to avoid
  // Vite proxy overhead and HMR WebSocket contention on port 5173.
  // In production, both are served from the same origin so auto-detect works.
  const wsUrl = import.meta.env.DEV
    ? 'ws://localhost:3000/api/live/ws'
    : undefined

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
