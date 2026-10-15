import { describe, it, expect } from 'vitest'
import {
  planPublishBandwidth,
  selectSimulcastLayer,
  degradeToFit,
  DEFAULT_AUDIO_DEMAND
} from './bandwidth'
import { QUALITY_PRESETS } from './videoConfig'

const AUDIO_DEMAND_TOTAL =
  DEFAULT_AUDIO_DEMAND.voiceBps + DEFAULT_AUDIO_DEMAND.screenAudioBps

describe('planPublishBandwidth — proteção do áudio', () => {
  it('reserva o áudio ANTES do vídeo (prioridade absoluta)', () => {
    const plan = planPublishBandwidth(5_000_000, 2_500_000)
    // Áudio financiado integralmente
    expect(plan.audioBps).toBe(AUDIO_DEMAND_TOTAL)
    expect(plan.audioSafe).toBe(true)
    // Vídeo recebe o que sobra, limitado ao preset
    expect(plan.videoBps).toBe(2_500_000)
    expect(plan.videoConstrained).toBe(false)
  })

  it('com banda apertada, o ÁUDIO segue integral e o VÍDEO degrada', () => {
    // Só 1.5 Mbps: áudio (~240k) fica inteiro; vídeo recebe o resto
    const plan = planPublishBandwidth(1_500_000, 2_500_000)
    expect(plan.audioBps).toBe(AUDIO_DEMAND_TOTAL)
    expect(plan.audioSafe).toBe(true)
    expect(plan.videoBps).toBe(1_500_000 - AUDIO_DEMAND_TOTAL)
    expect(plan.videoConstrained).toBe(true)
  })

  it('banda extremamente baixa: vídeo ZERA, áudio ainda é protegido primeiro', () => {
    const plan = planPublishBandwidth(200_000, 2_500_000)
    // áudio recebe o que dá (limitado pela disponibilidade), vídeo 0
    expect(plan.videoBps).toBe(0)
    expect(plan.audioBps).toBe(200_000)
    expect(plan.audioSafe).toBe(false) // nem o áudio coube inteiro
    expect(plan.videoConstrained).toBe(true)
  })

  it('nunca financia vídeo às custas do áudio (invariante)', () => {
    for (const avail of [100_000, 300_000, 1_000_000, 3_000_000, 10_000_000]) {
      const plan = planPublishBandwidth(avail, 2_500_000)
      // Se há banda p/ áudio + vídeo, o áudio é coberto primeiro
      if (avail >= AUDIO_DEMAND_TOTAL) {
        expect(plan.audioBps).toBe(AUDIO_DEMAND_TOTAL)
        expect(plan.audioSafe).toBe(true)
      }
      // vídeo nunca excede o que sobra após o áudio
      expect(plan.videoBps).toBeLessThanOrEqual(Math.max(0, avail - plan.audioBps))
    }
  })
})

describe('selectSimulcastLayer — qualidade do espectador', () => {
  const layers = QUALITY_PRESETS['1080p30'].allLayers // [360, 540, 1080]

  it('escolhe a MAIOR camada que couber na banda (com margem de 20%)', () => {
    // 1080p minBitrate=1.6M; precisa de 1.6M/0.8 = 2M de banda p/ escolher 1080
    expect(selectSimulcastLayer(3_000_000, layers)?.height).toBe(1080)
    // 540 minBitrate=600k; 1M*0.8=800k >= 600k => 540
    expect(selectSimulcastLayer(1_000_000, layers)?.height).toBe(540)
    // 360 minBitrate=300k; 500k*0.8=400k >= 300k => 360
    expect(selectSimulcastLayer(500_000, layers)?.height).toBe(360)
  })

  it('retorna a menor camada quando a banda é curta mas suficiente', () => {
    expect(selectSimulcastLayer(400_000, layers)?.height).toBe(360)
  })

  it('retorna null se nenhuma camada couber (banda pífia)', () => {
    // 100k*0.8=80k < 300k (menor camada) => null
    expect(selectSimulcastLayer(100_000, layers)).toBeNull()
  })

  it('não depende da ordem das camadas de entrada', () => {
    const reversed = [...layers].reverse()
    expect(selectSimulcastLayer(1_000_000, reversed)?.height).toBe(540)
  })
})

describe('degradeToFit — reduz resolução/fps até caber (sem tocar no áudio)', () => {
  const ladder = [
    { height: 1080, fps: 30, minBitrateBps: 2_000_000 },
    { height: 720, fps: 30, minBitrateBps: 1_200_000 },
    { height: 480, fps: 15, minBitrateBps: 400_000 },
    { height: 360, fps: 15, minBitrateBps: 250_000 }
  ]

  it('mantém 1080 quando há banda', () => {
    expect(degradeToFit(3_000_000, ladder)?.height).toBe(1080)
  })

  it('cai p/ 720 quando 1080 não cabe', () => {
    expect(degradeToFit(1_500_000, ladder)?.height).toBe(720)
  })

  it('cai até 360 em banda mínima', () => {
    expect(degradeToFit(300_000, ladder)?.height).toBe(360)
  })

  it('retorna null (vídeo off) se nada couber', () => {
    expect(degradeToFit(50_000, ladder)).toBeNull()
  })
})
