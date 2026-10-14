import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { db } from '../db'
import { channels, members, messages, users } from '../db/schema'
import { authMiddleware } from './auth'
import { generateVoiceToken } from '../services/livekit'
import { eq, and, desc } from 'drizzle-orm'
import { ChannelType } from '@cher2c/shared'

const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.nativeEnum(ChannelType),
  serverId: z.string().uuid()
})

// Helper: verificar se usuário é membro do servidor do canal
async function checkChannelAccess(userId: string, channelId: string) {
  const [channel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1)
  if (!channel) return { channel: null, allowed: false }

  const [membership] = await db
    .select()
    .from(members)
    .where(and(eq(members.userId, userId), eq(members.serverId, channel.serverId)))
    .limit(1)

  return { channel, allowed: !!membership }
}

export async function channelRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Criar canal
  app.post('/', async (request, reply) => {
    const payload = request.user as { sub: string }
    const parsed = createChannelSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Dados inválidos', details: parsed.error.flatten() })
    }

    // Deve ser membro do servidor
    const [membership] = await db
      .select()
      .from(members)
      .where(and(eq(members.userId, payload.sub), eq(members.serverId, parsed.data.serverId)))
      .limit(1)
    if (!membership) {
      return reply.status(403).send({ error: 'Você não é membro deste servidor' })
    }

    const [channel] = await db
      .insert(channels)
      .values({
        name: parsed.data.name,
        type: parsed.data.type,
        serverId: parsed.data.serverId
      })
      .returning()

    return reply.status(201).send({ channel })
  })

  /**
   * Solicitar token de voz para entrar em um canal de voz (= LiveKit room).
   * Retorna token JWT + URL do SFU.
   */
  app.get('/:channelId/voice-token', async (request, reply) => {
    const payload = request.user as { sub: string; username?: string }
    const { channelId } = request.params as { channelId: string }

    const { channel, allowed } = await checkChannelAccess(payload.sub, channelId)
    if (!allowed || !channel) {
      return reply.status(403).send({ error: 'Acesso negado' })
    }
    if (channel.type !== ChannelType.VOICE) {
      return reply.status(400).send({ error: 'Canal não é de voz' })
    }

    const [user] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1)

    const { token, url } = await generateVoiceToken({
      userId: payload.sub,
      channelId,
      serverId: channel.serverId,
      username: user?.username ?? 'user',
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    })

    return reply.send({ token, url, channelId })
  })

  // Mensagens do canal de texto (histórico)
  app.get('/:channelId/messages', async (request, reply) => {
    const payload = request.user as { sub: string }
    const { channelId } = request.params as { channelId: string }
    const { limit = '50', before } = request.query as { limit?: string; before?: string }

    const { channel, allowed } = await checkChannelAccess(payload.sub, channelId)
    if (!allowed || !channel) {
      return reply.status(403).send({ error: 'Acesso negado' })
    }

    const conditions = [eq(messages.channelId, channelId)]
    if (before) {
      conditions.push(eq(messages.createdAt, new Date(before)))
    }

    const history = await db
      .select({
        id: messages.id,
        content: messages.content,
        createdAt: messages.createdAt,
        userId: messages.userId,
        username: users.username
      })
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(Math.min(parseInt(limit), 100))

    return reply.send({ messages: history })
  })
}
