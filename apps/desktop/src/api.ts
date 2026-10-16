const API_BASE = 'http://localhost:4000'

export interface HealthResponse {
  status: string
  timestamp: string
}

export interface AuthUser {
  id: string
  email: string
  username: string
}

export interface AuthResponse {
  user: AuthUser
  accessToken: string
}

export interface ServerSummary {
  id: string
  name: string
  ownerId: string
  role: string
}

export interface ChannelSummary {
  id: string
  name: string
  type: 'TEXT' | 'VOICE'
  serverId: string
  position: number
}

export interface VoiceTokenResponse {
  token: string
  url: string
  channelId: string
}

export interface MessageOut {
  id: string
  content: string
  createdAt: string
  userId: string
  username: string
}

export interface MemberOut {
  id: string
  userId: string
  username: string
  avatarUrl: string | null
  role: string
  joinedAt: string
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function checkHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health')
}

// ---- Auth ----
export function register(email: string, username: string, password: string) {
  return request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, username, password })
  })
}

export function login(email: string, password: string) {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  })
}

// ---- Servers ----
export function listServers(token: string) {
  return request<{ servers: ServerSummary[] }>('/api/servers', {}, token)
}

export function createServer(token: string, name: string) {
  return request<{ server: { id: string; name: string } }>('/api/servers', {
    method: 'POST',
    body: JSON.stringify({ name })
  }, token)
}

export function createChannel(
  token: string,
  serverId: string,
  name: string,
  type: 'TEXT' | 'VOICE'
) {
  return request<{ channel: ChannelSummary }>('/api/channels', {
    method: 'POST',
    body: JSON.stringify({ serverId, name, type })
  }, token)
}

export function joinServer(token: string, code: string) {
  return request<{ serverId: string; alreadyMember: boolean }>('/api/servers/join', {
    method: 'POST',
    body: JSON.stringify({ code })
  }, token)
}

export function getServer(token: string, serverId: string) {
  return request<{
    server: { id: string; name: string }
    channels: ChannelSummary[]
    members: MemberOut[]
    myRole: string
  }>(`/api/servers/${serverId}`, {}, token)
}

export function getMessages(token: string, channelId: string) {
  return request<{ messages: MessageOut[] }>(`/api/channels/${channelId}/messages`, {}, token)
}

// ---- Channels ----
export function getVoiceToken(token: string, channelId: string) {
  return request<VoiceTokenResponse>(`/api/channels/${channelId}/voice-token`, {}, token)
}
