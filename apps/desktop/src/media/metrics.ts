/**
 * Etapa 5 — Métricas de depuração: bitrate, perda de pacotes, jitter, RTT,
 * fps, resolução e nível de áudio.
 *
 * Módulo PURO: opera sobre entradas BRUTAS de RTCStats (objetos
 * `Record<string, unknown>` com campo `type`), sem depender de `RTCStatsReport`,
 * navegador ou LiveKit. O coletor (voiceCall.ts) lê os relatórios dos
 * senders/receivers e entrega os entries aqui — os cálculos são testáveis offline.
 */

export type RawStat = Record<string, unknown>

/** Saúde da rede derivada de perda/RTT/jitter (para a UI de depuração). */
export type NetworkHealth = 'good' | 'limited' | 'poor'

export interface TrackMetrics {
  /** identificador estável da track (ssrc) */
  key: string
  direction: 'inbound' | 'outbound'
  kind: 'audio' | 'video'
  /** rótulo amigável da fonte (ex.: "Microfone"), quando conhecido */
  label?: string
  /** bitrate no último intervalo de amostragem (bits/s) */
  bitrateBps: number
  /** fração de pacotes perdidos no intervalo (0..1) */
  lossRate: number
  /** jitter (ms) */
  jitterMs: number
  /** RTT reportado pelo par remoto (ms), tracks enviadas */
  rttMs: number | null
  /** frames por segundo (vídeo) */
  fps: number | null
  width: number | null
  height: number | null
  /** nível de áudio 0..1 (áudio recebido), quando disponível */
  audioLevel: number | null
  /** limitação de qualidade no encoder ('none' | 'cpu' | 'bandwidth') */
  qualityLimitationReason: string | null
}

export interface ConnectionMetrics {
  /** RTT da via (candidate-pair) em ms */
  rttMs: number | null
  /** banda de saída estimada pelo navegador (bits/s) */
  availableOutgoingBps: number | null
}

export interface MetricsSnapshot {
  timestamp: number
  health: NetworkHealth
  connection: ConnectionMetrics
  /** maior taxa de perda entre as tracks (0..1) */
  worstLossRate: number
  /** maior jitter entre as tracks (ms) */
  maxJitterMs: number
  tracks: TrackMetrics[]
  /** nível de áudio por participante (0..1) — preenchido pelo coletor */
  audioLevels?: Array<{ identity: string; level: number }>
}

export interface HealthInput {
  /** fração 0..1 */
  lossRate: number
  rttMs: number | null
  jitterMs: number
}

/**
 * Limiares de saúde da rede:
 *  - good:    perda ≤ 1%,  RTT ≤ 100 ms, jitter ≤ 30 ms
 *  - limited: perda ≤ 5%,  RTT ≤ 250 ms, jitter ≤ 100 ms
 *  - poor:    acima disso
 *
 * (5% de perda + 200 ms de RTT — cenário de teste da Etapa 5 — cai em `limited`.)
 */
export const HEALTH_THRESHOLDS = {
  good: { lossRate: 0.01, rttMs: 100, jitterMs: 30 },
  limited: { lossRate: 0.05, rttMs: 250, jitterMs: 100 }
} as const

export function classifyNetwork(input: HealthInput): NetworkHealth {
  const rtt = input.rttMs ?? 0 // sem RTT medido → não penaliza
  const jitter = input.jitterMs ?? 0
  const { good, limited } = HEALTH_THRESHOLDS
  if (input.lossRate <= good.lossRate && rtt <= good.rttMs && jitter <= good.jitterMs) {
    return 'good'
  }
  if (
    input.lossRate <= limited.lossRate &&
    rtt <= limited.rttMs &&
    jitter <= limited.jitterMs
  ) {
    return 'limited'
  }
  return 'poor'
}

/** Bitrate (bits/s) a partir de uma variação de bytes em um intervalo (ms). */
export function computeBitrateBps(bytesDelta: number, elapsedMs: number): number {
  if (elapsedMs <= 0 || bytesDelta <= 0) return 0
  return Math.round((bytesDelta * 8 * 1000) / elapsedMs)
}

