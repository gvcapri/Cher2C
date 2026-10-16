// Sobe o LiveKit SFU NATIVO no Windows (dev local).
//
// Por que não Docker: em bridge, o container anuncia candidatos ICE com o IP interno
// da rede Docker (ex.: 172.19.0.4), inalcançável do host -> a sinalização (porta
// publicada/TCP) funciona, mas a mídia (RTP/UDP) nunca conecta e o publish falha com
// "publishing rejected as engine not connected within timeout". Com network_mode: host,
// o WSL/Docker Desktop não encaminha a porta para o Windows (localhost:7880 recusa).
// Rodando nativo, o SFU anuncia o IP LAN real da máquina e o WebRTC conecta.
// (Ver livekit-host.yaml e docs/ANALISE-APP.md.)
//
// Uso: node scripts/livekit-dev.mjs   (ou: npm run dev:sfu)
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const BIN_DIR = join(ROOT, 'tools', 'livekit')
const BIN = join(BIN_DIR, 'livekit-server.exe')
const CONFIG = join(ROOT, 'livekit-host.yaml')
const VERSION = '1.13.10'
const ZIP_URL = `https://github.com/livekit/livekit/releases/download/v${VERSION}/livekit_${VERSION}_windows_amd64.zip`

function portaOcupada(porta) {
  return new Promise((res) => {
    const s = createConnection({ port: porta, host: '127.0.0.1' })
    s.once('connect', () => { s.destroy(); res(true) })
    s.once('error', () => res(false))
    s.setTimeout(1500, () => { s.destroy(); res(false) })
  })
}

function seedLocal() {
  // Nesta máquina o binário já foi baixado em ciclos anteriores (evita re-download).
  for (const c of ['C:/Temp/livekit-bin/livekit-server.exe', join(process.env.TEMP || '', 'lk-test/livekit-server.exe')]) {
    if (existsSync(c)) { copyFileSync(c, BIN); console.log(`[livekit] binário copiado de ${c}`); return true }
  }
  return false
}

async function ensureBinary() {
  if (existsSync(BIN)) return
  mkdirSync(BIN_DIR, { recursive: true })
  if (!seedLocal()) {
    console.log(`[livekit] baixando livekit-server v${VERSION}...`)
    const res = await fetch(ZIP_URL)
    if (!res.ok) throw new Error(`download falhou (HTTP ${res.status}): ${ZIP_URL}`)
    const zip = join(BIN_DIR, 'livekit.zip')
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()))
    execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `Expand-Archive -Force -Path "${zip}" -DestinationPath "${BIN_DIR}"`],
      { stdio: 'inherit' }
    )
    rmSync(zip, { force: true })
  }
  if (!existsSync(BIN)) throw new Error(`binário não encontrado em ${BIN}`)
}

async function main() {
  if (process.platform !== 'win32') {
    console.error('[livekit] este script é para dev no Windows. Em Linux, use: docker compose --profile docker-sfu up -d')
    process.exit(1)
  }
  if (await portaOcupada(7880)) {
    console.error('[livekit] porta 7880 já em uso — outro LiveKit (ou serviço) já está rodando.')
    process.exit(1)
  }
  if (!existsSync(CONFIG)) throw new Error(`config não encontrado: ${CONFIG}`)
  await ensureBinary()

  console.log(`[livekit] subindo LiveKit v${VERSION} em ws://localhost:7880 (config: livekit-host.yaml)`)
  const child = spawn(BIN, ['--config', CONFIG], { stdio: 'inherit', cwd: ROOT })
  child.on('exit', (code) => process.exit(code ?? 0))
}

main().catch((e) => {
  console.error('[livekit] erro:', e.message || e)
  process.exit(1)
})
