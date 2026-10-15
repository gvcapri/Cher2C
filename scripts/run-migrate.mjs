// Aplica as migrations do drizzle via node-postgres migrator (runtime),
// contornando o drizzle-kit que falha silenciosamente sem TTY no Windows.
// Uso: node scripts/run-migrate.mjs
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: resolve(root, '.env') })

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL ausente')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url })
await client.connect()
const db = drizzle(client)
await migrate(db, { migrationsFolder: resolve(root, 'apps/server/drizzle') })
await client.end()
console.log('Migrations aplicadas com sucesso')
