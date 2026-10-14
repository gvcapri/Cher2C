import 'fastify'

// Augmenta FastifyRequest para expor o payload do JWT após authMiddleware
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      sub: string
      email: string
      username: string
    }
  }
}
