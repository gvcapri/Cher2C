import { useEffect, useState } from 'react'
import { useAppStore } from './store'
import { AuthPanel } from './components/AuthPanel'
import { ChannelSidebar } from './components/ChannelSidebar'
import { VoiceChannelView } from './components/VoiceChannelView'
import { checkHealth } from './api'

export default function App() {
  const token = useAppStore((s) => s.token)
  const user = useAppStore((s) => s.user)
  const logout = useAppStore((s) => s.logout)
  const [health, setHealth] = useState('...')

  useEffect(() => {
    checkHealth()
      .then((h) => setHealth(h.status))
      .catch(() => setHealth('offline'))
  }, [])

  if (!token) {
    return (
      <>
        <AuthPanel />
        <p style={{ textAlign: 'center', color: '#888', fontFamily: 'system-ui' }}>
          backend: {health}
        </p>
      </>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui', background: '#313338', color: '#dbdee1' }}>
      <ChannelSidebar />
      <VoiceChannelView />
      <div
        style={{
          position: 'fixed',
          top: 8,
          right: 12,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          fontSize: 12,
          color: '#80848e'
        }}
      >
        <span>{user?.username}</span>
        <button onClick={logout} style={{ cursor: 'pointer' }}>
          Sair
        </button>
      </div>
    </div>
  )
}
