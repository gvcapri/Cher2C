import Fastify from 'fastify'
import cors from '@fastify/cors'
import { env } from './env'
import { authRoutes } from './routes/auth'
import { serverRoutes } from './routes/servers'
import { channelRoutes } from './routes/channels'
import { createWebSocketServer } from './ws'

async function main() {
  const app = Fastify({
    logger: { level: env.NODE_ENV === 'production' ? 'info' : 'debug' }
  })

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(','),
    credentials: true
  })

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // Rotas REST
  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(serverRoutes, { prefix: '/api/servers' })
  await app.register(channelRoutes, { prefix: '/api/channels' })

  // WebSocket (Socket.IO montado no mesmo HTTP server)
  await app.ready()
  createWebSocketServer(app.server)

  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  app.log.info(`Servidor rodando em :${env.PORT}`)
}

main().catch((err) => {
  console.error('Falha ao iniciar servidor:', err)
  process.exit(1)
})
