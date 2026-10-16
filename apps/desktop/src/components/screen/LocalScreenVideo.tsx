import { useEffect, useRef } from 'react'
import type { LocalTrackPublication } from 'livekit-client'

/**
 * Preview LOCAL da tela que o usuário está compartilhando (track local).
 * `muted` evita eco de áudio; espelhado por convenção de preview próprio.
 */
export function LocalScreenVideo({ publication }: { publication: LocalTrackPublication }) {
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
        height: '100%',
        objectFit: 'contain',
        background: '#000',
        transform: 'scaleX(-1)'
      }}
    />
  )
}
