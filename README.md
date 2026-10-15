# Cher2C

App de comunicação estilo Discord — **foco em chamadas de voz + compartilhamento de tela com áudio do sistema**, onde **o áudio nunca é prejudicado pelo vídeo**.

> Projeto em desenvolvimento por etapas. Ver `docs/architecture/ETAPA-1-ARQUITETURA.md` para a arquitetura completa.

## Etapas

- ✅ **Etapa 1** — Arquitetura, decisões técnicas, riscos
- ✅ **Etapa 2** — Estrutura do repositório + backend (auth, canais, sinalização, tokens SFU)
- ✅ **Etapa 3** — Cliente com chamada de voz + configuração de áudio
- ✅ **Etapa 4** — Compartilhamento de tela com áudio, simulcast, degradação adaptativa
- ✅ **Etapa 5** — Métricas de depuração, testes de rede degradada ← atual

## Stack

| Camada | Tecnologia |
|---|---|
| Cliente desktop | Electron + TypeScript + React + Vite |
| Mídia | WebRTC via **LiveKit SFU** (self-hosted) |
| Backend | Node.js + TypeScript + Fastify |
| DB | PostgreSQL + Drizzle ORM |
| WebSocket | Socket.IO (sinalização, presença, chat) |
| Auth | JWT + bcrypt |

## Estrutura do repositório

```
cher2c/
├── apps/
│   ├── server/          # Backend (Fastify + Drizzle + Socket.IO)
│   └── desktop/         # Cliente Electron + React
├── packages/
│   └── shared/          # Tipos compartilhados
├── docs/architecture/   # Documentação da arquitetura
├── docker-compose.yml   # Postgres + Redis + LiveKit
├── livekit.yaml         # Config do LiveKit self-hosted
└── .env.example         # Variáveis de ambiente
```

## Setup (desenvolvimento)

### 1. Requisitos
- Node.js 20+
- Docker + Docker Compose

### 2. Instalar dependências
```bash
npm install
```

### 3. Subir infraestrutura (Postgres + Redis + LiveKit)
```bash
# Postgres + Redis em Docker; LiveKit roda NATIVO no host (ver nota abaixo)
docker compose up -d postgres redis

# LiveKit SFU nativo no host (necessário p/ WebRTC no Windows):
#   baixe livekit-server.exe (github.com/livekit/livekit/releases) e rode:
livekit-server --config ./livekit-host.yaml
```

> **Por que o LiveKit nativo e não no Docker?** No Windows, o SFU em container
> anuncia candidatos ICE com o IP interno da rede Docker (ex.: `172.19.0.4`),
> inalcançável pelo cliente no host. A sinalização funciona, mas a **mídia (RTP)
> nunca flui** → `PEER_CONNECTION_DISCONNECTED` e áudio mudo. Rodando nativo, o SFU
> anuncia as interfaces reais do host e o WebRTC conecta. (Em Linux com
> `network_mode: host` o Docker funciona; ver `livekit.yaml` p/ esse caso.)

> Nota: `npm run db:migrate` pode falhar sem TTY no Windows (bug do drizzle-kit).
> Nesse caso use `node scripts/run-migrate.mjs`, que aplica as mesmas migrations
> via migrador de runtime do drizzle-orm.

### 4. Configurar ambiente
```bash
cp .env.example .env
# (valores dev já funcionam com o docker-compose/livekit.yaml)
```

### 5. Gerar e aplicar migrations do banco
```bash
npm run db:generate   # gera SQL a partir do schema Drizzle
npm run db:migrate    # aplica no Postgres
```

### 6. Rodar backend + cliente
```bash
npm run dev           # server (:4000) + desktop (Vite :5173 + Electron)
```

Ou separadamente:
```bash
npm run dev:server
npm run dev:desktop
```

