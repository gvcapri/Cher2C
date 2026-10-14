export enum ChannelType {
  TEXT = 'TEXT',
  VOICE = 'VOICE'
}

export interface User {
  id: string
  email: string
  username: string
  avatarUrl?: string | null
  createdAt: Date
  updatedAt: Date
}

export interface Member {
  id: string
  userId: string
  serverId: string
  role: string
  joinedAt: Date
  user?: User
}

export interface Channel {
  id: string
  name: string
  type: ChannelType
  serverId: string
  position: number
  createdAt: Date
  updatedAt: Date
}

export interface Server {
  id: string
  name: string
  ownerId: string
  iconUrl?: string | null
  createdAt: Date
  updatedAt: Date
  members?: Member[]
  channels?: Channel[]
}

export interface AuthTokens {
  accessToken: string
  refreshToken?: string
}

// LiveKit types
export interface VoiceState {
  userId: string
  channelId: string
  serverId: string
  muted: boolean
  deafened: boolean
  speaking: boolean
}

// WebSocket events
export interface ServerToClientEvents {
  'voice:state': (state: VoiceState) => void
  'voice:join': (data: { userId: string; channelId: string }) => void
  'voice:leave': (data: { userId: string; channelId: string }) => void
  'chat:message': (data: { channelId: string; userId: string; content: string; createdAt: Date }) => void
  'user:speaking': (data: { userId: string; channelId: string; speaking: boolean }) => void
}

export interface ClientToServerEvents {
  'voice:join': (data: { channelId: string }) => void
  'voice:leave': (data: { channelId: string }) => void
  'voice:mute': (data: { muted: boolean }) => void
  'voice:deaf': (data: { deafened: boolean }) => void
  'chat:send': (data: { channelId: string; content: string }) => void
  'voice:speaking': (data: { channelId: string; speaking: boolean }) => void
}
