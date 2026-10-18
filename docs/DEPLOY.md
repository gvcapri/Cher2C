# Deploy do Cher2C (grátis)

> Guia de out/2026. Cobre: backend na cloud, banco Postgres, mídia (LiveKit) e
> distribuição do app desktop — tudo em camada gratuita.

## O que vai para onde

| Peça | Onde roda | Serviço gratuito sugerido |
|---|---|---|
| Backend (`apps/server` — Fastify + Socket.IO) | Cloud | **Render** (Web Service) |
| Postgres (`drizzle`) | Cloud | **Neon** (free tier) |
| Mídia voz/tela (SFU LiveKit) | Cloud | **LiveKit Cloud** (free tier) |
| Redis | — | dispensado (MVP single-node) |
| App desktop (Electron) | máquinas dos usuários | instalador publicado no **GitHub Releases** |

O app Electron **não é hospedado**: ele conversa com a API publicada e com o
LiveKit. A cloud roda só backend + banco + mídia.

---

## 1. Banco (Neon)

1. Crie a conta em <https://neon.tech> e um projeto (Postgres).
2. Copie o connection string → é o seu `DATABASE_URL`.
3. Rode as migrations (localmente apontando para o Neon, ou no shell da Render):
   ```bash
   npm run db:migrate
   ```

## 2. Mídia (LiveKit Cloud)

1. Crie o projeto em <https://cloud.livekit.io> (plano free/dev).
2. Você recebe 3 valores:
   - `LIVEKIT_URL` → ex.: `wss://seu-projeto.livekit.cloud`
   - `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`
3. O token gerado pelo backend devolve essa URL ao cliente — por isso
   **`VITE_LIVEKIT_URL` (do build do desktop) deve ser exatamente igual ao
   `LIVEKIT_URL` do servidor**, senão a CSP do Electron bloqueia a conexão.

> Por que cloud e não self-host: o LiveKit precisa de ~10k portas UDP, que
> plataformas gratuitas de PaaS não expõem — e o servidor local 1.8.0 está
> desatualizado em relação ao client (ver `docs/ANALISE-APP.md` §2).

## 3. Backend (Render)

1. Suba o repo para o GitHub e crie um **Web Service** em <https://render.com>
   apontando para ele.
2. Configuração:
   - **Build command:** `npm install && npm run build:server`
   - **Start command:** `npm run --workspace=server start`
   - **Health check path:** `/health`
3. Environment variables (o Render injeta em `process.env`; o `dotenv` da raiz
   é ignorado quando o arquivo `.env` não existe):

   | Variável | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | do Neon (com `sslmode=require`) |
   | `JWT_SECRET` | aleatório com **mínimo 32 caracteres** |
   | `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | do LiveKit Cloud |
   | `CORS_ORIGIN` | `*` (recomendado — ver nota abaixo) |
   | `PORT` | a porta que a Render indicar (ela já define `PORT`) |

> **Por que `CORS_ORIGIN=*`:** em produção o Electron carrega a UI via
> `file://`, cujo origin é `Origin: null` — valor que não casa com nenhuma URL
> concreta de uma lista. Teste real no Electron 31 (out/2026) passou até com a
> lista padrão (o Chromium não aplicou CORS às requisições da página `file://`),
> mas usar `*` deixa o comportamento explícito e imune a versões que passem a
> aplicar. A API autentica por Bearer JWT (sem cookies), então refletir origem
> não libera credencial automática. O valor padrão (`http://localhost:5173`)
> segue valendo para dev. Ver `apps/server/src/cors.ts`.

4. (Render free) o serviço **dorme após ~15 min sem tráfego** e acorda em ~1 min
   no primeiro request. Uma chamada ativa não cai; só quem conectar depois de
   ociosidade espera o wake-up.

## 4. App desktop (instalador)

1. No build, o Vite embute as variáveis `VITE_*` do `.env` da **raiz**:
   ```bash
   # apps/desktop/.env NÃO — a raiz do monorepo (mesmo .env do servidor)
   VITE_API_BASE=https://seu-backend.onrender.com   # sem barra final
   VITE_LIVEKIT_URL=wss://seu-projeto.livekit.cloud # = LIVEKIT_URL do server
   ```
   A CSP do `index.html` é gerada a partir dessas duas variáveis
   (`apps/desktop/vite.config.ts`), junto com http/https + ws/wss equivalentes.
2. Gere o instalador:
   ```bash
   npm run build:desktop
   # saída em apps/desktop/release/ (electron-builder)
   ```
3. Publique o `.exe` no **GitHub Releases** da sua conta/repo (grátis) — é por
   lá que os usuários baixam.

> **Windows:** a extração do `winCodeSign` exige symlinks — ative o
> *Developer Mode* do Windows ou build em CI (`windows-latest` do GitHub
> Actions funciona). Ver `docs/ANALISE-APP.md` (limitação conhecida).

---

## Checklist mínimo antes de divulgar

- [ ] `npm run build` completo (shared + server + desktop) sem erros
- [ ] `npm run db:migrate` executado no banco da produção
- [ ] `JWT_SECRET` com ≥32 chars e **diferente** do `.env.example`
- [ ] `CORS_ORIGIN=*`, `VITE_API_BASE` e `VITE_LIVEKIT_URL` preenchidos
- [ ] `/health` respondendo `{"status":"ok"}` no endereço da Render
- [ ] Login → entrar em servidor → voz → screen share testados no instalador

## Limitações do plano gratuito

- Render: sleep após ociosidade (acorda no 1º request).
- LiveKit Cloud free: limite de participantes/minutos (conferir pricing atual).
- Neon: banco suspendido por inatividade em planos free.
- Chat ainda **não persiste** mensagens recebidas por socket (MVP) — ver
  `docs/ANALISE-APP.md` §3.