/** Fração de pacotes perdidos (0..1) a partir das variações no intervalo. */
export function computeLossRate(lostDelta: number, receivedDelta: number): number {
  const lost = Math.max(0, lostDelta)
  const total = lost + Math.max(0, receivedDelta)
  if (total <= 0) return 0
  return Math.min(1, lost / total)
}

// ---------------------------------------------------------------------------
// helpers de leitura segura dos stats brutos
// ---------------------------------------------------------------------------

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

interface TrackAccum {
  key: string
  ssrc: string | null
  direction: 'inbound' | 'outbound'
  kind: 'audio' | 'video'
  trackIdentifier: string | null
  bytes: number | null
  packets: number | null
  lost: number | null
  jitterMs: number | null
  fps: number | null
  width: number | null
  height: number | null
  audioLevel: number | null
  qualityLimitationReason: string | null
  rttMs: number | null
  lossOverride: number | null
}

interface PrevCounter {
  bytes: number
  packets: number
  lost: number
  at: number
}

/**
 * Agrega amostras de RTCStats ao longo do tempo e produz um snapshot com
 * bitrate/perda calculados por diferença entre amostras.
 *
 * Uso: `update(entries, Date.now(), labels?)` a cada intervalo de coleta.
 */
export class MetricsAggregator {
  private prev = new Map<string, PrevCounter>()

  /** Zera o histórico (ex.: ao desconectar da chamada). */
  reset(): void {
    this.prev.clear()
  }

