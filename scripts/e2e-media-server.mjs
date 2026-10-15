// E2E de MÍDIA REAL: sobe um servidor HTTP que serve o bundle do livekit-client e
// uma página de teste; depois abre 2 clientes (Chrome headless, mídia fake) no mesmo
// room e verifica que um publica e o outro RECEBE áudio.
//
// Uso: node scripts/e2e-media-server.mjs <token1> <token2> <wsUrl>
import http from 'http'
import { readFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const token1 = process.argv[2]
const token2 = process.argv[3]
const wsUrl = process.argv[4] || 'ws://localhost:7880'
if (!token1 || !token2) {
  console.error('Uso: node scripts/e2e-media-server.mjs <token1> <token2> [wsUrl]')
  process.exit(1)
}

const bundlePath = resolve(__dirname, '../node_modules/livekit-client/dist/livekit-client.umd.js')
const bundle = await readFile(bundlePath)

const PAGE = (token, who) => `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script src="/livekit.umd.js"></script>
<script>
window.__who = ${JSON.stringify(who)}
window.__log = []
window.__done = false
window.__result = null
const say = (m) => { window.__log.push(m); console.log(m) }
async function run() {
  try {
    const { Room, RoomEvent, ConnectionState } = window.LivekitClient
    const room = new Room({ adaptiveStream: false, dynacast: false })
    window.__room = room
    const remoteAudio = []
    room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      say('TrackSubscribed from=' + participant.identity + ' kind=' + track.kind)
      if (track.kind === 'audio') {
        const el = track.attach()
        document.body.appendChild(el)
        remoteAudio.push({ participant: participant.identity, track, pub })
      }
    })
    room.on(RoomEvent.Connected, () => say('Connected'))
    room.on(RoomEvent.ActiveSpeakersChanged, (sp) => say('Speakers=' + sp.map(p=>p.identity).join(',')))

    await room.connect(${JSON.stringify(wsUrl)}, ${JSON.stringify(token)})
    say('connect resolved, state=' + room.state)

    // Publica microfone (midia fake do Chrome)
    await room.localParticipant.setMicrophoneEnabled(true)
    say('published mic, localTracks=' + room.localParticipant.audioTrackPublications.size)

    // Espera ate 12s pelo track remoto de áudio
    const t0 = Date.now()
    while (Date.now() - t0 < 12000) {
      const hasRemote = remoteAudio.length > 0
      const others = room.remoteParticipants.size
      if (hasRemote) {
        const r = remoteAudio[0]
        // Prova DEFINITIVA de midia: mede pacotes RTP recebidos via getStats.
        // audioLevel depende do fake device emitir tom na janela; packetsReceived
        // só cresce se RTP realmente fluir do par remoto.
        const measureInbound = async () => {
          try {
            const receiver = r.track.receiver || r.track._receiver
            if (receiver && receiver.getStats) {
              const report = await receiver.getStats()
              let pkts = 0, bytes = 0, lvl = 0
              report.forEach((s) => {
                if (s.type === 'inbound-rtp' && s.kind === 'audio') {
                  pkts += s.packetsReceived || 0
                  bytes += s.bytesReceived || 0
                  if (typeof s.audioLevel === 'number') lvl = Math.max(lvl, s.audioLevel)
                }
              })
              return { pkts, bytes, lvl }
            }
          } catch {}
          return { pkts: 0, bytes: 0, lvl: r.track.audioLevel || 0 }
        }
        const before = await measureInbound()
        let maxLevel = before.lvl
        const s0 = Date.now()
        while (Date.now() - s0 < 3000) {
          const cur = await measureInbound()
          if (cur.lvl > maxLevel) maxLevel = cur.lvl
          await new Promise(rq => setTimeout(rq, 150))
        }
        const after = await measureInbound()
        const pktsDelta = after.pkts - before.pkts
        const bytesDelta = after.bytes - before.bytes
        window.__result = {
          who: window.__who, ok: true, state: room.state,
          others, remoteFrom: r.participant, maxLevel,
          pktsReceived: after.pkts, pktsDelta, bytesDelta,
          localPublished: room.localParticipant.audioTrackPublications.size
        }
        window.__done = true
        say('RESULT ' + JSON.stringify(window.__result))
        return
      }
      await new Promise(rq => setTimeout(rq, 250))
    }
    window.__result = { who: window.__who, ok: false, state: room.state,
      others: room.remoteParticipants.size, remoteAudio: remoteAudio.length,
      localPublished: room.localParticipant.audioTrackPublications.size }
    window.__done = true
    say('RESULT ' + JSON.stringify(window.__result))
  } catch (e) {
    window.__result = { who: window.__who, ok: false, error: String(e && e.message || e) }
    window.__done = true
    say('ERROR ' + String(e && e.message || e))
  }
}
run()
</script></body></html>`

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x')
  if (u.pathname === '/livekit.umd.js') {
    res.writeHead(200, { 'content-type': 'application/javascript' })
    return res.end(bundle)
  }
  if (u.pathname === '/participant') {
    const token = u.searchParams.get('token')
    const who = u.searchParams.get('who') || 'anon'
    res.writeHead(200, { 'content-type': 'text/html' })
    return res.end(PAGE(token, who))
  }
  res.writeHead(404); res.end('nf')
})
await new Promise((r) => server.listen(8791, '127.0.0.1', r))
console.log('HARNESS em http://127.0.0.1:8791/participant (aguardando Chrome)')
// mantem vivo; o runner externo abre o Chrome e depois mata o processo
