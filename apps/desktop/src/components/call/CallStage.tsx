import { ConnectionState } from 'livekit-client'
import { Activity } from 'lucide-react'
import { useAppStore } from '../../store'
import { RemoteScreenVideo } from '../screen/RemoteScreenVideo'
import { LocalScreenVideo } from '../screen/LocalScreenVideo'
import { Spinner, IconButton } from '../ui'
import { ConnectionIndicator } from './ConnectionIndicator'
import { ParticipantCard } from './ParticipantCard'
import { ControlBar } from './ControlBar'
import { ShareModal } from './ShareModal'
import { AudioSettings } from './AudioSettings'
import styles from './call.module.css'

/**
 * Palco da chamada de voz (foco do app):
 *  - grade responsiva de participantes (avatar grande, anel de fala, badges)
 *  - modo de apresentação quando há tela compartilhada (16:9 + strip lateral)
 *  - barra de controles flutuante
 *  - banner "Reconectando…" quando aplicável
 */
export function CallStage() {
  const voiceChannelId = useAppStore((s) => s.voiceChannelId)
  const channels = useAppStore((s) => s.channels)
  const participants = useAppStore((s) => s.participants)
  const speaking = useAppStore((s) => s.speaking)
  const connState = useAppStore((s) => s.connectionState)
  const sharing = useAppStore((s) => s.sharing)
  const voiceManager = useAppStore((s) => s.voiceManager)
  const userId = useAppStore((s) => s.user?.id)

  const channel = channels.find((c) => c.id === voiceChannelId)
  const speakingSet = new Set(speaking)

  // Telas remotas (de outros participantes)
  const remoteShares = voiceManager?.getRemoteScreenShares() ?? []
  const hasPresentation = sharing || remoteShares.length > 0

  const stateLabel =
    connState === ConnectionState.Connected
      ? 'conectado'
      : connState === ConnectionState.Reconnecting
        ? 'reconectando'
        : connState === ConnectionState.Connecting
          ? 'conectando…'
          : 'desconectado'

  return (
    <div className={styles.root}>
      <header className={styles.topbar}>
        <span style={{ color: 'var(--text-faint)' }}>🔊</span>
        <span className={styles.topbarTitle}>{channel?.name ?? 'Chamada'}</span>
        <span className={styles.topbarState}>· {stateLabel}</span>
        <span style={{ flex: 1 }} />
        <ConnectionIndicator />
        <IconButton
          tooltip="Métricas de depuração (Ctrl+Shift+D)"
          onClick={() => useAppStore.getState().toggleShowMetrics()}
          aria-label="Métricas de depuração"
        >
          <Activity size={16} />
        </IconButton>
      </header>

      {connState === ConnectionState.Reconnecting && (
        <div className={styles.reconnectBanner} role="status">
          <Spinner size={14} /> Reconectando…
        </div>
      )}

      {hasPresentation ? (
        <div className={styles.stage}>
          <div className={styles.presentation}>
            {/* Destaque: tela remota (se houver) ou preview local */}
            <div className={styles.featured}>
              {remoteShares.length > 0 ? (
                <>
                  <RemoteScreenVideo publication={remoteShares[0].publication} />
                  <div className={styles.featuredBar}>
                    <span className={styles.featuredLabel}>
                      🖥️ {remoteShares[0].identity === userId ? 'Sua tela' : `Tela de ${remoteShares[0].identity}`}
                    </span>
                  </div>
                </>
              ) : sharing ? (
                <LocalScreenVideoWrapper />
              ) : null}
            </div>

            {/* Faixa de participantes */}
            <div className={styles.strip}>
              {participants.map((p) => (
                <ParticipantCard
                  key={p.identity}
                  participant={p}
                  speaking={speakingSet.has(p.identity)}
                  variant="strip"
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.stage}>
          <div className={styles.grid}>
            {participants.map((p) => (
              <ParticipantCard
                key={p.identity}
                participant={p}
                speaking={speakingSet.has(p.identity)}
              />
            ))}
          </div>
        </div>
      )}

      <ControlBar />
      <ShareModal />
      <AudioSettings />
    </div>
  )
}

/** Preview local da tela no modo apresentação (sem stream remota). */
function LocalScreenVideoWrapper() {
  const voiceManager = useAppStore((s) => s.voiceManager)
  const pub = voiceManager?.getLocalScreenShare()
  if (!pub) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#fff' }}>
        <span className={styles.featuredLabel}>Compartilhando…</span>
      </div>
    )
  }
  return <LocalScreenVideo publication={pub} />
}
