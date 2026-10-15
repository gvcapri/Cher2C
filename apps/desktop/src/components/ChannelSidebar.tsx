import { useEffect, useState } from 'react'
import { useAppStore } from '../store'

export function ChannelSidebar() {
  const servers = useAppStore((s) => s.servers)
  const channels = useAppStore((s) => s.channels)
  const activeServerId = useAppStore((s) => s.activeServerId)
  const selectServer = useAppStore((s) => s.selectServer)
  const joinVoice = useAppStore((s) => s.joinVoice)
  const voiceChannelId = useAppStore((s) => s.voiceChannelId)
  const joinServer = useAppStore((s) => s.joinServer)
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)

  const handleJoin = async () => {
    if (!joinCode.trim()) return
    setJoinError(null)
    try {
      await joinServer(joinCode.trim())
      setJoinCode('')
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Falha ao entrar')
    }
  }

  useEffect(() => {
    if (!activeServerId && servers.length > 0) {
      void selectServer(servers[0].id)
    }
  }, [activeServerId, servers, selectServer])

  const voiceChannels = channels.filter((c) => c.type === 'VOICE')
  const textChannels = channels.filter((c) => c.type === 'TEXT')

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Coluna de servidores */}
      <div style={{ width: 64, borderRight: '1px solid #333', padding: 8 }}>
        {servers.map((srv) => (
          <button
            key={srv.id}
            onClick={() => void selectServer(srv.id)}
            style={{
              display: 'block',
              width: 48,
              height: 48,
              marginBottom: 8,
              borderRadius: 12,
              background: srv.id === activeServerId ? '#5865f2' : '#2b2d31',
              color: '#fff',
              border: 'none',
              cursor: 'pointer'
            }}
            title={srv.name}
          >
            {srv.name.slice(0, 2).toUpperCase()}
          </button>
        ))}

        {/* Entrar em servidor por código de convite */}
        <div style={{ marginTop: 8 }}>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="código"
            title="ID do servidor (convite)"
            style={{
              width: 48,
              boxSizing: 'border-box',
              fontSize: 11,
              padding: '4px 2px',
              borderRadius: 4,
              border: '1px solid #333',
              background: '#1e1f22',
              color: '#dbdee1'
            }}
          />
          <button
            onClick={() => void handleJoin()}
            title="Entrar no servidor com código"
            style={{
              display: 'block',
              width: 48,
              height: 28,
              marginTop: 4,
              fontSize: 16,
              borderRadius: 6,
              background: '#2b2d31',
              color: '#fff',
              border: '1px dashed #4e5058',
              cursor: 'pointer'
            }}
          >
            +
          </button>
          {joinError && (
            <div style={{ color: '#f23f43', fontSize: 10, marginTop: 4 }}>{joinError}</div>
          )}
        </div>
      </div>

      {/* Coluna de canais */}
      <div style={{ width: 220, borderRight: '1px solid #333', padding: 12 }}>
        <h4 style={{ margin: '0 0 8px' }}>Canais de voz</h4>
        {voiceChannels.map((ch) => (
          <button
            key={ch.id}
            onClick={() => void joinVoice(ch.id)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '6px 8px',
              marginBottom: 4,
              background: ch.id === voiceChannelId ? '#3ba55d' : 'transparent',
              color: '#fff',
              border: '1px solid #333',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            🔊 {ch.name}
          </button>
        ))}

        <h4 style={{ margin: '16px 0 8px' }}>Canais de texto</h4>
        {textChannels.map((ch) => (
          <div key={ch.id} style={{ padding: '4px 8px', color: '#b5bac1' }}>
            # {ch.name}
          </div>
        ))}
      </div>
    </div>
  )
}
