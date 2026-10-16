# Análise geral do aplicativo Cher2C

> Documento de auditoria feita em out/2026 a partir da reconhecimento completo do
> código, da reforma visual/UX e da investigação do bug de compartilhamento de tela.
> Estado avaliado: commits até `docs/ANALISE-APP.md`, `main`.

---

## 1. Visão geral

| Camada | Estado |
|---|---|
| Cliente | Electron 31.7.7 + React 18 + TypeScript + Vite 5 (CSS Modules + variáveis) |
| Mídia | WebRTC via LiveKit (**client `livekit-client 2.22.4`**) |
| Backend | Fastify + Drizzle + Postgres + Socket.IO (sinalização/presença/chat) |
| Infra local | Docker (Postgres/Redis) + LiveKit Server **1.13.10 rodando NATIVO no host** (`npm run dev:sfu`; perfil opcional `docker-sfu` no compose p/ Linux/CI) |
| Qualidade | 66 testes unitários (`vitest`) **só em `src/media/`**; harness E2E de mídia em `scripts/` |

**Fluxos principais:** auth (JWT) → servidores/canais → chat (REST histórico + socket ao vivo) →
canal de voz (token SFU → `VoiceCallManager` → LiveKit room) → screen share
(`getDisplayMedia` → publicação simulcast + track de áudio separada) → métricas de debug.

### Pontos fortes
- **Arquitetura de mídia sólida e testada**: áudio da voz/tela em tracks separadas com configs
  distintas (AEC/NS/AGC OFF no áudio da tela), política de banda que reserva o áudio antes do
  vídeo, presets de screen share com simulcast — tudo em código **puro** com **66 testes**.
- Design system completo (tokens, tema claro/escuro, 15 componentes base), Inter embutida
  localmente (sem CDN), shell estilo Discord com atalhos, ARIA e `prefers-reduced-motion`.
- Harness E2E de mídia real (`scripts/e2e-media-server.mjs` + `e2e-drive.mjs`) — ativo valioso.
- Documentação de arquitetura por etapas (`docs/architecture/`) e README detalhado.

---

## 2. Incidente: "erro ao compartilhar a tela" (out/2026)

### Diagnóstico (reproduzido com E2E automatizado no app real)
1. A captura de tela em si **funciona** (teste direto de `getDisplayMedia` no Electron real).
2. O fluxo completo (login → servidor → canal → "Compartilhar") **pendurava sem nenhum
   feedback** ou falhava com erro críptico do LiveKit.
3. O console mostrava, em ciclos infinitos:
   - `Initial connection failed: v1 RTC path not found. Consider upgrading your LiveKit server version`
   - `connected to Livekit Server edition: 0, version: 1.8.0, protocol: 15`
   - `NegotiationError: negotiation timed out` → desconexão → retry
4. **O harness E2E do próprio projeto falhou**: `E2E_MIDIA=FALHOU` (`could not establish
   pc connection`, `mediaFlowed=false`) — mesmo teste que o README documenta como `PASSOU`.

### Causa raiz — RESOLVIDA nesta rodada
Foram **três** problemas empilhados (nenhum deles na interface):

**A. SFU em Docker inalcançável do host (o bloqueador principal).**
O LiveKit em container anunciava candidatos ICE com o IP interno da rede Docker
(`172.19.0.4`), que **não é alcançável do host Windows** — provado com
`curl http://172.19.0.4:7880 → 000` contra `http://localhost:7880 → 200` (proxy de porta
publicada). A sinalização (ws/TCP) funcionava — sala, membros e chat ok — mas a **mídia
(RTP/UDP) nunca conectava**: `publishing rejected as engine not connected within timeout`.
Também se testou `network_mode: host`, que no Docker Desktop **não** encaminha a porta ao
Windows (`localhost:7880` recusava) — descartado com evidência.

