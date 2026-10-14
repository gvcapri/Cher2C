import { describe, it, expect } from 'vitest'
import {
  getAudioTrackConfig,
  validateAudioConfig,
  VOICE_MAX_BITRATE_BPS,
  SCREEN_AUDIO_MAX_BITRATE_BPS
} from './audioConfig'

describe('configuração de áudio — microfone (voz)', () => {
  const { capture, publish } = getAudioTrackConfig('microphone')

  it('mantém AEC/NS/AGC ligados para o mic', () => {
    expect(capture.echoCancellation).toBe(true)
    expect(capture.noiseSuppression).toBe(true)
    expect(capture.autoGainControl).toBe(true)
  })

  it('usa mono e DTX ligado (permitido p/ voz)', () => {
    expect(capture.channelCount).toBe(1)
    expect(publish.dtx).toBe(true)
  })

  it('habilita FEC/RED e prioridade alta de rede', () => {
    expect(publish.red).toBe(true)
    expect(publish.audioPreset?.priority).toBe('high')
    expect(publish.audioPreset?.maxBitrate).toBe(VOICE_MAX_BITRATE_BPS)
  })

  it('não força estéreo no mic', () => {
    expect(publish.forceStereo).toBe(false)
  })
})

describe('configuração de áudio — áudio da tela (transmissão)', () => {
  const { capture, publish } = getAudioTrackConfig('screenAudio')

  it('DESLIGA AEC/NS/AGC (preserva música/jogos)', () => {
    expect(capture.echoCancellation).toBe(false)
    expect(capture.noiseSuppression).toBe(false)
    expect(capture.autoGainControl).toBe(false)
  })

  it('DESLIGA DTX no áudio da tela (crítico)', () => {
    expect(publish.dtx).toBe(false)
  })

  it('habilita FEC/RED, estéreo e ~128 kbps', () => {
    expect(publish.red).toBe(true)
    expect(capture.channelCount).toBe(2)
    expect(publish.forceStereo).toBe(true)
    expect(publish.audioPreset?.maxBitrate).toBe(SCREEN_AUDIO_MAX_BITRATE_BPS)
  })

  it('protege o áudio da tela com prioridade alta', () => {
    expect(publish.audioPreset?.priority).toBe('high')
  })

  it('exclui o áudio do próprio app na captura (anti-eco, Chromium)', () => {
    expect(capture.restrictOwnAudio).toBe(true)
  })
})

describe('invariantes globais', () => {
  it('voz e áudio da tela usam configs DISTINTAS (tracks separados)', () => {
    const mic = getAudioTrackConfig('microphone')
    const screen = getAudioTrackConfig('screenAudio')
    expect(mic.capture).not.toEqual(screen.capture)
    expect(mic.publish).not.toEqual(screen.publish)
  })

  it('validateAudioConfig não aponta erro p/ nenhuma das configs', () => {
    expect(validateAudioConfig('microphone')).toEqual([])
    expect(validateAudioConfig('screenAudio')).toEqual([])
  })

  it('bitrate da tela é maior que o da voz', () => {
    expect(SCREEN_AUDIO_MAX_BITRATE_BPS).toBeGreaterThan(VOICE_MAX_BITRATE_BPS)
  })
})
