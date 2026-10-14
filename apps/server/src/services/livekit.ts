import { AccessToken } from 'livekit-server-sdk'
import { env } from '../env'

interface TokenOptions {
  userId: string
  channelId: string
  serverId: string
  username: string
  // Permissões por role
  canPublish?: boolean // mic + tela
  canSubscribe?: boolean
  canPublishData?: boolean // chat via data channel
}

/**
 * Gera token JWT do LiveKit para entrar em uma room (= channel de voz).
 *
 * O room name segue o padrão: `channel:{channelId}`.
 * Permissões são granulares por usuário (baseado em role no servidor).
 */
export async function generateVoiceToken(options: TokenOptions): Promise<{
  token: string
  url: string
}> {
  const {
    userId,
    channelId,
    username,
    canPublish = true,
    canSubscribe = true,
    canPublishData = true
  } = options

  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: userId, // identity = userId p/ correlação com WS/socket
    name: username,
    ttl: '2h'
  })

  at.addGrant({
    room: `channel:${channelId}`,
    roomJoin: true,
    canPublish,
    canSubscribe,
    canPublishData,
    // Nota: granularidade por track (só mic, só tela) não é nativa do LiveKit;
    // controle por app (Electron decide o que publica)
  })

  const token = await at.toJwt()

  return { token, url: env.LIVEKIT_URL }
}
