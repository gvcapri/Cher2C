import {
  Room,
  RoomEvent,
  ConnectionState,
  Track,
  VideoPreset,
  VideoQuality,
  type Participant,
  type RemoteParticipant,
  type RemoteTrackPublication,
  type LocalTrackPublication,
  type TrackPublishOptions
} from 'livekit-client'
import { getAudioTrackConfig } from './audioConfig'
import {
  MetricsAggregator,
  type MetricsSnapshot,
  type RawStat
} from './metrics'
import {
  getScreenSharePlan,
  getScreenShareCaptureOptions,
  type QualityPresetId,
  type ContentHint
} from './videoConfig'

/**
 * VoiceCallManager encapsula o LiveKit Room para chamadas de voz.
 *
 * Responsabilidades (Etapa 3):
 *  - conectar/desconectar do canal de voz (LiveKit room)
 *  - publicar o microfone com a config de áudio correta (Etapa 1)
 *  - mute/undeafen
 *  - expor quem está falando (indicador) e a lista de participantes
 */

export interface VoiceCallCallbacks {
  onSpeakersChanged: (speakingIdentities: string[]) => void
  onParticipantsChanged: (participants: VoiceParticipant[]) => void
  onConnectionStateChanged: (state: ConnectionState) => void
  onError: (error: Error) => void
  /** Métricas de depuração (Etapa 5), emitidas a cada ciclo de coleta. */
  onMetricsChanged?: (snapshot: MetricsSnapshot) => void
}

export interface VoiceParticipant {
  identity: string // identity da sessão LiveKit (userId#sufixo — única por sessão)
  name: string
  isLocal: boolean
  isSpeaking: boolean
  muted: boolean // sem track de áudio publicada ou muteado
}

/** Intervalo de coleta de métricas (ms). */
const METRICS_INTERVAL_MS = 1000

const SOURCE_LABELS: Record<string, string> = {
  microphone: 'Microfone',
  screen_share: 'Tela',
  screen_share_audio: 'Áudio da tela',
  camera: 'Câmera'
}

export class VoiceCallManager {
  private room: Room | null = null
  private callbacks: VoiceCallCallbacks
  private metricsAggregator = new MetricsAggregator()
  private metricsTimer: ReturnType<typeof setInterval> | null = null

  constructor(callbacks: VoiceCallCallbacks) {
    this.callbacks = callbacks
  }

  get connectionState(): ConnectionState {
    return this.room?.state ?? ConnectionState.Disconnected
  }

  async connect(url: string, token: string): Promise<void> {
    await this.disconnect()

    const room = new Room({
      // adaptiveStream otimiza subscription; dynacast reduz CPU/upload (Etapa 4 p/ vídeo)
      adaptiveStream: true,
      dynacast: true,
      // Padrões de captura p/ áudio (voz). Áudio da tela usa config própria (Etapa 4).
      audioCaptureDefaults: getAudioTrackConfig('microphone').capture,
      publishDefaults: getAudioTrackConfig('microphone').publish
    })
    this.room = room

    this.bindRoomEvents(room)

    await room.connect(url, token)

    // Publica o microfone já com a config correta (capture + publish)
    const mic = getAudioTrackConfig('microphone')
    await room.localParticipant.setMicrophoneEnabled(true, mic.capture, mic.publish)

    this.emitParticipants()
    this.startMetricsCollection(room)
  }

