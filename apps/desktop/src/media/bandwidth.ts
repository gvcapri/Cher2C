import { VOICE_MAX_BITRATE_BPS, SCREEN_AUDIO_MAX_BITRATE_BPS } from './audioConfig'
import type { VideoLayer } from './videoConfig'

/**
 * Política de largura de banda (Etapa 4) — REQUISITO CENTRAL:
 * "Quando a banda cair, reduzir primeiro resolução, depois fps, mantendo o
 *  áudio intacto."
 *
 * O áudio tem reserva GARANTIDA: é alocado ANTES de qualquer vídeo. O vídeo
 * recebe só o que sobra. Se faltar, o vídeo degrada — NUNCA o áudio.
 *
 * Módulo Puro p/ ser unit-testável.
 */

export interface AudioDemand {
  voiceBps: number
  screenAudioBps: number
}

/** Reserva padrão: voz (~80k) + áudio da tela (~160k). */
export const DEFAULT_AUDIO_DEMAND: AudioDemand = {
  voiceBps: VOICE_MAX_BITRATE_BPS,
  screenAudioBps: SCREEN_AUDIO_MAX_BITRATE_BPS
}

export interface PublishPlan {
  /** Largura garantida ao áudio (integral se houver banda) */
  audioBps: number
  /** Teto de bitrate de vídeo (sobra após reservar o áudio) */
  videoBps: number
  /** true se o áudio foi totalmente financiado (não sofreu contenção) */
  audioSafe: boolean
  /** true se o vídeo ficou abaixo do preset (contido p/ proteger o áudio) */
  videoConstrained: boolean
}

/**
 * Planeja a alocação de upload garantindo o áudio primeiro.
 *
 * @param availableUploadBps upload estimado disponível
 * @param presetVideoBps     bitrate alvo do preset de vídeo
 * @param audioDemand        demanda de áudio (voz + tela)
 */
export function planPublishBandwidth(
  availableUploadBps: number,
  presetVideoBps: number,
  audioDemand: AudioDemand = DEFAULT_AUDIO_DEMAND
): PublishPlan {
  const totalAudio = audioDemand.voiceBps + audioDemand.screenAudioBps

  // Áudio é priorizado: reserva integral antes de qualquer vídeo
  const audioBps = Math.min(totalAudio, availableUploadBps)
  const audioSafe = availableUploadBps >= totalAudio

  const remaining = Math.max(0, availableUploadBps - audioBps)
  const videoBps = Math.min(presetVideoBps, remaining)
  const videoConstrained = videoBps < presetVideoBps

  return { audioBps, videoBps, audioSafe, videoConstrained }
}

/**
 * Escolhe a camada de simulcast p/ um espectador (modo "automático").
 * Seleciona a MAIOR camada que couber na banda do espectador (com margem de
 * segurança de 20%). Retorna null se nenhuma couber (banda pífia).
 *
 * Camadas devem estar ordenadas low -> high.
 */
export function selectSimulcastLayer(
  subscriberBandwidthBps: number,
  layers: VideoLayer[]
): VideoLayer | null {
  const budget = subscriberBandwidthBps * 0.8 // margem de segurança
  const sorted = [...layers].sort((a, b) => a.minBitrateBps - b.minBitrateBps)

  let chosen: VideoLayer | null = null
  for (const layer of sorted) {
    if (layer.minBitrateBps <= budget) chosen = layer
  }
  return chosen
}

/**
 * Reduz progressivamente a qualidade de vídeo (resolução primeiro, depois fps)
 * até que caiba no teto de banda, SEM tocar no áudio. Usado p/-adaptar quando o
 * BWE/report do espectador indica restrição.
 */
export interface QualityStep {
  height: number
  fps: number
  minBitrateBps: number
}

export function degradeToFit(videoBitrateCapBps: number, ladder: QualityStep[]): QualityStep | null {
  // ladder ordenada high -> low; escolhe a primeira que couber
  const sorted = [...ladder].sort(
    (a, b) => b.height - a.height || b.fps - a.fps
  )
  for (const step of sorted) {
    if (step.minBitrateBps <= videoBitrateCapBps) return step
  }
  return null // vídeo desligado p/ proteger o áudio
}
