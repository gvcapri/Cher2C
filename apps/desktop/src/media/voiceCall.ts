import {
  Room,
  RoomEvent,
  ConnectionState,
  type Participant,
  type RemoteParticipant
} from 'livekit-client'
import { getAudioTrackConfig } from './audioConfig'

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
}

export interface VoiceParticipant {
  identity: string // userId
  name: string
  isLocal: boolean
  isSpeaking: boolean
  muted: boolean // sem track de áudio publicada ou muteado
}

export class VoiceCallManager {
  private room: Room | null = null
  private callbacks: VoiceCallCallbacks

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

  async disconnect(): Promise<void> {
    if (this.room) {
      await this.room.disconnect()
      this.room = null
    }
  }
}
