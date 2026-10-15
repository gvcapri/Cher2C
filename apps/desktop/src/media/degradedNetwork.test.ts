import { describe, it, expect } from 'vitest'
import {
  MetricsAggregator,
  classifyNetwork,
  computeLossRate,
  HEALTH_THRESHOLDS,
  type RawStat
} from './metrics'
import {
  planPublishBandwidth,
  selectSimulcastLayer,
  degradeToFit,
  DEFAULT_AUDIO_DEMAND
} from './bandwidth'
import { QUALITY_PRESETS } from './videoConfig'
import { VOICE_MAX_BITRATE_BPS, SCREEN_AUDIO_MAX_BITRATE_BPS } from './audioConfig'

/**
 * Testes de REDE DEGRADADA (Etapa 5):
 *  cenário padrão = 5% de perda de pacotes + 200 ms de RTT + banda limitada.
 *
 * Verificam que:
 *  1) as métricas DETECTAM a degradação (perda/RTT/saúde da rede);
 *  2) a política de banda PROTEGE o áudio mesmo com a banda caindo.
 */

const DEGRADED_RTT_MS = 200
const DEGRADED_LOSS = 0.05 // 5%
const T0 = 5_000_000
const DT = 1000

/** Gera amostras de inbound-rtp de áudio com a perda desejada no intervalo. */
function audioInboundWithLoss(opts: {
  ssrc: string
  bytesBase: number
  prevPackets: number
  prevLost: number
  intervalPackets: number
  loss: number
}): RawStat[] {
  const lost = Math.round(opts.intervalPackets * opts.loss)
  const received = opts.intervalPackets - lost
  return [
    {
      type: 'inbound-rtp',
      kind: 'audio',
      ssrc: opts.ssrc,
      bytesReceived: opts.bytesBase,
      packetsReceived: opts.prevPackets + received,
      packetsLost: opts.prevLost + lost,
      jitter: 0.04 // 40 ms — jitter elevado, compatível com rede degradada
    }
  ]
}

describe('Rede degradada — detecção pelas métricas', () => {
  it('reporta ~5% de perda quando 5% dos pacotes se perdem', () => {
    const agg = new MetricsAggregator()
    const ssrc = 'deg-a'
    // baseline
    agg.update(audioInboundWithLoss({ ssrc, bytesBase: 0, prevPackets: 0, prevLost: 0, intervalPackets: 1000, loss: 0 }), T0)
    // 1000 pacotes no intervalo, 5% perdidos
    const snap = agg.update(
      audioInboundWithLoss({
        ssrc,
        bytesBase: 40_000,
        prevPackets: 1000,
        prevLost: 0,
        intervalPackets: 1000,
        loss: DEGRADED_LOSS
      }),
      T0 + DT
    )
    expect(snap.tracks[0].lossRate).toBeCloseTo(DEGRADED_LOSS, 6)
    expect(snap.worstLossRate).toBeCloseTo(DEGRADED_LOSS, 6)
  })

  it('classifica 5% perda + 200 ms como rede LIMITADA (não boa, não crítica)', () => {
    expect(
      classifyNetwork({ lossRate: DEGRADED_LOSS, rttMs: DEGRADED_RTT_MS, jitterMs: 40 })
    ).toBe('limited')
    // e os limiares cobrem exatamente esse cenário
    expect(DEGRADED_LOSS).toBeLessThanOrEqual(HEALTH_THRESHOLDS.limited.lossRate)
    expect(DEGRADED_RTT_MS).toBeLessThanOrEqual(HEALTH_THRESHOLDS.limited.rttMs)
  })

  it('snapshot com RTT 200 ms no candidate-pair marca a saúde como limited', () => {
    const agg = new MetricsAggregator()
    const ssrc = 'deg-b'
    agg.update(
      [
        ...audioInboundWithLoss({ ssrc, bytesBase: 0, prevPackets: 0, prevLost: 0, intervalPackets: 500, loss: 0 }),
        { type: 'candidate-pair', state: 'succeeded', nominated: true, currentRoundTripTime: 0.2 }
      ],
      T0
    )
    const snap = agg.update(
      [
        ...audioInboundWithLoss({
          ssrc,
          bytesBase: 20_000,
          prevPackets: 500,
          prevLost: 0,
          intervalPackets: 1000,
          loss: DEGRADED_LOSS
        }),
        { type: 'candidate-pair', state: 'succeeded', nominated: true, currentRoundTripTime: 0.2 }
      ],
      T0 + DT
    )
    expect(snap.connection.rttMs).toBeCloseTo(DEGRADED_RTT_MS, 6)
    expect(snap.health).toBe('limited')
  })

  it('perda > 5% + 200 ms puxa a saúde para poor', () => {
    expect(classifyNetwork({ lossRate: 0.08, rttMs: DEGRADED_RTT_MS, jitterMs: 40 })).toBe('poor')
  })
})

