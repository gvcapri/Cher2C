import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { db } from '../db'
import { servers, members, channels, users } from '../db/schema'
import { authMiddleware } from './auth'
import { eq, and, asc } from 'drizzle-orm'
import { ChannelType } from '@cher2c/shared'

const createServerSchema = z.object({
  name: z.string().min(2).max(100)
})

export async function serverRoutes(app: FastifyInstance) {
  // Todas as rotas exigem auth
  app.addHook('preHandler', authMiddleware)

  // Listar servidores do usuário
  app.get('/', async (request, reply) => {
    const payload = request.user as { sub: string }

    const myServers = await db
      .select({
        id: servers.id,
        name: servers.name,
        ownerId: servers.ownerId,
        iconUrl: servers.iconUrl,
        createdAt: servers.createdAt,
        role: members.role
      })
      .from(members)
      .innerJoin(servers, eq(members.serverId, servers.id))
      .where(eq(members.userId, payload.sub))

    return reply.send({ servers: myServers })
  })

  // Criar servidor (criador vira OWNER + cria canal padrão "geral" e voz)
  app.post('/', async (request, reply) => {
    const payload = request.user as { sub: string }
    const parsed = createServerSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Dados inválidos', details: parsed.error.flatten() })
    }

    const server = await db.transaction(async (tx) => {
      const [server] = await tx
        .insert(servers)
        .values({ name: parsed.data.name, ownerId: payload.sub })
        .returning()

      // OWNER vira membro
      await tx.insert(members).values({
        userId: payload.sub,
        serverId: server.id,
        role: 'OWNER'
      })

      // Canais padrão
      await tx.insert(channels).values([
        { name: 'geral', type: ChannelType.TEXT, serverId: server.id, position: 0 },
        { name: 'Geral', type: ChannelType.VOICE, serverId: server.id, position: 0 }
      ])

      return server
    })

    return reply.status(201).send({ server })
  })

  // Detalhes do servidor (incluindo canais)
  app.get('/:serverId', async (request, reply) => {
    const payload = request.user as { sub: string }
    const { serverId } = request.params as { serverId: string }

    // Verificar membership
    const [membership] = await db
      .select()
      .from(members)
      .where(and(eq(members.userId, payload.sub), eq(members.serverId, serverId)))
      .limit(1)

    if (!membership) {
      return reply.status(403).send({ error: 'Você não é membro deste servidor' })
    }

    const [server] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1)
    if (!server) {
      return reply.status(404).send({ error: 'Servidor não encontrado' })
    }

    const serverChannels = await db
      .select()
      .from(channels)
      .where(eq(channels.serverId, serverId))
      .orderBy(asc(channels.position))

    const serverMembers = await db
      .select({
        id: members.id,
        userId: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
        role: members.role,
        joinedAt: members.joinedAt
      })
      .from(members)
      .innerJoin(users, eq(members.userId, users.id))
      .where(eq(members.serverId, serverId))

    return reply.send({
      server,
      channels: serverChannels,
      members: serverMembers,
      myRole: membership.role
    })
  })
}