  update(
    entries: ReadonlyArray<RawStat>,
    nowMs: number,
    labels?: ReadonlyMap<string, string>
  ): MetricsSnapshot {
    // Fase 1: feedback do par remoto (remote-inbound-rtp) e candidatos de via
    const remoteRttBySsrc = new Map<string, number>()
    const remoteLossBySsrc = new Map<string, number>()
    let connRttMs: number | null = null
    let connOutgoingBps: number | null = null

    for (const raw of entries) {
      const type = str(raw.type)
      if (type === 'candidate-pair') {
        const active =
          str(raw.state) === 'succeeded' || raw.nominated === true || raw.selected === true
        const rtt = num(raw.currentRoundTripTime)
        if (rtt !== null && (active || connRttMs === null)) connRttMs = rtt * 1000
        const abr = num(raw.availableOutgoingBitrate)
        if (abr !== null && (active || connOutgoingBps === null)) connOutgoingBps = abr
      } else if (type === 'remote-inbound-rtp') {
        const ssrc = raw.ssrc
        if (ssrc === undefined || ssrc === null) continue
        const key = String(ssrc)
        const rtt = num(raw.roundTripTime)
        if (rtt !== null) remoteRttBySsrc.set(key, rtt * 1000)
        let frac = num(raw.fractionLost)
        if (frac !== null) {
          // Algumas implementações reportam 0..255 em vez de 0..1
          if (frac > 1) frac = frac / 255
          remoteLossBySsrc.set(key, clamp01(frac))
        }
      }
    }

    // Fase 2: acumula as tracks RTP
    const accum = new Map<string, TrackAccum>()
    const ensure = (
      key: string,
      direction: 'inbound' | 'outbound',
      kind: 'audio' | 'video'
    ): TrackAccum => {
      let a = accum.get(key)
      if (!a) {
        a = {
          key,
          ssrc: null,
          direction,
          kind,
          trackIdentifier: null,
          bytes: null,
          packets: null,
          lost: null,
          jitterMs: null,
          fps: null,
          width: null,
          height: null,
          audioLevel: null,
          qualityLimitationReason: null,
          rttMs: null,
          lossOverride: null
        }
        accum.set(key, a)
      }
      return a
    }

    for (const raw of entries) {
      const type = str(raw.type)
      if (type !== 'inbound-rtp' && type !== 'outbound-rtp') continue

      const inbound = type === 'inbound-rtp'
      const kind: 'audio' | 'video' = str(raw.kind) === 'video' ? 'video' : 'audio'
      const ssrcVal = raw.ssrc ?? raw.trackIdentifier ?? raw.id
      if (ssrcVal === undefined || ssrcVal === null) continue
      const key = `${inbound ? 'in' : 'out'}:${String(ssrcVal)}`
      const a = ensure(key, inbound ? 'inbound' : 'outbound', kind)
      a.ssrc = raw.ssrc !== undefined && raw.ssrc !== null ? String(raw.ssrc) : null
      a.trackIdentifier = str(raw.trackIdentifier)

      if (inbound) {
        a.bytes = num(raw.bytesReceived)
        a.packets = num(raw.packetsReceived)
        a.lost = num(raw.packetsLost)
        const jitter = num(raw.jitter) // segundos
        if (jitter !== null) a.jitterMs = jitter * 1000
        if (kind === 'audio') a.audioLevel = num(raw.audioLevel)
      } else {
        a.bytes = num(raw.bytesSent)
        a.packets = num(raw.packetsSent)
        a.lost = null
        a.qualityLimitationReason = str(raw.qualityLimitationReason)
        if (a.ssrc !== null) {
          const rtt = remoteRttBySsrc.get(a.ssrc)
          if (rtt !== undefined) a.rttMs = rtt
          const loss = remoteLossBySsrc.get(a.ssrc)
          if (loss !== undefined) a.lossOverride = loss
        }
      }

      const fps = num(raw.framesPerSecond)
      if (fps !== null) a.fps = fps
      const w = num(raw.frameWidth)
      if (w !== null) a.width = w
      const h = num(raw.frameHeight)
      if (h !== null) a.height = h
    }

    // Fase 3: diferenças entre amostras → bitrate/perda; atualiza baseline
    const tracks: TrackMetrics[] = []
    for (const a of accum.values()) {
      const prev = this.prev.get(a.key)
      let bitrateBps = 0
      let lossRate = 0

      if (prev) {
        const dt = nowMs - prev.at
        if (a.bytes !== null && dt > 0) {
          const dB = a.bytes - prev.bytes
          if (dB >= 0) bitrateBps = computeBitrateBps(dB, dt)
          // dB < 0 → contadores reiniciaram (track recriada); re-baseline abaixo
        }
        if (
          a.direction === 'inbound' &&
          a.packets !== null &&
          prev.packets !== null &&
          dt > 0
        ) {
          const dRecv = a.packets - prev.packets
          if (dRecv >= 0) {
            lossRate = computeLossRate((a.lost ?? 0) - prev.lost, dRecv)
          }
        }
      }
      if (a.lossOverride !== null) lossRate = a.lossOverride

      const label =
        (a.trackIdentifier !== null ? labels?.get(a.trackIdentifier) : undefined) ?? undefined

      tracks.push({
        key: a.key,
        direction: a.direction,
        kind: a.kind,
        label,
        bitrateBps,
        lossRate,
        jitterMs: a.jitterMs ?? 0,
        rttMs: a.rttMs,
        fps: a.fps,
        width: a.width,
        height: a.height,
        audioLevel: a.audioLevel,
        qualityLimitationReason: a.qualityLimitationReason
      })

      if (a.bytes !== null) {
        this.prev.set(a.key, {
          bytes: a.bytes,
          packets: a.packets ?? 0,
          lost: a.lost ?? 0,
          at: nowMs
        })
      }
    }

    // Fase 4: agregados de conexão + saúde da rede
    let worstLossRate = 0
    let maxJitterMs = 0
    let maxTrackRttMs = 0
    for (const t of tracks) {
      if (t.lossRate > worstLossRate) worstLossRate = t.lossRate
      if (t.jitterMs > maxJitterMs) maxJitterMs = t.jitterMs
      if (t.rttMs !== null && t.rttMs > maxTrackRttMs) maxTrackRttMs = t.rttMs
    }
    const rttMs = connRttMs ?? (maxTrackRttMs > 0 ? maxTrackRttMs : null)

    return {
      timestamp: nowMs,
      health: classifyNetwork({
        lossRate: worstLossRate,
        rttMs,
        jitterMs: maxJitterMs
      }),
      connection: { rttMs, availableOutgoingBps: connOutgoingBps },
      worstLossRate,
      maxJitterMs,
      tracks
    }
  }
}

// ---------------------------------------------------------------------------
// formatação p/ UI de depuração
// ---------------------------------------------------------------------------

export function formatBitrate(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`
  if (bps >= 1000) return `${Math.round(bps / 1000)} kbps`
  return `${Math.round(bps)} bps`
}

export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`
}

export function formatMs(ms: number): string {
  return `${Math.round(ms)} ms`
}