describe('Rede degradada — política de banda protege o áudio', () => {
  it('cenário 200 kbps disponíveis: VÍDEO zera, áudio recebe tudo que há', () => {
    // Banda de upload caiu para 200 kbps (cenário degradado)
    const plan = planPublishBandwidth(200_000, QUALITY_PRESETS['1080p30'].videoMaxBitrateBps)
    expect(plan.videoBps).toBe(0)
    expect(plan.audioBps).toBe(200_000)
    expect(plan.videoConstrained).toBe(true)
  })

  it('cenário 1 Mbps: áudio integral (voz+áudio da tela), vídeo contido', () => {
    const plan = planPublishBandwidth(1_000_000, QUALITY_PRESETS['1080p30'].videoMaxBitrateBps)
    const audioTotal = VOICE_MAX_BITRATE_BPS + SCREEN_AUDIO_MAX_BITRATE_BPS
    expect(plan.audioBps).toBe(audioTotal)
    expect(plan.audioSafe).toBe(true)
    expect(plan.videoBps).toBe(1_000_000 - audioTotal)
    expect(plan.videoConstrained).toBe(true)
  })

  it('invariante: em QUALQUER banda degradada testada o áudio é servido antes do vídeo', () => {
    const degradations = [50_000, 150_000, 200_000, 400_000, 800_000, 1_000_000, 2_000_000]
    const preset = QUALITY_PRESETS['1080p30'].videoMaxBitrateBps
    const audioTotal = DEFAULT_AUDIO_DEMAND.voiceBps + DEFAULT_AUDIO_DEMAND.screenAudioBps
    for (const avail of degradations) {
      const plan = planPublishBandwidth(avail, preset)
      // 1) o áudio nunca financia o vídeo
      expect(plan.videoBps).toBeLessThanOrEqual(Math.max(0, avail - plan.audioBps))
      // 2) se há banda para o áudio todo, ele é integral
      if (avail >= audioTotal) {
        expect(plan.audioBps).toBe(audioTotal)
        expect(plan.audioSafe).toBe(true)
      } else {
        // senão, leva TODO o que existe (vídeo fica 0)
        expect(plan.audioBps).toBe(avail)
        expect(plan.videoBps).toBe(0)
      }
    }
  })

  it('com banda degradada, o espectador cai para camadas menores de simulcast', () => {
    const layers = QUALITY_PRESETS['1080p30'].allLayers
    // rede boa → 1080
    expect(selectSimulcastLayer(3_000_000, layers)?.height).toBe(1080)
    // degradação → cai para 540/360, nunca mantém 1080 sem banda
    // 900k*0.8=720k >= 600k (L540) => 540
    expect(selectSimulcastLayer(900_000, layers)?.height).toBe(540)
    // 400k*0.8=320k >= 300k (L360) => 360
    expect(selectSimulcastLayer(400_000, layers)?.height).toBe(360)
  })

  it('degradeToFit reduz resolução/fps na queda de banda sem tocar no áudio', () => {
    const ladder = [
      { height: 1080, fps: 60, minBitrateBps: 2_000_000 },
      { height: 1080, fps: 30, minBitrateBps: 1_500_000 },
      { height: 720, fps: 30, minBitrateBps: 1_000_000 },
      { height: 360, fps: 15, minBitrateBps: 250_000 }
    ]
    // queda progressiva da BWE durante a degradção
    expect(degradeToFit(2_500_000, ladder)?.fps).toBe(60)
    expect(degradeToFit(1_600_000, ladder)?.fps).toBe(30)
    // 720@30 exige 1 M; com 900k cai até 360 (1080@30 exige 1.5 M)
    expect(degradeToFit(1_100_000, ladder)?.height).toBe(720)
    expect(degradeToFit(900_000, ladder)?.height).toBe(360)
    expect(degradeToFit(300_000, ladder)?.height).toBe(360)
  })

  it('5% de perda com perda "limpa" zero: computeLossRate coerente (sanidade)', () => {
    // 50 perdidos a cada 950 recebidos ≈ 5%
    expect(computeLossRate(50, 950)).toBeCloseTo(0.05, 6)
  })
})
