import { io, type Socket } from 'socket.io-client'
import type {
  ClientToServerEvents,
  ServerToClientEvents
} from '@cher2c/shared'

export type SignalingSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const API_BASE = 'http://localhost:4000'

/**
 * Cria o cliente de sinalização (Socket.IO) autenticado por JWT.
 *
 * Mídia (voz) vai pelo LiveKit (WebRTC). Este socket cuida de:
 *  - join/leave de canal de voz (presença)
 *  - mute/deaf/speaking (estados sincronizados p/ UI dos outros)
 *  - chat de texto por canal
 */
export function createSignalingClient(token: string): SignalingSocket {
  const socket: SignalingSocket = io(API_BASE, {
    path: '/ws',
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true
  })

  return socket
}
