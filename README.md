# Cher2C

App de comunicação estilo Discord — **foco em chamadas de voz + compartilhamento de tela com áudio do sistema**, onde **o áudio nunca é prejudicado pelo vídeo**.

> Projeto em desenvolvimento por etapas. Ver `docs/architecture/ETAPA-1-ARQUITETURA.md` para a arquitetura completa.

## Etapas

- ✅ **Etapa 1** — Arquitetura, decisões técnicas, riscos
- ✅ **Etapa 2** — Estrutura do repositório + backend (auth, canais, sinalização, tokens SFU) ← atual
- ⬜ Etapa 3 — Cliente com chamada de voz + configuração de áudio
- ⬜ Etapa 4 — Compartilhamento de tela com áudio, simulcast, degradação adaptativa
- ⬜ Etapa 5 — Métricas, testes de rede degradada, otimizações

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
docker compose up -d
```

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
| POST | `/api/channels` | ✓ | Criar canal |
| GET | `/api/channels/:id/voice-token` | ✓ | Token LiveKit p/ entrar no canal de voz |
| GET | `/api/channels/:id/messages` | ✓ | Histórico de chat |

## WebSocket (Socket.IO, path `/ws`)

Eventos: `voice:join`, `voice:leave`, `voice:mute`, `voice:deaf`, `voice:speaking`, `chat:send` (client→server); `voice:state`, `voice:join`, `voice:leave`, `user:speaking`, `chat:message` (server→client). Autenticado via JWT no handshake.

## Design de áudio (crítico — ver Etapa 1)

- Áudio da voz e áudio da tela em **tracks separados** (LiveKit).
- Opus: FEC **ON**; DTX apenas p/ voz; bitrate 64 kbps voz / 128 kbps tela.
- Áudio da tela: **AEC/NS/AGC OFF** (preserva música/jogos).
- Em congestão, o **vídeo degrada primeiro** (res→fps→camadas); áudio protegido.

## Próxima etapa

Etapa 3: cliente Electron com chamada de voz real (join de canal, mute/undeaf, indicador de fala, config de áudio).
