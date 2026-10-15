import { describe, it, expect } from 'vitest'
import {
  MetricsAggregator,
  classifyNetwork,
  computeBitrateBps,
  computeLossRate,
  formatBitrate,
  formatPercent,
  formatMs,
  HEALTH_THRESHOLDS,
  type RawStat
} from './metrics'

/** Simula um stat de inbound-rtp (recepção). */
function inbound(p: Partial<RawStat> & { ssrc: string }): RawStat {
  return { type: 'inbound-rtp', kind: 'audio', ...p }
}

/** Simula um stat de outbound-rtp (envio). */
function outbound(p: Partial<RawStat> & { ssrc: string }): RawStat {
  return { type: 'outbound-rtp', kind: 'audio', ...p }
}

describe('computeBitrateBps', () => {
  it('converte variação de bytes em bits/s', () => {
    // 250_000 bytes em 1000ms => 2_000_000 bps
    expect(computeBitrateBps(250_000, 1000)).toBe(2_000_000)
  })

  it('retorna 0 para intervalo inválido ou delta não positivo', () => {
    expect(computeBitrateBps(1000, 0)).toBe(0)
    expect(computeBitrateBps(1000, -5)).toBe(0)
    expect(computeBitrateBps(0, 1000)).toBe(0)
  })
})

describe('computeLossRate', () => {
  it('calcula a fração perdida sobre o total', () => {
    expect(computeLossRate(5, 95)).toBeCloseTo(0.05, 6)
    expect(computeLossRate(0, 100)).toBe(0)
  })

  it('satura em 1 e ignora deltas negativos (reset de contadores)', () => {
    expect(computeLossRate(10, 0)).toBe(1)
    expect(computeLossRate(-3, 100)).toBe(0)
  })
})

describe('classifyNetwork — saúde da rede', () => {
  it('boa rede: perda 0.5%, RTT 40ms, jitter 10ms', () => {
    expect(classifyNetwork({ lossRate: 0.005, rttMs: 40, jitterMs: 10 })).toBe('good')
  })

  it('cenário de teste da Etapa 5 (5% perda, 200ms) => limited', () => {
    expect(
      classifyNetwork({
        lossRate: 0.05,
        rttMs: 200,
        jitterMs: HEALTH_THRESHOLDS.limited.jitterMs
      })
    ).toBe('limited')
  })

  it('perda acima de 5% => poor', () => {
    expect(classifyNetwork({ lossRate: 0.06, rttMs: 200, jitterMs: 40 })).toBe('poor')
  })

  it('RTT ausente não penaliza; jitter alto degrada', () => {
    expect(classifyNetwork({ lossRate: 0.001, rttMs: null, jitterMs: 10 })).toBe('good')
    expect(classifyNetwork({ lossRate: 0.001, rttMs: 40, jitterMs: 120 })).toBe('poor')
  })
})

