import { Wifi, WifiOff } from 'lucide-react'
import { useAppStore } from '../../store'
import { cx, formatMs, formatPercent } from '../../lib/utils'
import { Tooltip } from '../ui'
import styles from './call.module.css'

/**
 * Indicador de qualidade da conexão usando a classificação good/limited/poor
 * que já existe nas métricas (metrics.ts). Tooltip mostra RTT e perda.
 */
export function ConnectionIndicator() {
  const metrics = useAppStore((s) => s.metrics)
  const connState = useAppStore((s) => s.connectionState)

  if (!metrics || connState !== 'connected') {
    return (
      <span className={cx(styles.conn, styles.connOffline)}>
        <WifiOff size={14} /> Sem dados
      </span>
    )
  }

  const { health, connection, worstLossRate } = metrics
  const tone =
    health === 'good' ? styles.connGood : health === 'limited' ? styles.connLimited : styles.connPoor
  const label = health === 'good' ? 'Boa' : health === 'limited' ? 'Limitada' : 'Ruim'

  const tip = [
    `RTT: ${connection.rttMs !== null ? formatMs(connection.rttMs) : '—'}`,
    `Perda: ${formatPercent(worstLossRate)}`,
    connection.availableOutgoingBps
      ? `Banda: ${Math.round(connection.availableOutgoingBps / 1000)} kbps`
      : null
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Tooltip label={tip}>
      <span className={cx(styles.conn, tone)} role="status">
        <Wifi size={14} /> {label}
      </span>
    </Tooltip>
  )
}
