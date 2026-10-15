import { describe, it, expect } from 'vitest'
import {
  QUALITY_PRESETS,
  QUALITY_PRESET_ORDER,
  degradationForContent,
  getScreenSharePlan,
  getScreenShareCaptureOptions
} from './videoConfig'
import { SCREEN_AUDIO_MAX_BITRATE_BPS } from './audioConfig'

describe('presets de qualidade', () => {
  it('contém os 3 presets pedidos', () => {
    expect(QUALITY_PRESET_ORDER).toEqual(['720p30', '1080p30', '1080p60'])
  })

  it('bitrate de vídeo cresce com a qualidade', () => {
    expect(QUALITY_PRESETS['720p30'].videoMaxBitrateBps).toBeLessThan(
      QUALITY_PRESETS['1080p30'].videoMaxBitrateBps
    )
    expect(QUALITY_PRESETS['1080p30'].videoMaxBitrateBps).toBeLessThan(
      QUALITY_PRESETS['1080p60'].videoMaxBitrateBps
    )
  })

  it('1080p60 usa 60fps e 720p30 usa 30fps', () => {
    expect(QUALITY_PRESETS['1080p60'].fps).toBe(60)
    expect(QUALITY_PRESETS['720p30'].fps).toBe(30)
  })

  it('cada preset tem 3 camadas de simulcast (primária + 2 adicionais)', () => {
    for (const id of QUALITY_PRESET_ORDER) {
      const p = QUALITY_PRESETS[id]
      expect(p.simulcastLayers.length).toBe(2) // adicionais
      expect(p.allLayers.length).toBe(3) // total
      // ordenadas low -> high
      expect(p.allLayers[0].minBitrateBps).toBeLessThan(p.allLayers[2].minBitrateBps)
    }
  })
})

describe('contentHint -> degradationPreference', () => {
  it('detail (texto/código) prioriza nitidez (maintain-resolution)', () => {
    expect(degradationForContent('detail')).toBe('maintain-resolution')
  })

  it('motion (jogos) prioriza fluidez (maintain-framerate)', () => {
    expect(degradationForContent('motion')).toBe('maintain-framerate')
  })
})

describe('plano de screen share', () => {
  const plan = getScreenSharePlan('1080p30', 'motion')

  it('aplica degradation do contentHint', () => {
    expect(plan.degradationPreference).toBe('maintain-framerate')
  })

  it('vídeo fica em prioridade MÉDIA (abaixo do áudio)', () => {
    expect(plan.videoEncoding.priority).toBe('medium')
  })

  it('áudio da tela: DTX OFF, estéreo, ~128k (teto com folga), prioridade ALTA', () => {
    expect(plan.audioPublish.dtx).toBe(false)
    expect(plan.audioPublish.forceStereo).toBe(true)
    expect(plan.audioPublish.audioPreset.priority).toBe('high')
    // maxBitrate é o TETO do encoder; precisa cobrir o alvo ~128 kbps com folga
    expect(plan.audioPublish.audioPreset.maxBitrate).toBe(SCREEN_AUDIO_MAX_BITRATE_BPS)
    expect(plan.audioPublish.audioPreset.maxBitrate).toBeGreaterThanOrEqual(128_000)
  })
})

describe('opções de captura do screen share', () => {
  const capture = getScreenShareCaptureOptions(getScreenSharePlan(), 'window')

  it('áudio da tela herda AEC/NS/AGC OFF + restrictOwnAudio (anti-eco)', () => {
    expect(capture.audio).toBeTypeOf('object')
    const audio = capture.audio as Record<string, unknown>
    expect(audio.echoCancellation).toBe(false)
    expect(audio.noiseSuppression).toBe(false)
    expect(audio.autoGainControl).toBe(false)
    expect(audio.restrictOwnAudio).toBe(true)
  })

  it('inclui contentHint e displaySurface', () => {
    expect(capture.contentHint).toBe('detail')
    expect(capture.video).toEqual({ displaySurface: 'window' })
    expect(capture.systemAudio).toBe('include')
  })
})
