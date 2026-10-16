// Driver E2E: abre 2 instâncias do Chrome headless (midia fake) apontando p/ o harness
// em :8791, aguarda ambas conectarem no SFU e publicarem/receberem áudio, e imprime os
// resultados (via CDP Runtime.evaluate em window.__result).
//
// Uso: node scripts/e2e-drive.mjs <token1> <token2> <wsUrl>
import { spawn } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'
import { get } from 'http'
import WebSocket from 'ws'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const token1 = process.argv[2]
const token2 = process.argv[3]
const wsUrl = process.argv[4] || 'ws://localhost:7880'
if (!token1 || !token2) {
  console.error('Uso: node scripts/e2e-drive.mjs <token1> <token2> [wsUrl]')
  process.exit(1)
}

const BASE = 'http://127.0.0.1:8791'

function httpGetJson(url) {
  return new Promise((res, rej) => {
    get(url, (r) => {
      let d = ''
      r.on('data', (c) => (d += c))
      r.on('end', () => {
        try { res(JSON.parse(d)) } catch (e) { rej(e) }
      })
    }).on('error', rej)
  })
}

const FLAGS = [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-dev-shm-usage'
]

async function launchChrome(port, who, token) {
  const url = `${BASE}/participant?token=${encodeURIComponent(token)}&who=${who}`
  const args = [
    ...FLAGS,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=C:\\Temp\\e2e-chrome-${who}-${port}`,
    url
  ]
  const proc = spawn(CHROME, args, { stdio: 'ignore' })
  return proc
}

async function connectCdp(port) {
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await httpGetJson(`http://127.0.0.1:${port}/json/list`)
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(500)
  }
  throw new Error('CDP nao disponivel na porta ' + port)
}

function cdpSession(wsUrl) {
  return new Promise((res) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false })
    let id = 0
    const pending = new Map()
    ws.on('open', () => {
      const send = (method, params = {}) =>
        new Promise((r) => {
          const mid = ++id
          pending.set(mid, r)
          ws.send(JSON.stringify({ id: mid, method, params }))
        })
      ws.on('message', (m) => {
        const msg = JSON.parse(m.toString())
        if (msg.id && pending.has(msg.id)) {
          pending.get(msg.id)(msg.result)
          pending.delete(msg.id)
        }
      })
      res({ send, close: () => ws.close(), ws })
    })
  })
}

async function waitForResult(session, who, consoleLogs) {
  for (let i = 0; i < 120; i++) {
    const r = await session.send('Runtime.evaluate', {
      expression: 'window.__done ? JSON.stringify(window.__result) : null',
      returnByValue: true
    })
    if (r && r.result && r.result.value) return JSON.parse(r.result.value)
    await sleep(500)
  }
  // timeout: coleta o log da página p/ diagnostico
  let pageLog = []
  try {
    const l = await session.send('Runtime.evaluate', {
      expression: 'JSON.stringify(window.__log || [])',
      returnByValue: true
    })
    if (l && l.result && l.result.value) pageLog = JSON.parse(l.result.value)
  } catch {}
  return { who, ok: false, error: 'timeout esperando __done', pageLog, consoleLogs }
}

// captura erros/warnings do console de cada pagina (diagnostico de ICE/negociacao)
function attachConsoleCollector(session, sink) {
  session.ws.on('message', (m) => {
    try {
      const msg = JSON.parse(m.toString())
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || [])
          .map((a) => a.value !== undefined ? String(a.value) : (a.description || a.type || ''))
          .join(' ')
        if (msg.params.type === 'error' || msg.params.type === 'warning') {
          sink.push(`[${msg.params.type}] ${text}`)
        }
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails
        sink.push(`[exception] ${d.text} ${d.exception && d.exception.description || ''}`)
      }
    } catch {}
  })
}

const procs = []
try {
  const c1 = await launchChrome(9222, 'A', token1)
  const c2 = await launchChrome(9333, 'B', token2)
  procs.push(c1, c2)

  const ws1 = await connectCdp(9222)
  const ws2 = await connectCdp(9333)
  const s1 = await cdpSession(ws1)
  const s2 = await cdpSession(ws2)
  await s1.send('Runtime.enable')
  await s2.send('Runtime.enable')
  const consoleA = []
  const consoleB = []
  attachConsoleCollector(s1, consoleA)
  attachConsoleCollector(s2, consoleB)

  const [r1, r2] = await Promise.all([
    waitForResult(s1, 'A', consoleA),
    waitForResult(s2, 'B', consoleB)
  ])

  console.log('RESULT_A ' + JSON.stringify(r1))
  console.log('RESULT_B ' + JSON.stringify(r2))
  if (consoleA.length) console.log('CONSOLE_A ' + JSON.stringify(consoleA.slice(-15)))
  if (consoleB.length) console.log('CONSOLE_B ' + JSON.stringify(consoleB.slice(-15)))
  // Assercao FORTE: midia RTP real fluiu (pacotes recebidos > 0 em ambos),
  // nao apenas o evento de subscribe (que sem midia daria falsos positivos).
  const mediaFlowed =
    (r1.pktsDelta > 0 || r1.bytesDelta > 0) && (r2.pktsDelta > 0 || r2.bytesDelta > 0)
  const ok = r1.ok && r2.ok && mediaFlowed
  console.log(
    'mediaFlowed=' + mediaFlowed +
      ' (A pkts=' + r1.pktsDelta + ' bytes=' + r1.bytesDelta +
      ' | B pkts=' + r2.pktsDelta + ' bytes=' + r2.bytesDelta + ')'
  )
  console.log(ok ? 'E2E_MIDIA=PASSOU' : 'E2E_MIDIA=FALHOU')
  process.exitCode = ok ? 0 : 1
  s1.close(); s2.close()
} finally {
  for (const p of procs) { try { p.kill() } catch {} }
}
