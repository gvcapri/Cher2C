import type { AudioCaptureOptions, TrackPublishOptions } from 'livekit-client'

/**
 * Configuração de áudio do Cher2C.
 *
 * REGRAS DE OURO (Etapa 1):
 *  1. Voz (mic) e áudio da tela são tracks SEPARADOS, nunca misturados.
 *  2. Codec Opus com FEC (RED) ligado nos dois.
 *  3. DTX apenas p/ VOZ. NO áudio da tela DTX fica DESLIGADO (música/jogos).
 *  4. Áudio da tela: AEC/NS/AGC DESLIGADOS (destruem música/efeitos).
 *     Mic: AEC/NS/AGC LIGADOS.
 *  5. Bitrate: ~64 kbps voz (mono), ~128 kbps tela (estéreo).
 *  6. Prioridade de rede ALTA p/ áudio (protegido acima do vídeo).
 *
 * Este módulo é puro (sem efeitos colaterais / sem DOM) p/ ser unit-testável.
 */

export type AudioTrackKind = 'microphone' | 'screenAudio'

export interface AudioTrackConfig {
  /** Opções de captura (getUserMedia / displayMedia) */
  capture: AudioCaptureOptions
  /** Opções de publicação (encoding, DTX, RED/FEC, bitrate, prioridade) */
  publish: TrackPublishOptions
}

/** Bitrate alvo de voz (mono) — requisito ~64 kbps */
export const VOICE_TARGET_BITRATE_BPS = 64_000
/** Bitrate alvo do áudio da tela (estéreo) — requisito ~128 kbps */
export const SCREEN_AUDIO_TARGET_BITRATE_BPS = 128_000
/** Bitrate máximo p/ voz (folga acima do alvo) */
export const VOICE_MAX_BITRATE_BPS = 80_000
/** Bitrate máximo p/ áudio da tela */
export const SCREEN_AUDIO_MAX_BITRATE_BPS = 160_000

/**
 * Monta a configuração de áudio para um dado tipo de track.
 * Função pura: mesma entrada => mesma saída, sem tocar em DOM/WebRTC.
 */
export function getAudioTrackConfig(kind: AudioTrackKind): AudioTrackConfig {
  if (kind === 'microphone') {
    return {
      capture: {
        // Mic em ambiente com alto-falante: manter processamento ligado
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1, // mono
        sampleRate: 48_000
      },
      publish: {
        dtx: true, // DTX permitido p/ voz (silêncio => economia)
        red: true, // FEC/RED ligado (redundância p/ perda de pacotes)
        forceStereo: false,
        audioPreset: {
          maxBitrate: VOICE_MAX_BITRATE_BPS,
          priority: 'high' // proteção de rede p/ áudio
        }
      }
    }
  }

  // screenAudio — NUNCA danificar música/jogos/efeitos
  return {
    capture: {
      echoCancellation: false, // destrói música/efeitos
      noiseSuppression: false, // remove detalhes/ambiência
      autoGainControl: false, // distorce dinâmica
      channelCount: 2, // estéreo
      sampleRate: 48_000,
      // Exclui o áudio do próprio app na captura de tela (evita eco/feedback).
      // Suportado apenas em Chromium (restrição do SO/browser) — Etapa 1.
      restrictOwnAudio: true
    },
    publish: {
      dtx: false, // CRÍTICO: DTX desligado p/ transmissão (música/games)
      red: true, // FEC/RED ligado
      forceStereo: true,
      audioPreset: {
        maxBitrate: SCREEN_AUDIO_MAX_BITRATE_BPS,
        priority: 'high' // áudio da tela também protegido
      }
    }
  }
}

/**
 * Valida que a config obedece as invariantes críticas de áudio.
 * Usado em testes p/ garantir que regressões não regridam a qualidade.
 */
export function validateAudioConfig(kind: AudioTrackKind): string[] {
  const { capture, publish } = getAudioTrackConfig(kind)
  const errors: string[] = []

  // FEC (RED) sempre ligado
  if (publish.red !== true) errors.push(`${kind}: RED/FEC deve estar ligado`)

  if (kind === 'microphone') {
    if (publish.dtx !== true) errors.push('microphone: DTX deve estar ligado p/ voz')
    if (capture.echoCancellation !== true) errors.push('microphone: AEC deve estar ligado')
    if (capture.autoGainControl !== true) errors.push('microphone: AGC deve estar ligado')
    if (capture.noiseSuppression !== true) errors.push('microphone: NS deve estar ligado')
  } else {
    if (publish.dtx !== false) errors.push('screenAudio: DTX deve estar DESLIGADO p/ transmissão')
    if (capture.echoCancellation !== false) errors.push('screenAudio: AEC deve estar desligado')
    if (capture.noiseSuppression !== false) errors.push('screenAudio: NS deve estar desligado')
    if (capture.autoGainControl !== false) errors.push('screenAudio: AGC deve estar desligado')
  }

  return errors
}