**B. `identity = userId` → kick mútuo (DUPLICATE_IDENTITY).**
Dois tokens do mesmo usuário (2 janelas, 2 máquinas ou o próprio E2E) geravam a MESMA
identity e o LiveKit (política default REPLACE) derrubava o participante anterior com
`DisconnectReason.DUPLICATE_IDENTITY` — o enum confirma: **2 = DUPLICATE_IDENTITY**, o
mesmo `Disconnected reason=2` capturado. Explicava o padrão "sempre exatamente um
participante falhava", com inversão aleatória de quem chegava por último.

**C. Versão do servidor (1.8.0/2023 × client 2.22.4).**
Os ciclos `v1 RTC path not found. Consider upgrading...` e `NegotiationError: negotiation
timed out` vinham da validação HTTP pós-queda de WS, inexistente no servidor antigo.

**Resolução aplicada:**
- SFU **nativo no Windows** via `npm run dev:sfu` (`scripts/livekit-dev.mjs` — baixa o binário
  **1.13.10** se faltar, config `livekit-host.yaml`); no compose o serviço virou perfil
  opcional: `docker compose --profile docker-sfu up -d`.
- Identity única por sessão: `` `${userId}#${randomUUID().slice(0, 8)}` `` em
  `server/src/services/livekit.ts` (com "Sua tela" no CallStage aceitando o prefixo).

**Validação (E2E):**
- Harness: **`E2E_MIDIA=PASSOU`** — RTP fluindo nos dois sentidos (A: pkts=101/bytes=14354;
  B: pkts=146/bytes=28481; `mediaFlowed=true`, exit 0).
- Repro no Electron real: toast **"Compartilhamento iniciado"**, `shareActive: true`,
  `late: []` (nenhum erro) e console `connected to Livekit Server version: 1.13.10`.
- Typecheck desktop/server 0 erros.

### Correções feitas no código (validadas por E2E)
| # | Arquivo | Problema | Correção |
|---|---|---|---|
| 1 | `electron/main.ts` | Pedir áudio do sistema não devolvia nenhuma faixa de áudio (`callback` sem `audio`) | `audio: 'loopback'` quando `request.audioRequested` (Windows). **Validado:** tracks `["audio:live","video:live"]` |
| 2 | `src/store.ts` | `startShare` pendurava p/ sempre sem feedback | Guarda de `connectionState` com mensagem clara + timeout de 30 s. **Validado E2E:** toast *"Tempo esgotado ao iniciar o compartilhamento (o LiveKit não respondeu)."* |
| 3 | `layout/ChannelSidebar.tsx` | `void joinVoice(...)` engolia qualquer erro (silêncio total) | `.catch(...)` → toast de erro |
| 4 | `call/ShareModal.tsx` | Texto prometia "seletor do sistema" que não existe no Electron 31 | Texto honesto ("captura automática") |
| 5 | `server/services/livekit.ts` | `identity = userId` → LiveKit derrubava a sessão anterior do mesmo usuário (kick DUPLICATE_IDENTITY) | Identity única `userId#sufixo` por token. **Validado:** 2 sessões simultâneas no harness com `E2E_MIDIA=PASSOU` |
| 6 | `docker-compose.yml` + `scripts/livekit-dev.mjs` | SFU em Docker inalcançável do host (ICE `172.x`) | SFU nativo (`npm run dev:sfu`, v1.13.10); serviço Docker virou perfil `docker-sfu` |
| 7 | `scripts/e2e-media-server.mjs` + `e2e-drive.mjs` | Harness emitia só "timeout" sem diagnóstico | Console do Chrome, `RoomEvent.Error` e dump dos pares de candidatos ICE via `getStats` |

Observação: o log `wgc_capturer_win.cc(316) Failed to start capture: -2147024809` aparece no
Windows **mesmo quando a captura funciona** (ruído não-fatal do WGC; presente antes das mudanças).

---

## 3. Inconsistências e dívidas identificadas

