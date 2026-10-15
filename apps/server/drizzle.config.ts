import { config } from 'dotenv'
import { existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { defineConfig } from 'drizzle-kit'

/**
 * Carrega o .env da raiz do monorepo. O drizzle-kit empacota este config, então
 * `__dirname` não é confiável — procuramos subindo a partir do cwd (o npm roda
 * este script com cwd = apps/server).
 */
function loadRootEnv(): void {
  const candidates = [resolve(__dirname, '../../../.env'), resolve(__dirname, '../../.env')]
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    candidates.push(join(dir, '.env'))
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  const found = candidates.find((p) => existsSync(p))
  if (found) config({ path: found })
}

loadRootEnv()

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!
  },
  verbose: true,
  strict: true
})
