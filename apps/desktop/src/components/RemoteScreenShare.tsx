import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store'
import type { RemoteTrackPublication } from 'livekit-client'

function RemoteScreenVideo({ publication }: { publication: RemoteTrackPublication }) {
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
      style={{ width: '100%', background: '#000', borderRadius: 6 }}
    />
  )
}

export function RemoteScreenShare() {
  const voiceManager = useAppStore((s) => s.voiceManager)
  const viewerQuality = useAppStore((s) => s.viewerQuality)
  const setViewerQuality = useAppStore((s) => s.setViewerQuality)
  const [shares, setShares] = useState<Array<{ identity: string; publication: RemoteTrackPublication }>>([])

  // Reavalia periódicamente (simplificado p/ MVP; product usaria eventos de track)
  useEffect(() => {
    if (!voiceManager) {
      setShares([])
      return
    }
    const update = () => setShares(voiceManager.getRemoteScreenShares())
    update()
    const id = setInterval(update, 2000)
    return () => clearInterval(id)
  }, [voiceManager])

  if (shares.length === 0) return null

  return (
    <div style={{ borderTop: '1px solid #333', padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: '0 0 8px' }}>Assistindo</h4>
        <label style={{ fontSize: 12 }}>
          Qualidade:{' '}
          <select
            value={viewerQuality}
            onChange={(e) => setViewerQuality(e.target.value as 'auto' | 'low' | 'mid' | 'high')}
          >
            <option value="auto">Automática</option>
            <option value="low">Baixa (360p)</option>
            <option value="mid">Média (540p)</option>
            <option value="high">Alta (1080p)</option>
          </select>
        </label>
      </div>
      {shares.map((s) => (
        <div key={s.identity} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: '#b5bac1' }}>{s.identity}</div>
          <RemoteScreenVideo publication={s.publication} />
        </div>
      ))}
    </div>
  )
}
