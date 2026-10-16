import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Activity, X } from 'lucide-react'
import { useAppStore } from '../store'
import {
  formatBitrate,
  formatMs,
  formatPercent,
  type NetworkHealth
} from '../media/metrics'
import { cx } from '../lib/utils'
import styles from './DebugMetricsPanel.module.css'

/**
 * Painel de métricas de depuração (Etapa 5) reapresentado como DRAWER
 * deslizante (lado direito), acessível por Ctrl+Shift+D ou botão discreto.
 *
 *  - badges coloridos pela saúde da rede (good/limited/poor)
 *  - mini-gráficos sparkline (SVG) de bitrate, perda e RTT
 *  - tabela limpa por track
 *  - medidor de áudio por participante
 *
 * Apenas apresentação: nenhum coletor/média de mídia foi alterado.
 */

const HEALTH_TONE: Record<NetworkHealth, string> = {
  good: styles.badgeGood ?? '',
  limited: styles.badgeLimited ?? '',
  poor: styles.badgePoor ?? ''
}

const HEALTH_LABEL: Record<NetworkHealth, string> = {
  good: 'Boa',
  limited: 'Limitada',
  poor: 'Ruim'
}

function directionLabel(direction: 'inbound' | 'outbound'): string {
  return direction === 'outbound' ? '↑ envia' : '↓ recebe'
}

/** Amostra histórica p/ sparklines (1 por segundo, janela de 60s). */
interface Sample {
  bitrate: number
  loss: number
  rtt: number
}

export function DebugMetricsPanel() {
  const metrics = useAppStore((s) => s.metrics)
  const open = useAppStore((s) => s.showMetrics)
  const toggle = useAppStore((s) => s.toggleShowMetrics)
  const participants = useAppStore((s) => s.participants)

  const [history, setHistory] = useState<Sample[]>([])

  // Coleta de histórico enquanto o drawer está aberto (só apresentação)
  useEffect(() => {
    if (!open) return
    const push = () => {
      const m = useAppStore.getState().metrics
      if (!m) return
      setHistory((h) => [
        ...h.slice(-59),
        {
          bitrate: m.tracks.reduce((sum, t) => sum + t.bitrateBps, 0),
          loss: m.worstLossRate,
          rtt: m.connection.rttMs ?? 0
        }
      ])
    }
    push()
    const id = window.setInterval(push, 1000)
    return () => window.clearInterval(id)
  }, [open])

  if (!open) return null

  return createPortal(
    <aside className={styles.drawer} role="dialog" aria-label="Métricas de depuração">
      <header className={styles.header}>
        <span className={styles.headerTitle}>
          <Activity size={16} /> Métricas de depuração
        </span>
        {metrics && (
          <span className={cx(styles.badge, HEALTH_TONE[metrics.health])}>
            ● {HEALTH_LABEL[metrics.health]}
          </span>
        )}
        <button className={styles.close} onClick={toggle} aria-label="Fechar métricas">
          <X size={16} />
        </button>
      </header>

      <div className={styles.body}>
        {!metrics && <p className={styles.muted}>Sem dados — entre em um canal de voz.</p>}

        {metrics && (
          <>
            {/* Resumo + sparklines */}
            <div className={styles.summary}>
              <div className={styles.stat}>
                <span className={styles.statLabel}>RTT</span>
                <strong className={styles.statValue}>
                  {metrics.connection.rttMs !== null ? formatMs(metrics.connection.rttMs) : '—'}
                </strong>
                <Sparkline data={history.map((h) => h.rtt)} color="var(--info)" />
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Perda</span>
                <strong className={styles.statValue}>{formatPercent(metrics.worstLossRate)}</strong>
                <Sparkline data={history.map((h) => h.loss)} color="var(--warning)" />
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Bitrate (envio)</span>
                <strong className={styles.statValue}>
                  {metrics.connection.availableOutgoingBps !== null
                    ? formatBitrate(metrics.connection.availableOutgoingBps)
                    : '—'}
                </strong>
                <Sparkline data={history.map((h) => h.bitrate)} color="var(--success)" />
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Jitter máx.</span>
                <strong className={styles.statValue}>{formatMs(metrics.maxJitterMs)}</strong>
                <Sparkline data={history.map((h) => h.rtt)} color="var(--text-link)" />
              </div>
            </div>

            {/* Tabela por track */}
            {metrics.tracks.length === 0 ? (
              <p className={styles.muted}>Aguardando primeira amostra…</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Track</th>
                    <th>Dir</th>
                    <th>Bitrate</th>
                    <th>Perda</th>
                    <th>Jitter</th>
                    <th>RTT</th>
                    <th>FPS</th>
                    <th>Resolução</th>
                    <th>Limite enc.</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.tracks.map((t) => (
                    <tr key={t.key}>
                      <td>{t.label ?? (t.kind === 'audio' ? 'Áudio' : 'Vídeo')}</td>
                      <td>{directionLabel(t.direction)}</td>
                      <td>{formatBitrate(t.bitrateBps)}</td>
                      <td className={t.lossRate > 0.05 ? styles.cellBad : undefined}>
                        {formatPercent(t.lossRate)}
                      </td>
                      <td>{formatMs(t.jitterMs)}</td>
                      <td>{t.rttMs !== null ? formatMs(t.rttMs) : '—'}</td>
                      <td>{t.fps !== null ? Math.round(t.fps) : '—'}</td>
                      <td>
                        {t.width !== null && t.height !== null
                          ? `${t.width}×${t.height}`
                          : '—'}
                      </td>
                      <td>
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
              <section className={styles.levels}>
                <h3 className={styles.sectionTitle}>Nível de áudio</h3>
                {metrics.audioLevels.map((a) => {
                  const name =
                    participants.find((p) => p.identity === a.identity)?.name ?? a.identity
                  const pct = Math.min(100, Math.max(0, a.level * 100))
                  return (
                    <div key={a.identity} className={styles.levelRow}>
                      <span className={styles.levelName}>{name}</span>
                      <div className={styles.levelTrack}>
                        <div
                          className={cx(
                            styles.levelFill,
                            a.level > 0.05 ? styles.levelHot : styles.levelIdle
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={styles.levelValue}>{pct.toFixed(0)}</span>
                    </div>
                  )
                })}
              </section>
            )}
          </>
        )}
      </div>
    </aside>,
    document.body
  )
}

/** Mini-gráfico sparkline em SVG leve (sem dependências). */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <span className={styles.sparkEmpty}>·</span>

  const width = 100
  const height = 28
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - 3 - ((v - min) / range) * (height - 6)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg className={styles.spark} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
