import type { ScreenShareCaptureOptions, TrackPublishOptions } from 'livekit-client'
import { getAudioTrackConfig } from './audioConfig'

/**
 * Configuração de vídeo do compartilhamento de tela (Etapa 4).
 *
 * REGRAS:
 *  - Presets 720p30 / 1080p30 / 1080p60 com limite de bitrate de vídeo p/ não
 *    competir com o áudio no upload.
 *  - contentHint "detail" (texto/código) vs "motion" (jogos) => degradationPreference.
 *  - Simulcast com 3 camadas p/ cada espectador receber a camada adequada.
 *  - O ÁUDIO DA TELA é um track SEPARADO com dtx OFF e ~128 kbps (Etapa 1).
 *
 * Módulo Puro (sem import runtime do LiveKit) p/ ser unit-testável.
 * A conversão para tipos do LiveKit (VideoPreset) ocorre no ShareManager.
 */

export type ContentHint = 'detail' | 'motion'
export type QualityPresetId = '720p30' | '1080p30' | '1080p60'

/** Camada de simulcast (dados puros; convertida p/ VideoPreset no ShareManager) */
export interface VideoLayer {
  width: number
  height: number
  fps: number
  /** Bitrate mínimo p/ esta camada ser útil (usado na seleção do espectador) */
  minBitrateBps: number
  /** Limite de bitrate de envio desta camada */
  maxBitrateBps: number
}

export interface QualityPreset {
  id: QualityPresetId
  label: string
  width: number
  height: number
  fps: number
  /** Limite de bitrate do envio principal (não deve competir com o áudio) */
  videoMaxBitrateBps: number
  /** Camadas ADICIONAIS de simulcast (ordenadas low -> high). A primária fica no topo. */
  simulcastLayers: VideoLayer[]
  /** Camadas completas (primária inclusa), low -> high, p/ seleção do espectador */
  allLayers: VideoLayer[]
}

// Bitrates de camadas (ordem de grandeza LiveKit)
const L180 = { width: 320, height: 180, fps: 15, minBitrateBps: 100_000, maxBitrateBps: 200_000 }
const L360 = { width: 640, height: 360, fps: 15, minBitrateBps: 300_000, maxBitrateBps: 500_000 }
const L540 = { width: 960, height: 540, fps: 30, minBitrateBps: 600_000, maxBitrateBps: 900_000 }

export const QUALITY_PRESETS: Record<QualityPresetId, QualityPreset> = {
  '720p30': {
    id: '720p30',
    label: '720p 30fps',
    width: 1280,
    height: 720,
    fps: 30,
    videoMaxBitrateBps: 1_500_000,
    simulcastLayers: [L180, L360],
    allLayers: [L180, L360, { width: 1280, height: 720, fps: 30, minBitrateBps: 900_000, maxBitrateBps: 1_500_000 }]
  },
  '1080p30': {
    id: '1080p30',
    label: '1080p 30fps',
    width: 1920,
    height: 1080,
    fps: 30,
    videoMaxBitrateBps: 2_500_000,
    simulcastLayers: [L360, L540],
    allLayers: [L360, L540, { width: 1920, height: 1080, fps: 30, minBitrateBps: 1_600_000, maxBitrateBps: 2_500_000 }]
  },
  '1080p60': {
    id: '1080p60',
    label: '1080p 60fps',
    width: 1920,
    height: 1080,
    fps: 60,
    videoMaxBitrateBps: 3_500_000,
    simulcastLayers: [L360, L540],
    allLayers: [L360, L540, { width: 1920, height: 1080, fps: 60, minBitrateBps: 2_200_000, maxBitrateBps: 3_500_000 }]
  }
}

/** Ordem de exibição p/ UI */
export const QUALITY_PRESET_ORDER: QualityPresetId[] = ['720p30', '1080p30', '1080p60']

/**
 * contentHint -> degradationPreference (trade-off do encoder sob pressão):
 *  - "detail"/texto: prioriza NITIDEZ => mantém resolução, reduz fps primeiro.
 *  - "motion"/jogos: prioriza FLUIDEZ => mantém fps, reduz resolução primeiro.
 */
export function degradationForContent(hint: ContentHint): 'maintain-resolution' | 'maintain-framerate' {
  return hint === 'motion' ? 'maintain-framerate' : 'maintain-resolution'
}

/** Plano lógico de screen share (puro). Convertido p/ tipos LiveKit no ShareManager. */
export interface ScreenSharePlan {
  preset: QualityPreset
  contentHint: ContentHint
  degradationPreference: 'maintain-resolution' | 'maintain-framerate'
  videoEncoding: { maxBitrate: number; maxFramerate: number; priority: 'medium' }
  simulcastLayers: VideoLayer[]
  resolution: { width: number; height: number; frameRate: number }
  /** Config de publicação do track de ÁUDIO da tela (separado do vídeo) */
  audioPublish: Pick<TrackPublishOptions, 'dtx' | 'forceStereo'> & {
    audioPreset: { maxBitrate: number; priority: 'high' }
  }
}

export function getScreenSharePlan(
  presetId: QualityPresetId = '1080p30',
  contentHint: ContentHint = 'detail'
): ScreenSharePlan {
  const preset = QUALITY_PRESETS[presetId]
  return {
    preset,
    contentHint,
    degradationPreference: degradationForContent(contentHint),
    videoEncoding: {
      maxBitrate: preset.videoMaxBitrateBps,
      maxFramerate: preset.fps,
      priority: 'medium' // vídeo abaixo do áudio (que é 'high')
    },
    simulcastLayers: preset.simulcastLayers,
    resolution: { width: preset.width, height: preset.height, frameRate: preset.fps },
    audioPublish: {
      dtx: false, // CRÍTICO: DTX off p/ áudio da tela
      forceStereo: true,
      audioPreset: {
        maxBitrate: getAudioTrackConfig('screenAudio').publish.audioPreset?.maxBitrate ?? 128_000,
        priority: 'high'
      }
    }
  }
}

/**
 * Opções de CAPTURA do screen share (getDisplayMedia).
 * O áudio da tela usa a config screenAudio (AEC/NS/AGC off, restrictOwnAudio).
 */
export function getScreenShareCaptureOptions(
  plan: ScreenSharePlan,
  displaySurface?: 'window' | 'browser' | 'monitor'
): ScreenShareCaptureOptions {
  return {
    audio: getAudioTrackConfig('screenAudio').capture, // AEC/NS/AGC OFF + restrictOwnAudio
    video: displaySurface ? { displaySurface } : true,
    contentHint: plan.contentHint,
    resolution: plan.resolution,
    systemAudio: 'include' // permite áudio do sistema quando suportado
  }
}
