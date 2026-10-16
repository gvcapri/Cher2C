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
| Infra local | Docker (Postgres/Redis) + LiveKit Server (**instalado: 1.8.0**) |
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

### Causa raiz
**Incompatibilidade/ambiente entre `livekit-client 2.22.4` e `livekit-server 1.8.0` (2023):**
a sinalização conecta por fallback, mas a negociação de mídia (RTC) nunca completa — voz e
screen share falham juntos. Não é bug da interface nem do backend.

**Evidência de que o upgrade resolve:** um LiveKit **1.13.10** (release atual) foi validado em
porta separada sem tocar no ambiente: contra o servidor 1.8.0 **ambos** os participantes do
harness falhavam; contra o 1.13.10 **um de dois conecta e publica** (`state: connected`,
`localPublished: 1`) — melhora clara, ainda com instabilidade residual na máquina.

> ⚠️ **Ação necessária (do lado do ambiente, não do código):** atualizar o LiveKit Server de
> **1.8.0 → 1.13.10** (`github.com/livekit/livekit/releases` — `livekit_1.13.10_windows_amd64.zip`
> com `--config ./livekit-host.yaml`). O próprio cliente pede o upgrade.

### Correções feitas no código (validadas por E2E)
| # | Arquivo | Problema | Correção |
|---|---|---|---|
| 1 | `electron/main.ts` | Pedir áudio do sistema não devolvia nenhuma faixa de áudio (`callback` sem `audio`) | `audio: 'loopback'` quando `request.audioRequested` (Windows). **Validado:** tracks `["audio:live","video:live"]` |
| 2 | `src/store.ts` | `startShare` pendurava p/ sempre sem feedback | Guarda de `connectionState` com mensagem clara + timeout de 30 s. **Validado E2E:** toast *"Tempo esgotado ao iniciar o compartilhamento (o LiveKit não respondeu)."* |
| 3 | `layout/ChannelSidebar.tsx` | `void joinVoice(...)` engolia qualquer erro (silêncio total) | `.catch(...)` → toast de erro |
| 4 | `call/ShareModal.tsx` | Texto prometia "seletor do sistema" que não existe no Electron 31 | Texto honesto ("captura automática") |

Observação: o log `wgc_capturer_win.cc(316) Failed to start capture: -2147024809` aparece no
Windows **mesmo quando a captura funciona** (ruído não-fatal do WGC; presente antes das mudanças).

---

## 3. Inconsistências e dívidas identificadas

### Bugs/limitações em aberto
| Item | Severidade | Nota |
|---|---|---|
| LiveKit Server 1.8.0 vs client 2.22.4 | **Crítica** | Causa raiz do incidente acima — upgrade pendente (ambiente) |
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
1. **Atualizar o LiveKit Server** para 1.13.10 (ver §2) — sem isso, voz/chamada/screen share
   permanecem instáveis.
2. **CI mínimo**: `tsc --noEmit` + `vitest` + `vite build` em cada push.
3. **`API_BASE` e CSP parametrizáveis** (`.env`/`import.meta.env`) para sair de localhost.

### P1 — curto prazo
4. Persistir mensagens de chat no servidor (gravar no DB no handler `chat:send`).
5. Testes de componentes (React Testing Library) para AuthScreen, ShareModal e ChatArea;
   testes de rota no servidor.
6. `setPermissionRequestHandler` com política explícita.
7. Picker de compartilhamento com miniaturas (IPC `desktopCapturer` via preload, ou Electron 32+
   com `useSystemPicker`) — o spec original previa a lista de telas/janelas.
8. Volume individual por participante (método pontual no `VoiceCallManager`, já orçado).
9. Rodar `scripts/e2e-media-*` automaticamente (ao menos como checagem manual documentada).

### P2 — médio prazo
10. Code-splitting (reduzir bundle) e lazy loading das telas.
11. Barra de título frameless (token `--titlebar-height` já reservado — decisão pendente).
12. Reconnect/migração de sala, paginação do histórico de chat, E2EE (já no roadmap do README).
13. Câmera de vídeo (a UI de controles já reserva o slot "se existir").

---

## 5. Resumo executivo

- A **reforma visual/UX** está completa e verificada (typecheck 0 erros, 66/66 testes,
  build ok, inspeção computada de estilo no app real).
- O **bug de compartilhamento** teve: (a) correções de UX/funcionalidade no app
  (feedback com timeout, guarda de conexão, áudio do sistema, erros visíveis) validadas
  por E2E automatizado; (b) **causa raiz remanescente no ambiente** — servidor LiveKit
  1.8.0 incompatível com o client 2.22.4 — cuja correção é o upgrade para 1.13.10.
- As maiores dívidas estruturais são: **sem CI, sem testes fora de `media/`, config de
  API/CSP fixa em localhost e chat sem persistência**.
