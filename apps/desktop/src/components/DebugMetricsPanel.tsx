import { useAppStore } from '../store'
import {
  formatBitrate,
  formatMs,
  formatPercent,
  type NetworkHealth
} from '../media/metrics'

/**
 * UI de DEPURAÇÃO (Etapa 5): mostra em tempo real bitrate, perda de pacotes,
 * jitter, RTT, fps, resolução e nível de áudio de cada track — mais a saúde
 * geral da rede (good/limited/poor) e o medidor de áudio por participante.
 */

const HEALTH_COLOR: Record<NetworkHealth, string> = {
  good: '#3ba55d',
  limited: '#faa61a',
  poor: '#f23f43'
}

const HEALTH_LABEL: Record<NetworkHealth, string> = {
  good: 'Boa',
  limited: 'Limitada',
  poor: 'Ruim'
}

function directionLabel(direction: 'inbound' | 'outbound'): string {
  return direction === 'outbound' ? '↑ envia' : '↓ recebe'
}

export function DebugMetricsPanel() {
  const metrics = useAppStore((s) => s.metrics)
  const showMetrics = useAppStore((s) => s.showMetrics)
  const toggleShowMetrics = useAppStore((s) => s.toggleShowMetrics)
  const participants = useAppStore((s) => s.participants)

  return (
    <div style={{ borderTop: '1px solid #333' }}>
      <button
        onClick={toggleShowMetrics}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          color: '#80848e',
          padding: '6px 12px',
          textAlign: 'left',
          cursor: 'pointer'
        }}
      >
        {showMetrics ? '▾' : '▸'} Métricas de depuração
        {metrics && (
          <span
            style={{
              marginLeft: 8,
              color: HEALTH_COLOR[metrics.health],
              fontWeight: 600
            }}
          >
            ● {HEALTH_LABEL[metrics.health]}
          </span>
        )}
      </button>

      {showMetrics && (
        <div style={{ padding: '0 12px 12px', fontSize: 12 }}>
          {!metrics && <div style={{ color: '#80848e' }}>Sem dados (entre em um canal).</div>}

          {metrics && (
            <>
              {/* Resumo da conexão */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 12,
                  marginBottom: 8,
                  color: '#dbdee1'
                }}
              >
                <span>
                  Saúde:{' '}
                  <strong style={{ color: HEALTH_COLOR[metrics.health] }}>
                    {HEALTH_LABEL[metrics.health]}
                  </strong>
                </span>
                <span>
                  RTT:{' '}
                  <strong>
                    {metrics.connection.rttMs !== null
                      ? formatMs(metrics.connection.rttMs)
                      : '—'}
                  </strong>
                </span>
                <span>
                  Perda: <strong>{formatPercent(metrics.worstLossRate)}</strong>
                </span>
                <span>
                  Jitter: <strong>{formatMs(metrics.maxJitterMs)}</strong>
                </span>
                <span>
                  Banda saída (BWE):{' '}
                  <strong>
                    {metrics.connection.availableOutgoingBps !== null
                      ? formatBitrate(metrics.connection.availableOutgoingBps)
                      : '—'}
                  </strong>
                </span>
              </div>

              {/* Tabela por track */}
              {metrics.tracks.length === 0 ? (
                <div style={{ color: '#80848e' }}>Aguardando primeira amostra…</div>
              ) : (
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    color: '#dbdee1'
                  }}
                >
                  <thead>
                    <tr style={{ color: '#80848e', textAlign: 'left' }}>
                      <th style={{ padding: '2px 6px' }}>Track</th>
                      <th style={{ padding: '2px 6px' }}>Dir</th>
                      <th style={{ padding: '2px 6px' }}>Bitrate</th>
                      <th style={{ padding: '2px 6px' }}>Perda</th>
                      <th style={{ padding: '2px 6px' }}>Jitter</th>
                      <th style={{ padding: '2px 6px' }}>RTT</th>
                      <th style={{ padding: '2px 6px' }}>FPS</th>
                      <th style={{ padding: '2px 6px' }}>Resolução</th>
                      <th style={{ padding: '2px 6px' }}>Limite enc.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.tracks.map((t) => (
                      <tr key={t.key} style={{ borderTop: '1px solid #2a2b2f' }}>
                        <td style={{ padding: '2px 6px' }}>
                          {t.label ?? (t.kind === 'audio' ? 'Áudio' : 'Vídeo')}
                        </td>
                        <td style={{ padding: '2px 6px' }}>{directionLabel(t.direction)}</td>
                        <td style={{ padding: '2px 6px' }}>{formatBitrate(t.bitrateBps)}</td>
                        <td
                          style={{
                            padding: '2px 6px',
                            color: t.lossRate > 0.05 ? '#f23f43' : undefined
                          }}
                        >
                          {formatPercent(t.lossRate)}
                        </td>
                        <td style={{ padding: '2px 6px' }}>{formatMs(t.jitterMs)}</td>
                        <td style={{ padding: '2px 6px' }}>
                          {t.rttMs !== null ? formatMs(t.rttMs) : '—'}
                        </td>
                        <td style={{ padding: '2px 6px' }}>
                          {t.fps !== null ? Math.round(t.fps) : '—'}
                        </td>
                        <td style={{ padding: '2px 6px' }}>
                          {t.width !== null && t.height !== null
                            ? `${t.width}×${t.height}`
                            : '—'}
                        </td>
                        <td style={{ padding: '2px 6px' }}>
                          {t.qualityLimitationReason && t.qualityLimitationReason !== 'none'
                            ? t.qualityLimitationReason
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Medidor de áudio por participante */}
              {metrics.audioLevels && metrics.audioLevels.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ color: '#80848e', marginBottom: 4 }}>Nível de áudio</div>
                  {metrics.audioLevels.map((a) => {
                    const name =
                      participants.find((p) => p.identity === a.identity)?.name ?? a.identity
                    return (
                      <div
                        key={a.identity}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}
                      >
                        <span style={{ width: 120, color: '#dbdee1' }}>{name}</span>
                        <div
                          style={{
                            flex: 1,
                            height: 8,
                            background: '#2a2b2f',
                            borderRadius: 4,
                            overflow: 'hidden'
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, Math.max(0, a.level * 100))}%`,
                              height: '100%',
                              background: a.level > 0.05 ? '#3ba55d' : '#4e5058'
                            }}
                          />
                        </div>
                        <span style={{ width: 40, textAlign: 'right', color: '#80848e' }}>
                          {(a.level * 100).toFixed(0)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
