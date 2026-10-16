import { randomUUID } from 'node:crypto'
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
    // Identity ÚNICA POR SESSÃO (userId#sufixo): se fosse apenas o userId, dois
    // clientes do mesmo usuário (2 janelas/dispositivos, ou testes E2E) entrariam
    // com a MESMA identity e o LiveKit — política default REPLACE — derrubaria o
    // participante anterior com DisconnectReason.DUPLICATE_IDENTITY.
    // O userId permanece como prefixo p/ debug/correlação.
    identity: `${userId}#${randomUUID().slice(0, 8)}`,
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