  private bindRoomEvents(room: Room): void {
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      this.callbacks.onSpeakersChanged(speakers.map((s) => s.identity))
    })

    room.on(RoomEvent.ParticipantConnected, () => this.emitParticipants())
    room.on(RoomEvent.ParticipantDisconnected, () => this.emitParticipants())
    room.on(RoomEvent.LocalTrackPublished, () => this.emitParticipants())
    room.on(RoomEvent.TrackUnsubscribed, () => this.emitParticipants())

    room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      this.callbacks.onConnectionStateChanged(state)
    })

    room.on(RoomEvent.Disconnected, () => {
      this.callbacks.onConnectionStateChanged(ConnectionState.Disconnected)
    })

    room.on(RoomEvent.Reconnecting, () => {
      this.callbacks.onConnectionStateChanged(ConnectionState.Reconnecting)
    })

    room.on(RoomEvent.MediaDevicesError, (err: Error) => {
      this.callbacks.onError(err)
    })
  }

  private emitParticipants(): void {
    if (!this.room) return

    const list: VoiceParticipant[] = []

    const local = this.room.localParticipant
    list.push({
      identity: local.identity,
      name: local.name || local.identity,
      isLocal: true,
      isSpeaking: local.isSpeaking,
      muted: !local.isMicrophoneEnabled
    })

    this.room.remoteParticipants.forEach((rp: RemoteParticipant) => {
      list.push({
        identity: rp.identity,
        name: rp.name || rp.identity,
        isLocal: false,
        isSpeaking: rp.isSpeaking,
        muted: !rp.isMicrophoneEnabled
      })
    })

    this.callbacks.onParticipantsChanged(list)
  }

  /** Ativa/desativa o microfone (mute). */
  async setMuted(muted: boolean): Promise<void> {
    if (!this.room) return
    await this.room.localParticipant.setMicrophoneEnabled(!muted)
    this.emitParticipants()
  }

  /**
   * Ensurdecer: silencia a saída de áudio dos participantes remotos
   * (setVolume 0) e muta o próprio microfone (comportamento Discord).
   */
  async setDeafened(deafened: boolean): Promise<void> {
    if (!this.room) return

    for (const rp of this.room.remoteParticipants.values()) {
      for (const pub of rp.audioTrackPublications.values()) {
        const track = pub.track as { setVolume?: (v: number) => void } | undefined
        track?.setVolume?.(deafened ? 0 : 1)
      }
    }

    await this.room.localParticipant.setMicrophoneEnabled(!deafened)
    this.emitParticipants()
  }

  /**
   * Inicia o compartilhamento de tela (vídeo com simulcast) + áudio do sistema
   * como um track SEPARADO (Etapa 4). O áudio da tela usa AEC/NS/AGC off e DTX off.
   */
  async startScreenShare(opts: {
    presetId?: QualityPresetId
    contentHint?: ContentHint
    includeSystemAudio?: boolean
    displaySurface?: 'window' | 'browser' | 'monitor'
  } = {}): Promise<void> {
    if (!this.room) throw new Error('Não conectado a um canal de voz')

    const plan = getScreenSharePlan(opts.presetId ?? '1080p30', opts.contentHint ?? 'detail')
    const capture = getScreenShareCaptureOptions(plan, opts.displaySurface)
    if (!opts.includeSystemAudio) capture.audio = false

    const publishOptions: TrackPublishOptions = {
      simulcast: true,
      degradationPreference: plan.degradationPreference,
      screenShareEncoding: plan.videoEncoding,
      // 3 camadas (primária no topo + adicionais low->high)
      screenShareSimulcastLayers: plan.simulcastLayers.map(
        (l) => new VideoPreset(l.width, l.height, l.maxBitrateBps, l.fps)
      ),
      // Track de ÁUDIO da tela (separado): DTX off, ~128k, estéreo, prioridade alta
      audioPreset: plan.audioPublish.audioPreset,
      dtx: plan.audioPublish.dtx,
      forceStereo: plan.audioPublish.forceStereo
    }

    await this.room.localParticipant.setScreenShareEnabled(true, capture, publishOptions)
  }

  async stopScreenShare(): Promise<void> {
    await this.room?.localParticipant.setScreenShareEnabled(false)
  }

  get isScreenSharing(): boolean {
    const pub = this.room?.localParticipant.getTrackPublication(Track.Source.ScreenShare)
    return !!pub && !pub.isMuted
  }

  /**
   * Qualidade p/ o ESPECTADOR (lado da inscrição). "auto" deixa o adaptiveStream
   * do LiveKit escolher; valores fixos aplicam um teto (LOW/MID/HIGH).
   *
   * Limitação do SDK: definir uma qualidade fixa sobrepõe o adaptiveStream;
   * voltar para "auto" de fato exige resubscribe nesta versão.
   */
  setViewerScreenQuality(quality: 'auto' | 'low' | 'mid' | 'high'): void {
    if (!this.room) return
    for (const rp of this.room.remoteParticipants.values()) {
      for (const pub of rp.videoTrackPublications.values()) {
        if (pub.source !== Track.Source.ScreenShare) continue
        const remote = pub as RemoteTrackPublication
        if (quality === 'auto') continue // adaptiveStream (padrão)
        remote.setVideoQuality(
          quality === 'low'
            ? VideoQuality.LOW
            : quality === 'mid'
              ? VideoQuality.MEDIUM
              : VideoQuality.HIGH
        )
      }
    }
  }

  /** Publicações de tela remotas (p/ renderizar o vídeo do compartilhador). */
  getRemoteScreenShares(): Array<{ identity: string; publication: RemoteTrackPublication }> {
    const out: Array<{ identity: string; publication: RemoteTrackPublication }> = []
    this.room?.remoteParticipants.forEach((rp) => {
      rp.videoTrackPublications.forEach((pub) => {
        if (pub.source === Track.Source.ScreenShare) {
          out.push({ identity: rp.identity, publication: pub as RemoteTrackPublication })
        }
      })
    })
    return out
  }

  /** Publicação da tela LOCAL (p/ preview do que estou compartilhando). */
  getLocalScreenShare(): LocalTrackPublication | undefined {
    const pub = this.room?.localParticipant.getTrackPublication(Track.Source.ScreenShare)
    return pub as LocalTrackPublication | undefined
  }

  // -----------------------------------------------------------------------
  // Métricas de depuração (Etapa 5)
  // -----------------------------------------------------------------------

  /**
   * Coleta RTCStats de todas as tracks (enviadas e recebidas) + níveis de áudio
   * dos participantes, a cada METRICS_INTERVAL_MS, e emite via onMetricsChanged.
   */
  private startMetricsCollection(room: Room): void {
    this.stopMetricsCollection()
    this.metricsAggregator.reset()
    this.metricsTimer = setInterval(() => {
      void this.collectMetrics(room)
    }, METRICS_INTERVAL_MS)
  }

  private stopMetricsCollection(): void {
    if (this.metricsTimer !== null) {
      clearInterval(this.metricsTimer)
      this.metricsTimer = null
    }
  }

  private async collectMetrics(room: Room): Promise<void> {
    if (room.state !== ConnectionState.Connected) return

    const entries: RawStat[] = []
    const labels = new Map<string, string>()

    const readTrack = async (
      track: { getRTCStatsReport: () => Promise<RTCStatsReport | undefined> },
      sourceKey: string
    ): Promise<void> => {
      const report = await track.getRTCStatsReport()
      if (!report) return
      const friendly = SOURCE_LABELS[sourceKey] ?? sourceKey
      report.forEach((value) => {
        const stat = value as RawStat
        entries.push(stat)
        const tid = typeof stat.trackIdentifier === 'string' ? stat.trackIdentifier : null
        if (tid) labels.set(tid, friendly)
      })
    }

    try {
      // Tracks locais (microfone, tela, áudio da tela)
      for (const pub of room.localParticipant.trackPublications.values()) {
        if (pub.track) await readTrack(pub.track, pub.source)
      }
      // Tracks remotas (voz/tela de outros participantes)
      for (const rp of room.remoteParticipants.values()) {
        for (const pub of rp.trackPublications.values()) {
          if (pub.track) await readTrack(pub.track, pub.source)
        }
      }
    } catch {
      // getStats pode falhar (track finalizada); próxima amostra tenta de novo
    }

    const snapshot = this.metricsAggregator.update(entries, Date.now(), labels)

    // Nível de áudio por participante (0..1) — p/ o medidor da UI
    snapshot.audioLevels = []
    snapshot.audioLevels.push({
      identity: room.localParticipant.identity,
      level: room.localParticipant.audioLevel
    })
    room.remoteParticipants.forEach((rp) => {
      snapshot.audioLevels!.push({ identity: rp.identity, level: rp.audioLevel })
    })

    this.callbacks.onMetricsChanged?.(snapshot)
  }

  async disconnect(): Promise<void> {
    this.stopMetricsCollection()
    if (this.room) {
      await this.room.disconnect()
      this.room = null
    }
  }
}
