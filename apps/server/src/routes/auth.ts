import { z } from 'zod'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { FastifyInstance } from 'fastify'
import { db } from '../db'
import { users } from '../db/schema'
import { env } from '../env'
import { eq } from 'drizzle-orm'

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(128)
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
})

interface JwtPayload {
  sub: string
  email: string
  username: string
}

// Middleware de autenticação (reusado nas rotas protegidas)
export async function authMiddleware(request: any, reply: any) {
  try {
    await request.jwtVerify()
  } catch {
    return reply.status(401).send({ error: 'Não autenticado' })
  }
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: '7d',
    issuer: 'cher2c'
  })
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload
}

export async function authRoutes(app: FastifyInstance) {
  // Registro
  app.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Dados inválidos', details: parsed.error.flatten() })
    }

    const { email, username, password } = parsed.data

    // Verificar se email já existe
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1)
    if (existing.length > 0) {
      return reply.status(409).send({ error: 'Email já cadastrado' })
    }

    // Hash da senha (bcrypt)
    const passwordHash = await bcrypt.hash(password, 12)

    const [user] = await db
      .insert(users)
      .values({ email, username, passwordHash })
      .returning({ id: users.id, email: users.email, username: users.username })

    const accessToken = signAccessToken({ sub: user.id, email: user.email, username: user.username })

    return reply.status(201).send({
      user: { id: user.id, email: user.email, username: user.username },
      accessToken
    })
  })

  // Login
  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Dados inválidos' })
    }

    const { email, password } = parsed.data

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
    if (!user) {
      return reply.status(401).send({ error: 'Credenciais inválidas' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return reply.status(401).send({ error: 'Credenciais inválidas' })
    }

    const accessToken = signAccessToken({ sub: user.id, email: user.email, username: user.username })

    return reply.send({
      user: { id: user.id, email: user.email, username: user.username },
      accessToken
    })
  })

  // Perfil do usuário autenticado
  app.get('/me', { preHandler: authMiddleware }, async (request, reply) => {
    const payload = request.user as JwtPayload
    const [user] = await db
      .select({ id: users.id, email: users.email, username: users.username, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1)

    if (!user) {
      return reply.status(404).send({ error: 'Usuário não encontrado' })
    }

    return reply.send({ user })
  })
}
