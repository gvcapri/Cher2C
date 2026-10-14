import { Server as HttpServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import { verifyAccessToken } from '../routes/auth'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  VoiceState
} from '@cher2c/shared'

/**
 * WebSocket para sinalização de voz (join/leave/mute), presença e chat.
 *
 * Nota: mídia (voz/vídeo) passa pelo SFU LiveKit (WebRTC direto).
 * Este WS cuida do "fora da mídia": quem está em qual canal, estados,
 * eventos de fala (indicador visual) e chat de texto.
 */

interface SocketData {
  userId: string
  username: string
  channelId?: string
}

// Estado em memória p/ MVP (production usaria Redis p/ escala horizontal)
// channel:{channelId} -> Set de { userId, username, muted, deafened }
const channelStates = new Map<string, Map<string, VoiceState>>()

function getChannelState(channelId: string): Map<string, VoiceState> {
  if (!channelStates.has(channelId)) {
    channelStates.set(channelId, new Map())
  }
  return channelStates.get(channelId)!
}

function roomName(channelId: string) {
  return `channel:${channelId}`
}

export function createWebSocketServer(server: HttpServer) {
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<never, never>, SocketData>(server, {
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') ?? 'http://localhost:5173',
      credentials: true
    },
    path: '/ws'
  })

  // Auth por JWT no handshake
  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string) ??
      (socket.handshake.headers.authorization?.replace('Bearer ', '') ?? '')

    if (!token) return next(new Error('Não autenticado'))

    try {
      const payload = verifyAccessToken(token)
      socket.data.userId = payload.sub
      socket.data.username = payload.username
      next()
    } catch {
      next(new Error('Token inválido'))
    }
  })

  io.on('connection', (socket) => {
    const { userId, username } = socket.data
    console.log(`[WS] Conectado: ${username} (${userId})`)

    socket.on('voice:join', async ({ channelId }) => {
      // Juntar-se à sala do canal (p/ broadcast de eventos)
      await socket.join(roomName(channelId))
      socket.data.channelId = channelId

      // Registrar estado
      const state = getChannelState(channelId)
      state.set(userId, { userId, channelId, serverId: '', muted: false, deafened: false, speaking: false })

      // Notificar outros no canal
      socket.to(roomName(channelId)).emit('voice:join', { userId, channelId })

      // Enviar estado atual para o joiner (quem já está no canal)
      const participants = Array.from(state.values())
      for (const p of participants) {
        if (p.userId !== userId) {
          socket.emit('voice:state', p)
        }
      }

      console.log(`[WS] ${username} entrou no canal ${channelId}`)
    })

    socket.on('voice:leave', async ({ channelId }) => {
      await socket.leave(roomName(channelId))

      const state = getChannelState(channelId)
      state.delete(userId)

      socket.to(roomName(channelId)).emit('voice:leave', { userId, channelId })

      console.log(`[WS] ${username} saiu do canal ${channelId}`)
    })

    socket.on('voice:mute', ({ muted }) => {
      const channelId = socket.data.channelId
      if (!channelId) return

      const state = getChannelState(channelId)
      const current = state.get(userId)
      if (current) {
        current.muted = muted
        socket.to(roomName(channelId)).emit('voice:state', { ...current })
      }
    })

    socket.on('voice:deaf', ({ deafened }) => {
      const channelId = socket.data.channelId
      if (!channelId) return

      const state = getChannelState(channelId)
      const current = state.get(userId)
      if (current) {
        current.deafened = deafened
        // Ensurdecer implica mutar
        if (deafened) current.muted = true
        socket.to(roomName(channelId)).emit('voice:state', { ...current })
      }
    })

    socket.on('voice:speaking', ({ channelId, speaking }) => {
      // Indicador de quem está falando (recebido do cliente via audioLevel)
      const state = getChannelState(channelId)
      const current = state.get(userId)
      if (current) {
        current.speaking = speaking
        socket.to(roomName(channelId)).emit('user:speaking', { userId, channelId, speaking })
      }
    })

    socket.on('chat:send', async ({ channelId, content }) => {
      // Persistir no DB (simplificado - validar membership no middleware de rota)
      // Para MVP, broadcast imediato (persistência acontece via REST/DB no client)
      socket.to(roomName(channelId)).emit('chat:message', {
        channelId,
        userId,
        content,
        createdAt: new Date()
      })
    })

    socket.on('disconnect', () => {
      // Limpar estado de todos os canais
      const channelId = socket.data.channelId
      if (channelId) {
        const state = getChannelState(channelId)
        state.delete(userId)
        socket.to(roomName(channelId)).emit('voice:leave', { userId, channelId })
      }
      console.log(`[WS] Desconectado: ${username} (${userId})`)
    })
  })

  return io
}