### Bugs/limitações em aberto
| Item | Severidade | Nota |
|---|---|---|
| Histórico de chat não persiste mensagens recebidas por socket | Alta | `chat:send` só faz broadcast; ao recarregar, a mensagem some (MVP declarado no README) |
| `API_BASE` hardcoded `http://localhost:4000` em `api.ts` | Alta | Quebra qualquer uso fora de dev; deveria vir de `import.meta.env` |
| CSP com hosts fixos (`localhost:4000/7880`) | Média | Precisa de ajuste quando houver deploy com host real |
| Permissões do Electron no default (`setPermissionRequestHandler` não configurado) | Média | Tudo é concedido silenciosamente; definir política explícita (mic/câmera) |
| Picker de fontes com miniaturas (spec) inexistente | Média | `preload` só expõe `platform/versions`; Electron 31 não tem `useSystemPicker` (v32+) |
| Volume por participante (clique direito no avatar) | Média | Exige método em `media/voiceCall.ts` — pendente de autorização |
| `setViewerScreenQuality('auto')` não restaura `adaptiveStream` de verdade | Baixa | Limitação do SDK, já documentada no código |
| `electron-builder` falha nesta máquina | Baixa | Extração de `winCodeSign` exige symlinks (Developer Mode do Windows) — limitação de ambiente; range do electron já fixado em `31.7.7` |
| Console `SyntaxError` intermitente em testes automatizados | Baixa | Artefato dos harnesses de teste, não do app |

### Lacunas de qualidade
- **Zero testes de UI/componentes** e **zero testes no servidor** (`vitest run` só cobre `src/media/`).
- **Sem CI** — nada roda testes/build automaticamente em push.
- Harness E2E de mídia **só manual** — deveria rodar ao menos em CI local/agente.
- Bundle JS **847 kB** (>500 kB — warning do Vite): candidato a code-splitting (React lazy nas telas).
- Sem testes de regressão do fluxo de screen share (o bug atual passaria de novo).

---

## 4. Melhorias priorizadas

### P0 — essencial
1. **CI mínimo**: `tsc --noEmit` + `vitest` + `vite build` em cada push.
2. **`API_BASE` e CSP parametrizáveis** (`.env`/`import.meta.env`) para sair de localhost.
3. **E2E de mídia como guarda de regressão** (`scripts/e2e-media-server.mjs` + `e2e-drive.mjs`)
   rodando ao menos em CI local — sem ele, uma regressão do fluxo de voz/share passaria
   despercebida (foi exatamente o caso deste incidente).

### P1 — curto prazo
4. Persistir mensagens de chat no servidor (gravar no DB no handler `chat:send`).
5. Testes de componentes (React Testing Library) para AuthScreen, ShareModal e ChatArea;
   testes de rota no servidor.
6. `setPermissionRequestHandler` com política explícita.
7. Picker de compartilhamento com miniaturas (IPC `desktopCapturer` via preload, ou Electron 32+
   com `useSystemPicker`) — o spec original previa a lista de telas/janelas.
8. Volume individual por participante (método pontual no `VoiceCallManager`, já orçado).

### P2 — médio prazo
9. Code-splitting (reduzir bundle) e lazy loading das telas.
10. Barra de título frameless (token `--titlebar-height` já reservado — decisão pendente).
11. Reconnect/migração de sala, paginação do histórico de chat, E2EE (já no roadmap do README).
12. Câmera de vídeo (a UI de controles já reserva o slot "se existir").

---

## 5. Resumo executivo

- A **reforma visual/UX** está completa e verificada (typecheck 0 erros, 66/66 testes,
  build ok, inspeção computada de estilo no app real).
- O **bug de compartilhamento foi resolvido por completo**: (a) correções de UX/funcionalidade
  no app (feedback com timeout, guarda de conexão, áudio do sistema, erros visíveis) e
  (b) causa raiz do ambiente — SFU em Docker inalcançável (ICE `172.x`) + identity duplicada
  (kick DUPLICATE_IDENTITY) + servidor 1.8.0 — corrigida com SFU nativo 1.13.10
  (`npm run dev:sfu`) e identity única por sessão. **Prova:** `E2E_MIDIA=PASSOU` e repro no
  app real com `shareActive: true` e nenhum erro.
- As maiores dívidas estruturais são: **sem CI, sem testes fora de `media/`, config de
  API/CSP fixa em localhost e chat sem persistência**.