## API do Backend (resumo)

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/health` | ✗ | Health check |
| POST | `/api/auth/register` | ✗ | Criar conta (email/user/senha) |
| POST | `/api/auth/login` | ✓ | Login → JWT |
| GET | `/api/auth/me` | ✓ | Perfil do usuário |
| GET | `/api/servers` | ✓ | Listar servidores do usuário |
| POST | `/api/servers` | ✓ | Criar servidor (+ canais padrão) |
| GET | `/api/servers/:id` | ✓ | Detalhes (canais + membros) |
| POST | `/api/servers/join` | ✓ | Entrar num servidor via código de convite |
| GET | `/api/servers/:id/invite` | ✓ | Gerar código de convite (o serverId) |
| POST | `/api/channels` | ✓ | Criar canal |
| GET | `/api/channels/:id/voice-token` | ✓ | Token LiveKit p/ entrar no canal de voz |
| GET | `/api/channels/:id/messages` | ✓ | Histórico de chat |

## WebSocket (Socket.IO, path `/ws`)

Eventos: `voice:join`, `voice:leave`, `voice:mute`, `voice:deaf`, `voice:speaking`, `chat:send` (client→server); `voice:state`, `voice:join`, `voice:leave`, `user:speaking`, `chat:message` (server→client). Autenticado via JWT no handshake.

## Design de áudio (crítico — ver Etapa 1)

- Áudio da voz e áudio da tela em **tracks separados** (LiveKit).
- Opus: FEC **ON**; DTX apenas p/ voz; bitrate 64 kbps voz / 128 kbps tela.
- Áudio da tela: **AEC/NS/AGC OFF** (preserva música/jogos) + `restrictOwnAudio` (anti-eco, Chromium).
- Em congestão, o **vídeo degrada primeiro** (res→fps→camadas); áudio protegido.

## Screen share (Etapa 4)

- **Simulcast 3 camadas** por preset; cada espectador recebe a camada adequada (ou escolhe manualmente: auto/360p/540p/1080p).
- **Presets**: 720p30 (1.5 Mbps), 1080p30 (2.5 Mbps), 1080p60 (3.5 Mbps) — limites de bitrate que não competem com o áudio.
- **contentHint**: `detail` (texto/código → `maintain-resolution`) vs `motion` (jogos → `maintain-framerate`).
- **Política de banda** (`media/bandwidth.ts`, testada): reserva o áudio ANTES do vídeo; o vídeo recebe só o que sobra e degrada (res→fps) sem tocar no áudio.

### Aceleração por hardware (NVENC/AMF/QuickSync/VideoToolbox)

A escolha do encoder de hardware é feita **automaticamente pelo stack WebRTC do browser/Electron** (Chromium usa NVENC/QSV/VideoToolbox quando disponível, com fallback p/ software). Não há API de cliente p/ forçar um encoder específico. Mitigamos impacto de CPU (que causaria engasgos no áudio) limitando o bitrate de vídeo por preset e usando `degradationPreference`, mantendo folga de CPU p/ o áudio. É uma **limitação de plataforma** transparente.

## Métricas de depuração (Etapa 5)

- **Coletor puro** (`media/metrics.ts`, testado): lê RTCStats de todas as tracks (enviadas e recebidas) e calcula por diferença entre amostras: **bitrate, perda de pacotes, jitter, RTT, fps, resolução, nível de áudio** e limitação do encoder (`cpu`/`bandwidth`).
- **Saúde da rede**: classificada em `good`/`limited`/`poor` por limiares de perda (≤1%/≤5%), RTT (≤100/≤250 ms) e jitter (≤30/≤100 ms).
- **UI** (`DebugMetricsPanel`): painel de depuração com resumo da conexão (RTT, perda, jitter, banda de saída da BWE), tabela por track e medidor de áudio por participante.
- **Testes de rede degradada** (`media/degradedNetwork.test.ts`): cenário 5% perda + 200 ms RTT é detectado como `limited`; a política de banda mantém o áudio integral e o vídeo cai primeiro (até zerar) em qualquer nível de degradação testado.
- Coleta a cada 1 s via `getRTCStatsReport()` (sender/receiver), pausada fora de `Connected`.

## Validação ponta a ponta (E2E de mídia real)

Com infra real rodando, o caminho completo foi validado com **dois clientes WebRTC reais** (Chrome headless, mídia fake) no mesmo canal de voz:

- **Fluxo**: backend autentica → emite token LiveKit → cliente conecta ao SFU → publica microfone → **RTP de áudio flui nos dois sentidos**.
- **Resultado**: `E2E_MIDIA=PASSOU` — ambos `state: connected`, receberam ~120–143 pacotes RTP (18–30 KB) de áudio e `audioLevel` chegou a 1.0.
- **Harness**: `scripts/e2e-media-server.mjs` (serve o bundle livekit-client + página) e `scripts/e2e-drive.mjs` (abre 2 Chromes via CDP e verifica pacotes RTP recebidos > 0 — asserção forte, não só o evento de subscribe).
- Também validado via curl: registro/login, criação de servidor (canais padrão), geração de token SFU (assinatura JWT confere com o secret), e **join de servidor** (um usuário não-membro entra por código e passa a listar o servidor).

## Bugs corrigidos nesta etapa (para o app ficar funcional)

1. **`@fastify/jwt` nunca registrado** — `authMiddleware` chamava `request.jwtVerify()` sem o plugin → toda rota protegida retornava 401. Corrigido em `server/src/index.ts`.
2. **Schema `members` com DUAS primary keys** (`id` + composta `user_id,server_id`) — o Postgres rejeitava a migration. `id` virou `unique()`; a PK real é a composta. Migration regenerada.
3. **`drizzle.config.ts` não carregava o `.env`** da raiz do monorepo → `DATABASE_URL` indefinida. Corrigido (procura o `.env` subindo do cwd).
4. **WebRTC no Windows**: SFU em Docker não roteia mídia p/ o host (ver nota do setup). LiveKit agora roda nativo (`livekit-host.yaml`).
5. **Sem forma de um 2º usuário entrar num servidor** — adicionado `POST /api/servers/join` + UI (campo de código no sidebar).

## Limitações conhecidas

- O código de convite é o próprio **serverId** (MVP); um código aleatório curto exigiria tabela/cache de convites.
- **`apps/server` não tem testes unitários** ainda (o `vitest run` do server sai com código 1 por não achar arquivos de teste — pré-existente, não introduzido aqui).
- E2EE, reconnect/migração de sala e chat completo seguem pendentes.

## Próxima etapa

Etapas 1–5 concluídas e **validadas ponta a ponta com infra real**. Próximos passos: testes de backend, E2EE, chat completo, reconnect/migração de sala e empacotamento do Electron (electron-builder).
