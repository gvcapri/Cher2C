import { useAppStore } from '../store'
import { ConnectionState } from 'livekit-client'
import { ScreenSharePanel } from './ScreenSharePanel'
import { RemoteScreenShare } from './RemoteScreenShare'
import { LocalScreenSharePreview } from './LocalScreenSharePreview'
import { DebugMetricsPanel } from './DebugMetricsPanel'

export function VoiceChannelView() {
  const voiceChannelId = useAppStore((s) => s.voiceChannelId)
  const participants = useAppStore((s) => s.participants)
  const speaking = useAppStore((s) => s.speaking)
  const muted = useAppStore((s) => s.muted)
  const deafened = useAppStore((s) => s.deafened)
  const connectionState = useAppStore((s) => s.connectionState)
  const toggleMute = useAppStore((s) => s.toggleMute)
  const toggleDeafen = useAppStore((s) => s.toggleDeafen)
  const leaveVoice = useAppStore((s) => s.leaveVoice)

  if (!voiceChannelId) {
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: '#80848e' }}>
        Entre em um canal de voz para começar a falar.
      </div>
    )
  }

  const speakingSet = new Set(speaking)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 12, borderBottom: '1px solid #333' }}>
        <strong>Canal de voz ativo</strong>{' '}
        <span style={{ color: '#80848e' }}>· {connectionState}</span>
        {connectionState === ConnectionState.Reconnecting && (
          <span style={{ color: '#faa61a' }}> (reconectando...)</span>
        )}
      </div>

      <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
        <LocalScreenSharePreview />
        <RemoteScreenShare />
        <h4>Participantes ({participants.length})</h4>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {participants.map((p) => {
            const isSpeaking = speakingSet.has(p.identity) || p.isSpeaking
            return (
              <li
                key={p.identity}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  marginBottom: 4,
                  borderRadius: 6,
                  background: isSpeaking ? 'rgba(59,165,93,0.15)' : 'transparent',
                  border: isSpeaking ? '1px solid #3ba55d' : '1px solid transparent'
                }}
              >
                {/* Indicador de fala (bolha verde quando ativo) */}
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: isSpeaking ? '#3ba55d' : '#4e5058',
                    display: 'inline-block'
                  }}
                />
                <span style={{ color: '#dbdee1' }}>
                  {p.name}
                  {p.isLocal ? ' (você)' : ''}
                </span>
                {p.muted && <span style={{ color: '#f23f43' }}>mudo</span>}
              </li>
            )
          })}
        </ul>
      </div>

      {/* Compartilhamento de tela */}
      <ScreenSharePanel />

      {/* Métricas de depuração (Etapa 5) */}
      <DebugMetricsPanel />

      {/* Barra de controles */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: 12,
          borderTop: '1px solid #333',
          justifyContent: 'center'
        }}
      >
        <button onClick={() => void toggleMute()} disabled={deafened}>
          {muted ? '🔇 Desmutar' : '🎙️ Mudo'}
        </button>
        <button onClick={() => void toggleDeafen()}>
          {deafened ? '🔈 Desensurdecer' : '🔇 Ensurdecer'}
        </button>
        <button
          onClick={() => void leaveVoice()}
          style={{ background: '#f23f43', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px' }}
        >
          Sair
        </button>
      </div>
    </div>
  )
}
