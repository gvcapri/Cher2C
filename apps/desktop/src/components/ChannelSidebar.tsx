import { useEffect } from 'react'
import { useAppStore } from '../store'

export function ChannelSidebar() {
  const servers = useAppStore((s) => s.servers)
  const channels = useAppStore((s) => s.channels)
  const activeServerId = useAppStore((s) => s.activeServerId)
  const selectServer = useAppStore((s) => s.selectServer)
  const joinVoice = useAppStore((s) => s.joinVoice)
  const voiceChannelId = useAppStore((s) => s.voiceChannelId)

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
