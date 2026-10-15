import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store'
import type { LocalTrackPublication } from 'livekit-client'

/**
 * Preview LOCAL da tela que o próprio usuário está compartilhando.
 * Sem isso, o compartilhador não vê o que está enviando (só os REMOTOS veem,
 * via RemoteScreenShare). Anexa a track local de vídeo num <video> (espelhada).
 */
function LocalScreenVideo({ publication }: { publication: LocalTrackPublication }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    const track = publication.track
    if (!el || !track) return
    track.attach(el)
    return () => {
      track.detach(el)
    }
  }, [publication, publication.track])

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      style={{
        width: '100%',
        background: '#000',
        borderRadius: 6,
        transform: 'scaleX(-1)' // espelha (convenção de preview próprio)
      }}
    />
  )
}

export function LocalScreenSharePreview() {
  const voiceManager = useAppStore((s) => s.voiceManager)
  const sharing = useAppStore((s) => s.sharing)
  const [pub, setPub] = useState<LocalTrackPublication | undefined>(undefined)

  // Reavalia periódicamente enquanto estiver compartilhando (MVP simplificado)
  useEffect(() => {
    if (!voiceManager || !sharing) {
      setPub(undefined)
      return
    }
    const update = () => setPub(voiceManager.getLocalScreenShare())
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [voiceManager, sharing])

  if (!sharing || !pub || !pub.track) return null

  return (
    <div style={{ borderTop: '1px solid #333', padding: 12 }}>
      <div style={{ fontSize: 12, color: '#b5bac1', marginBottom: 4 }}>
        Você está compartilhando (preview local)
      </div>
      <LocalScreenVideo publication={pub} />
    </div>
  )
}
