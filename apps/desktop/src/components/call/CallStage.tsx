import { useRef, useState } from 'react'
import { ConnectionState } from 'livekit-client'
import { Activity, Maximize2, PictureInPicture } from 'lucide-react'
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

type ViewerQuality = 'auto' | 'low' | 'mid' | 'high'

/** Opções do seletor de qualidade do espectador (sobre o vídeo). */
const QUALITY_OPTIONS: Array<{ value: ViewerQuality; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: '360p' },
  { value: 'mid', label: '540p' },
  { value: 'high', label: '1080p' }
]

/**
 * Palco da chamada de voz (foco do app):
 *  - grade responsiva de participantes (avatar grande, anel de fala, badges)
 *  - fixar participante em destaque (pin)
 *  - modo de apresentação quando há tela compartilhada (16:9 + strip lateral)
 *  - seletor de qualidade do espectador, tela cheia e picture-in-picture
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
  const viewerQuality = useAppStore((s) => s.viewerQuality)
  const setViewerQuality = useAppStore((s) => s.setViewerQuality)

  const [pinned, setPinned] = useState<string | null>(null)
  const featuredRef = useRef<HTMLDivElement>(null)

  const channel = channels.find((c) => c.id === voiceChannelId)
  const speakingSet = new Set(speaking)

  // Telas remotas (de outros participantes)
  const remoteShares = voiceManager?.getRemoteScreenShares() ?? []
  const hasPresentation = sharing || remoteShares.length > 0

  const pinnedParticipant = pinned
    ? participants.find((p) => p.identity === pinned) ?? null
    : null

  const stateLabel =
    connState === ConnectionState.Connected
      ? 'conectado'
      : connState === ConnectionState.Reconnecting
        ? 'reconectando'
        : connState === ConnectionState.Connecting
          ? 'conectando…'
          : 'desconectado'

  async function toggleFullscreen() {
    const el = featuredRef.current
    if (!el) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await el.requestFullscreen()
    } catch {
      // navegador/Electron pode negar fora de gesto do usuário — ignora
    }
  }

  async function togglePiP() {
    const video = featuredRef.current?.querySelector('video')
    if (!video || !document.pictureInPictureEnabled) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await video.requestPictureInPicture()
    } catch {
      // PiP indisponível neste contexto — ignora
    }
  }

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
            <div className={styles.featured} ref={featuredRef}>
              {remoteShares.length > 0 ? (
                <>
                  <RemoteScreenVideo publication={remoteShares[0].publication} />
                  <div className={styles.featuredBar}>
                    <span className={styles.featuredLabel}>
                      🖥️{' '}
                      {userId &&
                      (remoteShares[0].identity === userId ||
                        remoteShares[0].identity.startsWith(`${userId}#`))
                        ? 'Sua tela'
                        : `Tela de ${remoteShares[0].identity}`}
                    </span>
                    <div className={styles.featuredActions}>
                      {/* Seletor de qualidade do espectador */}
                      <select
                        className={styles.qualitySelect}
                        value={viewerQuality}
                        onChange={(e) => setViewerQuality(e.target.value as ViewerQuality)}
                        aria-label="Qualidade do vídeo recebido"
                        title="Qualidade do vídeo recebido"
                      >
                        {QUALITY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className={styles.featuredIconBtn}
                        onClick={() => void togglePiP()}
                        title="Picture-in-picture"
                        aria-label="Picture-in-picture"
                        disabled={!document.pictureInPictureEnabled}
                      >
                        <PictureInPicture size={15} />
                      </button>
                      <button
                        type="button"
                        className={styles.featuredIconBtn}
                        onClick={() => void toggleFullscreen()}
                        title="Tela cheia"
                        aria-label="Tela cheia"
                      >
                        <Maximize2 size={15} />
                      </button>
                    </div>
                  </div>
                </>
              ) : sharing ? (
                <>
                  <LocalScreenVideoWrapper />
                  <div className={styles.featuredBar}>
                    <span className={styles.featuredLabel}>🖥️ Sua tela</span>
                    <div className={styles.featuredActions}>
                      <button
                        type="button"
                        className={styles.featuredIconBtn}
                        onClick={() => void toggleFullscreen()}
                        title="Tela cheia"
                        aria-label="Tela cheia"
                      >
                        <Maximize2 size={15} />
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* Faixa de participantes (fixado sai primeiro) */}
            <div className={styles.strip}>
              {orderedParticipants(participants, pinned).map((p) => (
                <ParticipantCard
                  key={p.identity}
                  participant={p}
                  speaking={speakingSet.has(p.identity)}
                  variant="strip"
                  pinned={p.identity === pinned}
                  onTogglePin={() =>
                    setPinned((cur) => (cur === p.identity ? null : p.identity))
                  }
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.stage}>
          {pinnedParticipant ? (
            <div className={styles.pinnedLayout}>
              <div className={styles.pinnedMain}>
                <ParticipantCard
                  participant={pinnedParticipant}
                  speaking={speakingSet.has(pinnedParticipant.identity)}
                  pinned
                  onTogglePin={() => setPinned(null)}
                />
              </div>
              <div className={styles.strip}>
                {participants
                  .filter((p) => p.identity !== pinnedParticipant.identity)
                  .map((p) => (
                    <ParticipantCard
                      key={p.identity}
                      participant={p}
                      speaking={speakingSet.has(p.identity)}
                      variant="strip"
                      onTogglePin={() => setPinned(p.identity)}
                    />
                  ))}
              </div>
            </div>
          ) : (
            <div className={styles.grid}>
              {participants.map((p) => (
                <ParticipantCard
                  key={p.identity}
                  participant={p}
                  speaking={speakingSet.has(p.identity)}
                  onTogglePin={() => setPinned(p.identity)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <ControlBar />
      <ShareModal />
      <AudioSettings />
    </div>
  )
}

/** Fixado primeiro, demais na ordem original. */
function orderedParticipants<T extends { identity: string }>(
  list: T[],
  pinned: string | null
): T[] {
  if (!pinned) return list
  const idx = list.findIndex((p) => p.identity === pinned)
  if (idx <= 0) return list
  return [list[idx], ...list.slice(0, idx), ...list.slice(idx + 1)]
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
