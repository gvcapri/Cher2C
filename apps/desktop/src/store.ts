import { create } from 'zustand'
import { ConnectionState } from 'livekit-client'
import type { SignalingSocket } from './ws/client'
import { createSignalingClient } from './ws/client'
import { VoiceCallManager, type VoiceParticipant } from './media/voiceCall'
import type { MetricsSnapshot } from './media/metrics'
import type { QualityPresetId, ContentHint } from './media/videoConfig'
import * as api from './api'

interface AppState {
  // Auth
  token: string | null
  user: api.AuthUser | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, username: string, password: string) => Promise<void>
  logout: () => void

  // Servers / channels
  servers: api.ServerSummary[]
  channels: api.ChannelSummary[]
  activeServerId: string | null
  loadServers: () => Promise<void>
  selectServer: (serverId: string) => Promise<void>
  joinServer: (code: string) => Promise<void>

  // Voice call
  voiceChannelId: string | null
  connectionState: ConnectionState
  participants: VoiceParticipant[]
  speaking: string[]
  muted: boolean
  deafened: boolean
  joinVoice: (channelId: string) => Promise<void>
  leaveVoice: () => Promise<void>
  toggleMute: () => Promise<void>
  toggleDeafen: () => Promise<void>

  // Depuração (Etapa 5)
  metrics: MetricsSnapshot | null
  showMetrics: boolean
  toggleShowMetrics: () => void

  // Screen share (Etapa 4)
  sharing: boolean
  sharePreset: QualityPresetId
  shareContentHint: ContentHint
  shareWithSystemAudio: boolean
  viewerQuality: 'auto' | 'low' | 'mid' | 'high'
  startShare: (opts?: Partial<{ presetId: QualityPresetId; contentHint: ContentHint; includeSystemAudio: boolean }>) => Promise<void>
  stopShare: () => Promise<void>
  setSharePreset: (p: QualityPresetId) => void
  setShareContentHint: (h: ContentHint) => void
  setShareWithSystemAudio: (v: boolean) => void
  setViewerQuality: (q: 'auto' | 'low' | 'mid' | 'high') => void

  // Internos
  signaling: SignalingSocket | null
  voiceManager: VoiceCallManager | null
}

export const useAppStore = create<AppState>((set, get) => ({
  token: null,
  user: null,

  async login(email, password) {
    const res = await api.login(email, password)
    set({ token: res.accessToken, user: res.user })
    await get().loadServers()
  },

  async register(email, username, password) {
    const res = await api.register(email, username, password)
    set({ token: res.accessToken, user: res.user })
    await get().loadServers()
  },

  logout() {
    void get().leaveVoice()
    get().signaling?.disconnect()
    set({
      token: null,
      user: null,
      servers: [],
      channels: [],
      activeServerId: null,
      voiceChannelId: null,
      participants: [],
      speaking: [],
      signaling: null
    })
  },

  servers: [],
  channels: [],
  activeServerId: null,

  async loadServers() {
    const { token } = get()
    if (!token) return
    const { servers } = await api.listServers(token)
    set({ servers })
  },

  async selectServer(serverId) {
    const { token } = get()
    if (!token) return
    const detail = await api.getServer(token, serverId)
    set({ activeServerId: serverId, channels: detail.channels })
  },

  async joinServer(code) {
    const { token } = get()
    if (!token) throw new Error('Não autenticado')
    const res = await api.joinServer(token, code)
    await get().loadServers()
    await get().selectServer(res.serverId)
  },

  voiceChannelId: null,
  connectionState: ConnectionState.Disconnected,
  participants: [],
  speaking: [],
  muted: false,
  deafened: false,
  signaling: null,
  voiceManager: null,
  metrics: null,
  showMetrics: false,

  toggleShowMetrics() {
    set({ showMetrics: !get().showMetrics })
  },

  sharing: false,
  sharePreset: '1080p30',
  shareContentHint: 'detail',
  shareWithSystemAudio: true,
  viewerQuality: 'auto',

  async startShare(opts = {}) {
    const { voiceManager, sharePreset, shareContentHint, shareWithSystemAudio } = get()
    if (!voiceManager) throw new Error('Entre em um canal de voz antes de compartilhar')
    await voiceManager.startScreenShare({
      presetId: opts.presetId ?? sharePreset,
      contentHint: opts.contentHint ?? shareContentHint,
      includeSystemAudio: opts.includeSystemAudio ?? shareWithSystemAudio
    })
    set({ sharing: true })
  },

  async stopShare() {
    const { voiceManager } = get()
    await voiceManager?.stopScreenShare()
    set({ sharing: false })
  },

  setSharePreset(p) {
    set({ sharePreset: p })
  },
  setShareContentHint(h) {
    set({ shareContentHint: h })
  },
  setShareWithSystemAudio(v) {
    set({ shareWithSystemAudio: v })
  },
  setViewerQuality(q) {
    get().voiceManager?.setViewerScreenQuality(q)
    set({ viewerQuality: q })
  },

  async joinVoice(channelId) {
    const { token } = get()
    if (!token) throw new Error('Não autenticado')

    await get().leaveVoice()

    // 1) Token do SFU (LiveKit)
    const { token: roomToken, url } = await api.getVoiceToken(token, channelId)

    // 2) Conecta ao LiveKit e publica o microfone
    const manager = new VoiceCallManager({
      onSpeakersChanged: (speaking) => set({ speaking }),
      onParticipantsChanged: (participants) => set({ participants }),
      onConnectionStateChanged: (state) => set({ connectionState: state }),
      onError: (err) => console.error('[voice]', err),
      onMetricsChanged: (metrics) => set({ metrics })
    })
    await manager.connect(url, roomToken)

    // 3) Sinalização (presença/chat) via Socket.IO
    const socket = createSignalingClient(token)
    socket.on('voice:state', () => {
      // estados de mute/etc. dos outros — UI pode reagir no futuro
    })
    socket.emit('voice:join', { channelId })

    set({
      voiceChannelId: channelId,
      voiceManager: manager,
      signaling: socket,
      muted: false,
      deafened: false
    })
  },

  async leaveVoice() {
    const { voiceManager, signaling, voiceChannelId } = get()
    if (signaling && voiceChannelId) {
      signaling.emit('voice:leave', { channelId: voiceChannelId })
      signaling.disconnect()
    }
    await voiceManager?.disconnect()
    set({
      voiceChannelId: null,
      voiceManager: null,
      signaling: null,
      participants: [],
      speaking: [],
      metrics: null,
      connectionState: ConnectionState.Disconnected
    })
  },

  async toggleMute() {
    const { voiceManager, signaling, muted } = get()
    const next = !muted
    await voiceManager?.setMuted(next)
    signaling?.emit('voice:mute', { muted: next })
    set({ muted: next })
  },

  async toggleDeafen() {
    const { voiceManager, signaling, deafened } = get()
    const next = !deafened
    await voiceManager?.setDeafened(next)
    signaling?.emit('voice:deaf', { deafened: next })
    set({ deafened: next, muted: next ? true : get().muted })
  }
}))
