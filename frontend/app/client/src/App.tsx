import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router'
import { api } from './lib/eden-api'
import { LiveComponentsProvider } from '@/core/client'
import { FormDemo } from './live/FormDemo'
import { CounterDemo } from './live/CounterDemo'
import { UploadDemo } from './live/UploadDemo'
import { RoomChatDemo } from './live/RoomChatDemo'
import { SharedCounterDemo } from './live/SharedCounterDemo'
import { AuthDemo } from './live/AuthDemo'
import { PingPongDemo } from './live/PingPongDemo'
import { DSTPanel } from './live/DSTPanel'
import { AppLayout } from './components/AppLayout'
import { DemoPage } from './components/DemoPage'
import { HomePage } from './pages/HomePage'
import { ApiTestPage } from './pages/ApiTestPage'

function AppContent() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [apiResponse, setApiResponse] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    checkApiStatus()
  }, [])

  const checkApiStatus = async () => {
    try {
      const { error } = await api.health.get()
      setApiStatus(error ? 'offline' : 'online')
    } catch {
      setApiStatus('offline')
    }
  }

  const testHealthCheck = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await api.health.get()
      setApiResponse(JSON.stringify(error ?? data, null, 2))
    } catch (e) {
      setApiResponse(`Error: ${e}`)
    }
    setIsLoading(false)
  }

  const testGetUsers = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await api.users.get()
      setApiResponse(JSON.stringify(error ?? data, null, 2))
    } catch (e) {
      setApiResponse(`Error: ${e}`)
    }
    setIsLoading(false)
  }

  const testCreateUser = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await api.users.post({
        name: `Test User ${Date.now()}`,
        email: `test${Date.now()}@example.com`
      })
      setApiResponse(JSON.stringify(error ?? data, null, 2))
    } catch (e) {
      setApiResponse(`Error: ${e}`)
    }
    setIsLoading(false)
  }

  return (
    <Routes>
      <Route path="/" element={<DSTPanel />} />
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
      url={wsUrl}
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