describe('MetricsAggregator', () => {
  const T0 = 1_000_000
  const DT = 1000

  it('primeira amostra não tem baseline (bitrate 0)', () => {
    const agg = new MetricsAggregator()
    const snap = agg.update([inbound({ ssrc: 'a', bytesReceived: 10_000, packetsReceived: 10 })], T0)
    expect(snap.tracks).toHaveLength(1)
    expect(snap.tracks[0].bitrateBps).toBe(0)
    expect(snap.tracks[0].lossRate).toBe(0)
  })

  it('calcula bitrate por diferença entre amostras', () => {
    const agg = new MetricsAggregator()
    agg.update([inbound({ ssrc: 'a', bytesReceived: 0, packetsReceived: 0 })], T0)
    // +250 KB em 1s => 2 Mbps
    const snap = agg.update(
      [inbound({ ssrc: 'a', bytesReceived: 250_000, packetsReceived: 100 })],
      T0 + DT
    )
    expect(snap.tracks[0].bitrateBps).toBe(2_000_000)
  })

  it('calcula perda de pacotes inbound entre amostras', () => {
    const agg = new MetricsAggregator()
    agg.update(
      [inbound({ ssrc: 'a', bytesReceived: 0, packetsReceived: 0, packetsLost: 0 })],
      T0
    )
    // 5 perdidos + 95 recebidos = 5%
    const snap = agg.update(
      [inbound({ ssrc: 'a', bytesReceived: 10_000, packetsReceived: 95, packetsLost: 5 })],
      T0 + DT
    )
    expect(snap.tracks[0].lossRate).toBeCloseTo(0.05, 6)
    expect(snap.worstLossRate).toBeCloseTo(0.05, 6)
    expect(snap.health).toBe('limited')
  })

  it('extrai jitter (segundos → ms), fps e resolução', () => {
    const agg = new MetricsAggregator()
    const snap = agg.update(
      [
        inbound({
          ssrc: 'v',
          kind: 'video',
          jitter: 0.02, // 20 ms
          framesPerSecond: 29.7,
          frameWidth: 1280,
          frameHeight: 720
        })
      ],
      T0
    )
    const t = snap.tracks[0]
    expect(t.kind).toBe('video')
    expect(t.jitterMs).toBeCloseTo(20, 6)
    expect(t.fps).toBeCloseTo(29.7, 5)
    expect(t.width).toBe(1280)
    expect(t.height).toBe(720)
  })

  it('extrai nível de áudio do inbound de áudio', () => {
    const agg = new MetricsAggregator()
    const snap = agg.update([inbound({ ssrc: 'a', audioLevel: 0.42 })], T0)
    expect(snap.tracks[0].audioLevel).toBeCloseTo(0.42, 6)
  })

  it('lê RTT e banda de saída do candidate-pair (via ativa)', () => {
    const agg = new MetricsAggregator()
    const snap = agg.update(
      [
        {
          type: 'candidate-pair',
          state: 'succeeded',
          nominated: true,
          currentRoundTripTime: 0.2, // 200 ms
          availableOutgoingBitrate: 1_200_000
        }
      ],
      T0
    )
    expect(snap.connection.rttMs).toBeCloseTo(200, 6)
    expect(snap.connection.availableOutgoingBps).toBe(1_200_000)
  })

  it('lê RTT do remote-inbound-rtp para tracks enviadas', () => {
    const agg = new MetricsAggregator()
    const snap = agg.update(
      [
        outbound({ ssrc: 'x', bytesSent: 5000, packetsSent: 20 }),
        { type: 'remote-inbound-rtp', ssrc: 'x', roundTripTime: 0.18, fractionLost: 0.02 }
      ],
      T0
    )
    const t = snap.tracks[0]
    expect(t.direction).toBe('outbound')
    expect(t.rttMs).toBeCloseTo(180, 6)
    expect(t.lossRate).toBeCloseTo(0.02, 6)
  })

  it('distingue tracks enviadas e recebidas (chaves separadas)', () => {
    const agg = new MetricsAggregator()
    const snap = agg.update(
      [inbound({ ssrc: 'same', bytesReceived: 100 }), outbound({ ssrc: 'same', bytesSent: 100 })],
      T0
    )
    expect(snap.tracks).toHaveLength(2)
    const dirs = snap.tracks.map((t) => t.direction).sort()
    expect(dirs).toEqual(['inbound', 'outbound'])
  })

  it('re-baseline quando os contadores reiniciam (delta negativo)', () => {
    const agg = new MetricsAggregator()
    agg.update([inbound({ ssrc: 'a', bytesReceived: 500_000, packetsReceived: 100 })], T0)
    // contadores zeraram (track recriada) → não pode virar bitrate negativo/huge
    const snap = agg.update(
      [inbound({ ssrc: 'a', bytesReceived: 1_000, packetsReceived: 2 })],
      T0 + DT
    )
    expect(snap.tracks[0].bitrateBps).toBe(0)
    // próxima amostra volta a medir a partir do novo baseline
    const snap2 = agg.update(
      [inbound({ ssrc: 'a', bytesReceived: 251_000, packetsReceived: 102 })],
      T0 + 2 * DT
    )
    expect(snap2.tracks[0].bitrateBps).toBe(2_000_000)
  })

  it('aplica rótulos amigáveis via trackIdentifier', () => {
    const agg = new MetricsAggregator()
    const labels = new Map([['tid-1', 'Microfone']])
    const snap = agg.update(
      [inbound({ ssrc: 'a', trackIdentifier: 'tid-1', bytesReceived: 10 })],
      T0,
      labels
    )
    expect(snap.tracks[0].label).toBe('Microfone')
  })

  it('reset() limpa a baseline', () => {
    const agg = new MetricsAggregator()
    agg.update([inbound({ ssrc: 'a', bytesReceived: 100_000, packetsReceived: 50 })], T0)
    agg.reset()
    const snap = agg.update(
      [inbound({ ssrc: 'a', bytesReceived: 350_000, packetsReceived: 100 })],
      T0 + DT
    )
    expect(snap.tracks[0].bitrateBps).toBe(0) // sem baseline → 0, não 2 Mbps
  })
})

describe('formatação para a UI', () => {
  it('formatBitrate', () => {
    expect(formatBitrate(2_000_000)).toBe('2.00 Mbps')
    expect(formatBitrate(64_000)).toBe('64 kbps')
    expect(formatBitrate(500)).toBe('500 bps')
  })
  it('formatPercent e formatMs', () => {
    expect(formatPercent(0.05)).toBe('5.0%')
    expect(formatMs(199.6)).toBe('200 ms')
  })
})
