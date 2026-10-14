import { config } from 'dotenv'
import { resolve } from 'path'
import { z } from 'zod'

// Carrega .env a partir da raiz do projeto (monorepo)
config({ path: resolve(__dirname, '../../../.env') })

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),

  // Database
  DATABASE_URL: z.string().url(),

  // Auth
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter no mínimo 32 caracteres'),

  // LiveKit (SFU self-hosted)
  LIVEKIT_URL: z.string().url(), // ws://localhost:7880
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),

  // Redis (opcional no MVP single-node)
  REDIS_URL: z.string().url().optional(),

  CORS_ORIGIN: z.string().default('http://localhost:5173')
})

export type Env = z.infer<typeof envSchema>

export const env: Env = envSchema.parse(process.env)
