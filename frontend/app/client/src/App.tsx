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
