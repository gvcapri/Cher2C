import { useEffect, useRef } from 'react'
import type { RemoteTrackPublication } from 'livekit-client'

/**
 * Renderiza a track de vídeo de tela REMOTA (de outro participante).
 * Reaproveitado pelo modo apresentação e pelo preview remoto.
 */
export function RemoteScreenVideo({ publication }: { publication: RemoteTrackPublication }) {
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
      style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
    />
  )
}
