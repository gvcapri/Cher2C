import { create } from 'zustand'
import { ConnectionState } from 'livekit-client'
import type { SignalingSocket } from './ws/client'
import { createSignalingClient } from './ws/client'
import { VoiceCallManager, type VoiceParticipant } from './media/voiceCall'
import type { MetricsSnapshot } from './media/metrics'
import type { QualityPresetId, ContentHint } from './media/videoConfig'
import * as api from './api'

/** Tema: escuro (padrão), claro ou conforme o sistema. */
export type ThemeMode = 'dark' | 'light' | 'system'

/** Mensagem de chat formatada p/ a UI. */
export interface ChatMessage {
  id: string
  channelId: string
  userId: string
  username: string
  content: string
  createdAt: string
  /** true quando enviada por mim (para alinhar à direita) */
  own?: boolean
}

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
  /** Cria um servidor e já o seleciona */
  createServer: (name: string) => Promise<void>

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

  // UI (reforma visual)
  theme: ThemeMode
  setTheme: (t: ThemeMode) => void
  /** Canal de texto selecionado (para o chat) */
  activeTextChannelId: string | null
  selectTextChannel: (channelId: string) => Promise<void>
  /** Mensagens por channelId */
  messages: Record<string, ChatMessage[]>
  messagesLoading: boolean
  loadMessages: (channelId: string) => Promise<void>
  sendMessage: (channelId: string, content: string) => void
  /** Membros do servidor ativo (p/ lista de membros) */
  members: api.MemberOut[]
  /** Modal de servidor (criar/entrar) */
  serverModalOpen: boolean
  setServerModalOpen: (open: boolean) => void
  /** Modal de configurações de áudio */
  audioSettingsOpen: boolean
  setAudioSettingsOpen: (open: boolean) => void
  /** Modal de seleção de compartilhamento */
  shareModalOpen: boolean
  setShareModalOpen: (open: boolean) => void
  /** Lista de membros visível */
  membersVisible: boolean
  toggleMembers: () => void
  /** Criar canal */
  createChannel: (name: string, type: 'TEXT' | 'VOICE') => Promise<void>

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
    set({ activeServerId: serverId, channels: detail.channels, members: detail.members })
    // auto-seleciona o primeiro canal de texto p/ o chat
    const firstText = detail.channels.find((c) => c.type === 'TEXT')
    if (firstText) {
      set({ activeTextChannelId: firstText.id })
      void get().loadMessages(firstText.id)
    } else {
      set({ activeTextChannelId: null })
    }
  },

  async joinServer(code) {
    const { token } = get()
    if (!token) throw new Error('Não autenticado')
    const res = await api.joinServer(token, code)
    await get().loadServers()
    await get().selectServer(res.serverId)
  },

  async createServer(name) {
    const { token } = get()
    if (!token) throw new Error('Não autenticado')
    const res = await api.createServer(token, name)
    await get().loadServers()
    await get().selectServer(res.server.id)
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

  // ---- UI (reforma visual) ----
  theme: 'dark',
  setTheme(t) {
    set({ theme: t })
    applyTheme(t)
  },

  activeTextChannelId: null,
  async selectTextChannel(channelId) {
    set({ activeTextChannelId: channelId })
    await get().loadMessages(channelId)
  },

  messages: {},
  messagesLoading: false,
  async loadMessages(channelId) {
    const { token, messages } = get()
    if (!token) return
    // já temos em cache?
    if (messages[channelId]) return
    set({ messagesLoading: true })
    try {
      const res = await api.getMessages(token, channelId)
      const { user } = get()
      const mapped: ChatMessage[] = res.messages.map((m) => ({
        id: m.id,
        channelId,
        userId: m.userId,
        username: m.username,
        content: m.content,
        createdAt: m.createdAt,
        own: m.userId === user?.id
      }))
      set({ messages: { ...get().messages, [channelId]: mapped } })
    } catch {
      // histórico vazio p/ MVP — não bloqueia o chat (socket entrega ao vivo)
      set({ messages: { ...get().messages, [channelId]: [] } })
    } finally {
      set({ messagesLoading: false })
    }
  },

  sendMessage(channelId, content) {
    const { signaling, user } = get()
    if (!content.trim() || !signaling) return
    signaling.emit('chat:send', { channelId, content: content.trim() })
    // eco local (o server só broadcast p/ os outros)
    const mine: ChatMessage = {
      id: `local-${Date.now()}`,
      channelId,
      userId: user?.id ?? 'me',
      username: user?.username ?? 'eu',
      content: content.trim(),
      createdAt: new Date().toISOString(),
      own: true
    }
    const cur = get().messages[channelId] ?? []
    set({ messages: { ...get().messages, [channelId]: [...cur, mine] } })
  },

  members: [],

  serverModalOpen: false,
  setServerModalOpen(open) {
    set({ serverModalOpen: open })
  },
  audioSettingsOpen: false,
  setAudioSettingsOpen(open) {
    set({ audioSettingsOpen: open })
  },
  shareModalOpen: false,
  setShareModalOpen(open) {
    set({ shareModalOpen: open })
  },

  membersVisible: true,
  toggleMembers() {
    set({ membersVisible: !get().membersVisible })
  },

  async createChannel(name, type) {
    const { token, activeServerId } = get()
    if (!token || !activeServerId) throw new Error('Selecione um servidor')
    await api.createChannel(token, activeServerId, name, type)
    await get().selectServer(activeServerId)
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

    // Mensagens de chat ao vivo (broadcast do server p/ os outros na sala)
    socket.on('chat:message', (data) => {
      const { messages, user } = get()
      const cur = messages[data.channelId] ?? []
      const incoming: ChatMessage = {
        id: `${data.userId}-${new Date(data.createdAt).getTime()}`,
        channelId: data.channelId,
        userId: data.userId,
        username: '', // resolvido no ChatArea via members/usernames
        content: data.content,
        createdAt: new Date(data.createdAt).toISOString(),
        own: data.userId === user?.id
      }
      set({ messages: { ...messages, [data.channelId]: [...cur, incoming] } })
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

/** Aplica o tema ao <html data-theme>, resolvendo "system". */
function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement
  if (mode === 'system') {
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches
    root.setAttribute('data-theme', prefersLight ? 'light' : 'dark')
  } else {
    root.setAttribute('data-theme', mode)
  }
}
