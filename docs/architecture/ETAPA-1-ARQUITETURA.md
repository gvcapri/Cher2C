# Etapa 1: Arquitetura, Decisões Técnicas e Riscos

> **Cher2C** - App de comunicação estilo Discord com foco em chamadas de voz e compartilhamento de tela  
> **Prioridade crítica:** A qualidade do áudio NUNCA pode ser prejudicada pelo compartilhamento de tela. Quando CPU/rede estiverem apertadas, o vídeo degrada primeiro; o áudio é a última coisa a sofrer.

## 1. Visão Geral e Objetivos

### 1.1 Objetivo do MVP
Desenvolver uma aplicação desktop (Electron) para comunicação em tempo real com:
- Servidores e canais de voz (estilo Discord)
- Chamadas de voz com indicador de quem fala, mute/undeaf
- Compartilhamento de tela com opção de incluir áudio do sistema/aplicativo
- Seleção de qualidade (manual/automática) para espectadores
- Chat de texto básico por canal

### 1.2 Princípios Arquiteturais (não negociáveis)
1. **Áudio sempre tem prioridade máxima** sobre vídeo em todos os níveis (captura, encoding, transmissão, rede, recepção, jitter buffer)
2. **Separação estrita de tracks de áudio**: voz (mic) e áudio da tela devem ser tracks separados, nunca misturados no track de vídeo
3. **Rede SFU (não mesh P2P)** para escalabilidade e controle centralizado de qualidade por espectador
4. **Controle adaptativo que protege o áudio**: degradação de vídeo (res→fps→camadas) antes de qualquer degradação no áudio
5. **Transparente sobre limitações por SO**: documentar claramente o que é possível vs. limitações em cada plataforma

## 2. Diagrama de Componentes

### 2.1 Arquitetura Geral

```text
Cliente (Electron + React + TS)
  ├─ UI (React): canais, voz, share, métricas debug
  ├─ Media Manager: captura (mic, tela+áudio), track separation
  ├─ WebRTC Client (LiveKit SDK): publicação/subscrição, simulcast, BWE
  └─ Signaling/Chat (Socket.IO/WebSocket): canais, presença, chat

Backend (Node + TS)
  ├─ API REST (Express/Fastify): auth, servers, channels
  ├─ Auth: JWT + OAuth (Google/GitHub opcional)
  ├─ WebSocket: presença, eventos de voz, chat
  ├─ SFU (LiveKit Server self-hosted): rooms, tokens, routing, simulcast
  └─ DB (Postgres + Prisma/Drizzle): users, servers, channels, members

Infra
  ├─ Redis (opcional p/ escala horizontal LiveKit/WS)
  └─ Turn/Stun (coturn ou integrado LiveKit)
```

### 2.2 Fluxo de Dados - Chamada de Voz

```text
Mic → getUserMedia(audio: micConfig) → Track Áudio Voz (Opus, AEC/NS/AGC ON)
  → Publish p/ Room (Track separado, alta prioridade)
  → SFU replica p/ subscribers
  → Subscribers recebem track de voz (jitter buffer adaptativo + PLC)
```

### 2.3 Fluxo de Dados - Compartilhamento de Tela + Áudio

```text
Tela: desktopCapturer/getDisplayMedia(video) → Video Track (Simulcast/SVC)
Áudio da Tela: getDisplayMedia/displayStream com audio (ou fonte nativa por SO)
  → Track Áudio Tela (SEPARADO do vídeo). Config: AEC OFF, NS OFF, AGC OFF
  → Ambos publicados como tracks independentes (mesma room, diferentes track types)
SFU envia camadas de vídeo distintas por subscriber (base/mid/high) conforme BWE
Áudio tela nunca é re-encodado junto com vídeo; mantém track próprio
```

### 2.4 Prevenção de Eco/Feedback (crucial)

**Problema 1:** O próprio usuário transmitindo não deve ouvir seu próprio áudio de volta  
**Solução:** Uso de `echoCancellation: false` no track de áudio da tela (não aplicável) e, principalmente, **não subscrever o próprio track de áudio da tela**. No cliente que está compartilhando, ao publicar o track de áudio do sistema, ele **NÃO** deve criar um áudio local (local playback) desse track. Apenas publicar. Para voz, o próprio mic pode ter AEC local, mas não ouvimos loopback da call.

**Problema 2:** Áudio do sistema capturado não deve incluir a própria call do app (evitar feedback/echo infinito)  
**Como evitar?** Depende da plataforma:
- Windows: Capturar apenas janelas/app selecionado (Window Capture) ao invés de tela inteira com loopback global quando possível. Se usar Desktop Audio (loopback), o áudio gerado pelo próprio Electron **pode** ser incluído. Mitigações: (a) ao compartilhar tela cheia, excluir a janela do próprio app (se desktopCapturer permitir), (b) usar captura por aplicação (per-app) quando disponível, (c) no próprio app, durante share com áudio, evitar tocar áudio pelo mesmo device de saída que está sendo capturado (mudo relativo) - mas complexo. Alternativa prática: recomendar compartilhar janela específica (não tela cheia incluindo a janela do app) quando incluir áudio. Isso é limitação conhecida do loopback do Windows.
- macOS (ScreenCaptureKit): Permite capturar áudio de um display/application específico; teoricamente não inclui áudio do próprio processo se bem isolado.
- Linux (PipeWire): Pode excluir o próprio app via node targeting/streams.

Detalhes completos na seção 5.

### 2.5 Priorização de Tráfego (QoS)
- **WebRTC**: `priority`/`networkPriority` em RTCRtpEncodingParameters para streams de áudio (high) vs vídeo (low/medium conforme camada). LiveKit gerencia isso.
- **DSCP**: Difícil controlar no Electron/browser, mas SFU e rede podem respeitar. Documentado como desejável, não garantido cross-platform.
- **BWE orientado a prioridade**: Política de adaptação: nunca reduzir bitrate de áudio tracks antes de atingir mínimo de vídeo (ou desativar camadas mais altas). Configurar `degradationPreference` + lógica customizada para garantir preferência absoluta ao áudio.

## 3. Decisões Técnicas

### 3.1 SFU: LiveKit self-hosted vs mediasoup

**Recomendação: LiveKit (self-hosted)**

| Critério | LiveKit (self-hosted) | mediasoup | Decisão |
|---|---|---|---|
| Simplicidade p/ MVP | **Excelente**. SDKs prontos (Web/Electron), rooms, tokens, simulcast built-in | Médio/Alto. Muito low-level, implementar rooms/signaling próprio | **LiveKit** vence p/ velocidade + corretude |
| Simulcast/SVC | Nativo, fácil configurar por track | Suporte existe, mas configurar manualmente | LiveKit |
| Separação de tracks | Excelente (audio/video/data tracks independentes) | Excelente | Empate |
| Priorização áudio | Suporta prioridades, e arquitetura facilita proteger áudio | Flexível, mas você implementa política | LiveKit (menos chance de erro) |
| Self-host | Fácil (Docker, LiveKit Cloud-like self-host). `livekit-server` + `livekit-cli` | Self-host livre, mas ops mais manual | LiveKit OK |
| Escalabilidade | Bom p/ MVP; pode escalar com Redis/regions | Excelente, muito customizável | mediasoup melhor longo prazo |
| Manutenção | Menor superfície de código própria | Maior (mais código nosso) | **LiveKit** p/ MVP |

**Justificativa:** Os requisitos são bem específicos (proteção absoluta do áudio, simulcast, tracks separados). Com mediasoup teríamos que reinventar bastante lógica de rooms, tokens, BWE policy e gerenciamento de camadas. LiveKit nos dá essas primitivas com menos superfície de erro, permitindo focar na lógica de negócio e na correta configuração de áudio (ponto crítico). A troca é flexibilidade vs. velocidade+robustez. Para MVP com deadline/prioridades claras, **LiveKit self-hosted é a melhor escolha**.

**Alternativa se LiveKit não couber:** mediasoup v3 - justificável se precisarmos de controle extremo de políticas. Mas não recomendado agora.

### 3.2 Codec de Áudio

**Opus** - obrigatório conforme requisito. Configurações exatas:

| Track | Codec | Bitrate alvo | Max bitrate | FEC | DTX | PLC | Observações |
|---|---|---|---|---|---|---|---|
| **Voz (mic)** | Opus (mono) | 64 kbps | ~80 kbps | **ON (true)** | **ON** (apenas p/ voz inativa) | Automático (built-in) | DTX permitido p/ economizar banda quando silêncio. FEC essencial p/ perda de pacotes. |
| **Áudio da tela (system audio)** | Opus (estéreo preferido) | 128 kbps | 160-192 kbps | **ON (true)** | **OFF** | Automático | **CRÍTICO:** DTX = OFF. Música, jogos, efeitos têm silêncio intermitente natural; DTX cortaria transições, causaria artefatos. Estéreo se fonte for estéreo. |

**Notas:**
- Opus já tem PLC (Packet Loss Concealment) embutido. Jitter buffer adaptativo complementa.
- Para áudio da transmissão (screen share audio), DTX **DEVE** estar desligado (requisito 2.3).

### 3.3 Processamento de Áudio (AEC/NS/AGC)

| Track | Echo Cancellation (AEC) | Noise Suppression (NS) | Auto Gain Control (AGC) | Motivo |
|---|---|---|---|---|
| **Microfone (voz)** | **ON** | **ON** (moderado) | **ON** | Usuário em ambiente com ruído/eco de alto-falante. Comum em calls. |
| **Áudio da tela** | **OFF** | **OFF** | **OFF** | **CRÍTICO.** Destrói música, áudio de jogos, ambiência, efeitos sonoros. Remove detalhes e causa distorção/artifacts. Requisito 3. |

**Importante:** `echoCancellation: false` no track de áudio da tela não é para evitar eco de quem escuta, é para **não danificar o conteúdo** (música/games). O eco de feedback entre app/captura é tratado por isolamento (seção 2.4 + 5), não por AEC.

### 3.4 Vídeo - Degradação e Qualidade

**degradationPreference:** Configurar conforme conteúdo + permitir override do usuário.
- `detail` (clarity): Prioriza nitidez. Ideal p/ texto, código, apresentações, documentos. Reduz fps antes de resolução? Ou prioriza resolução. Com `detail`, tende a manter resolução, cortar fps.
- `motion`: Prioriza fluidez. Ideal p/ jogos, vídeos, animações. Mantém fps, reduz resolução primeiro.

**User toggle:** "Qualidade" → Auto (detecta conteúdo ou usa política balanceada), ou Manual (720p30/1080p30/1080p60). Espectadores escolhem qualidade/camada (via simulcast).

**Presets propostos:**

| Preset | Resolução | FPS | Bitrate vídeo (máx upload) | Notas |
|---|---|---|---|---|
| 720p30 | 1280x720 | 30 | 1.5 - 2.0 Mbps | Leve, protege upload |
| 1080p30 | 1920x1080 | 30 | 2.5 - 3.0 Mbps | Balanceado |
| 1080p60 | 1920x1080 | 60 | 3.5 - 4.0 Mbps | Jogos/motion, mais pesado |

**Regra de ouro (proteção de áudio):** Limitar bitrate total de vídeo **sempre** abaixo do headroom do upload, deixando **>= 150-250 kbps** garantidos para tracks de áudio (voz + tela áudio) **antes** de qualquer restrição de vídeo. Em caso de BWE severo, reduzir vídeo até mínimo viável (ou camadas base) **antes** de tocar no áudio. Áudio não deve ter sua configuração de bitrate alvo reduzida por contenção com vídeo.

### 3.5 Simulcast/SVC

**Recomendação: Simulcast (3 camadas)** para screen share.

| Camada | Resolução (ex.) | FPS | Bitrate alvo | Uso |
|---|---|---|---|---|
| High (HQ) | 1080p | 30/60 | ~2.5-3.5 Mbps | Rede boa (>= 10 Mbps down) |
| Mid | 720p | 30 | ~1.0-1.5 Mbps | Rede média |
| Low (Base) | 480p/540p | 15-30 | ~400-800 kbps | Rede ruim/congestão |

**Por quê Simulcast vs SVC?**
- Simulcast: envia streams independentes (mais fácil p/ SFU distribuir por subscriber, menos overhead de decodificação complexo em alguns casos). LiveKit tem ótimo suporte.
- SVC (Scalable Video Coding): codifica em camadas numa única stream (eficiente em upload). Suporte varia por codec/implementação (VP8/VP9/H.264 SVC limitado). Para screen share em tempo real com ampla variedade de clientes, **Simulcast com 3 camadas é mais pragmático e previsível** com LiveKit.

**Cada espectador recebe a camada adequada** à sua própria rede/BWE, **sem afetar outros** (requisito 2.2) - isso é ponto forte do SFU + simulcast.

### 3.6 Aceleração por Hardware

Suportar por plataforma:
- **Windows:** NVENC (NVIDIA), AMF (AMD), Intel QuickSync (QSV/oneVPL)
- **macOS:** VideoToolbox (Apple Silicon/Intel)
- **Linux:** VA-API/NVENC (depende drivers)

**Política:** Tentar HW accel primeiro (libera CPU p/ áudio, jitter, socket). Fallback automático p/ software (x264/VP8) se HW não disponível ou falhar. Monitorar uso de CPU/GPU e se aceleração causa latência/frames drop.

## 4. Stack Tecnológico (com justificativas)

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Cliente Desktop | **Electron + TypeScript + React** | Requisito explícito. Necessário p/ captura de áudio do sistema (desktopCapturer + APIs nativas). TS + React padrão. |
| Estado/UI | Zustand + Tailwind/shadcn (sugerido) | Leve, simples p/ MVP. Não crítico. |
| Mídia/WebRTC | **LiveKit SDK (client) + LiveKit Server self-hosted** | SFU conforme requisito. SDK lida com simulcast, tracks, prioridades, BWE. Justificativa seção 3.1. |
| Backend API | **Node.js + TypeScript + Fastify** | Rápido, leve, ótimo p/ APIs REST + WS. Ou Express; Fastify melhor p/ performance. |
| WebSocket/Chat | **Socket.IO** (ou WS nativo) | Chat básico + eventos de presença/canais. Fácil. |
| Auth | **JWT + bcrypt**. OAuth (Google/GitHub) opcional via Passport | Simples p/ MVP (e-mail/senha). OAuth fácil adicionar depois. |
| DB | **PostgreSQL + Drizzle ORM** | Relacional claro (servers/channels/members). Drizzle leve/TS-first vs Prisma. Ambos OK; Drizzle menos pesado. |
| Cache/Scale | **Redis** (opcional) | LiveKit pode usar p/ multi-node. p/ MVP single-node não obrigatório. |
| Tokens SFU | **LiveKit JWT tokens** | Padrão LiveKit (roomJoin, permissions por role). Seguro. |

**Mudanças de stack?** Nenhuma proposta vs. solicitado. Justificamos escolha LiveKit vs mediasoup (conforme pedido). Demais seguem especificação.

## 5. Captura de Áudio do Sistema (Por Plataforma)

Este é o ponto mais complexo e com mais limitações. Explicado com clareza.

### 5.1 Windows

**Opções:**

1. **`getDisplayMedia()` com `audio: true` (Screen Capture API via desktopCapturer)**  
   - Em Electron (Chromium), compartilhar tela/monitor com "Share audio" captura **Desktop Audio (loopback WASAPI)** do display selecionado.
   - **Prós:** Nativo, sem drivers extras.
   - **Contras:** Captura TODO o áudio do display (inclui apps tocando). **Inclui o próprio áudio do app Electron** se a janela/app estiver nesse display e tocando som → causa eco/feedback potencial.

2. **Captura por janela (Window Share) + áudio**  
   - Ao compartilhar janela específica (não tela cheia), evita incluir áudio de outras janelas. Mas ainda pode incluir áudio da própria janela? Depende. Melhor prática p/ evitar eco: **não compartilhar a janela do próprio Cher2C** quando incluir áudio do sistema.

3. **Loopback por aplicativo (per-app)**  
   - WASAPI permite loopback de um device de render, não granular por app facilmente via WebRTC/browser APIs. APIs nativas (Windows Audio APIs) permitem, mas exigiria módulo nativo (C++/Node-API) → aumenta complexidade.

**Limitações Windows:**
- **Eco do próprio app:** Se o Cher2C está reproduzindo áudio de participantes (voz/áudio tela) pelo mesmo device de saída que está sendo capturado no loopback, esse áudio **será incluído** na captura → feedback em espiral. 
- **Solução prática (recomendada):** 
  1. Ao iniciar Screen Share **com áudio**, alertar usuário: "Para evitar eco, prefira compartilhar uma janela específica (não a janela do Cher2C) ao incluir áudio do sistema".
  2. Se compartilhar tela cheia incluindo janela do app, o áudio próprio pode vazar. Não é 100% evitável com APIs web padrão.
  3. Alternativa avançada: usar dispositivo virtual (VB-Audio Virtual Cable, SteelSeries, etc.) - mas requer instalação externa (ruim p/ UX). **Fora do escopo MVP**.
- **Audio exclusivity:** Alguns apps em exclusivity mode (ASIO, jogos fullscreen com WASAPI exclusive) podem não aparecer no loopback.

**Recomendação Windows (MVP):** Usar `desktopCapturer.getSources()` + `getDisplayMedia` com áudio. Implementar aviso/mitigação UX + documentação. Aceitar limitação conhecida, com workaround claro.

### 5.2 macOS

**Duas eras:**

1. **macOS 12.3+ (recomendado): ScreenCaptureKit**  
   - API nativa da Apple p/ captura de tela + áudio. Permite capturar áudio de displays/aplicativos específicos com melhor isolamento.
   - Electron 25+ tem suporte via desktopCapturer (Chromium usa ScreenCaptureKit em macOS recente).
   - **Prós:** Isolamento melhor, menos vazamento de áudio do próprio processo.
   - **Contras:** Requer permissões (Screen Recording + Accessibility). Em alguns casos, áudio por app limitado.

2. **macOS < 12.3:** Sem ScreenCaptureKit completo. Chromium recorre a métodos antigos.  
   - **Limitação:** Captura de áudio do sistema pode ser mais restritiva. Em muitos casos, precisa de **driver de áudio virtual** (BlackHole, Soundflower) p/ capturar áudio de saída de forma confiável. 
   - **Problema UX:** instalação externa não ideal p/ MVP.

**Limitações macOS:**
- Permissões: `Screen Recording` + `Microphone` (mesmo p/ system audio). Usuário deve conceder.
- Apps com proteções (DRM, alguns apps de segurança) podem bloquear captura de áudio.
- Em versões antigas, **limitação prática**: melhor exigir macOS 12.3+ p/ "Share com áudio do sistema", ou documentar necessidade de virtual audio device.

**Recomendação:** Priorizar ScreenCaptureKit (macOS moderno). Para MVP, documentar claramente: "Áudio do sistema no macOS requer macOS 12.3+ (ScreenCaptureKit). Em versões anteriores, a captura de áudio do sistema pode não ser suportada de forma nativa pelo app."

### 5.3 Linux

**Opções modernas: PipeWire (recomendado)**

1. **PipeWire + PulseAudio compat:** Chromium/desktopCapturer em distros modernas (Fedora 34+, Ubuntu 22.04+, Arch) usa PipeWire p/ captura de tela+áudio. `getDisplayMedia({audio:true})` funciona via PipeWire portal (xdg-desktop-portal).
2. **PulseAudio legado:** Funciona com limitações.

**Como evitar eco próprio app:**
- PipeWire permite targeting de nodes (streams). O xdg-desktop-portal + PipeWire pode isolar melhor que WASAPI. Ainda assim, se o app está tocando no mesmo sink sendo monitorado, pode ocorrer vazamento. 
- Solução: evitar compartilhar a saída monitorada que inclui o próprio app. Em prática, com PipeWire portals, a captura é mais granular por fonte (monitor de device vs app).

**Limitações Linux:**
- Depende de ambiente desktop (Wayland vs X11). Wayland + PipeWire portals é o caminho moderno; X11 + Pulse/PipeWire varia.
- Algumas DEs/WMs menos maduros com portals podem ter comportamento inconsistente.
- Sem solução única 100% garantida cross-distro sem configurações externas.

**Recomendação:** Focar em **PipeWire + Wayland/XDG portals** (distros atuais). Documentar limitação: comportamento pode variar por distro/DE.

### 5.4 Resumo de Limitações (transparente)

| Plataforma | Evitar eco do próprio app 100% | Nativo sem drivers extras | Observação |
|---|---|---|---|
| Windows | **Parcial** | Sim | Melhor: compartilhar janela específica (não tela cheia com app). Loopback global inclui próprio app se tocando. |
| macOS 12.3+ | **Bom** (ScreenCaptureKit) | Sim | Isolamento melhor que Windows. Depende permissões. |
| macOS antigo | Ruim/variável | Não (ideal virtual device) | Limitação SO. Recomendar atualizar. |
| Linux (PipeWire) | **Variável** | Sim (portals) | Depende Wayland/X11 + DE. Geralmente razoável. |

**Conclusão captura:** Implementar abordagem nativa via `getDisplayMedia`/desktopCapturer (sem dependências binárias externas no MVP). Explicitar limitações na UI (tooltip/aviso) quando usuário ativa "Incluir áudio do sistema", com recomendação de boas práticas (não compartilhar janela do próprio app em tela cheia com áudio).

## 6. Riscos, Mitigações e Alternativas

| Risco | Probabilidade | Impacto | Mitigação | Alternativa |
|---|---|---|---|---|
| **Eco/feedback infinito (app captura próprio áudio)** | Média | Alto | Aviso UX (não compartilhar janela do app c/ áudio), isolar por janela, não fazer local playback do track publicado. Testar exaustivamente. | Módulo nativo p/ captura granular (per-app) - aumenta escopo. |
| **Áudio da tela degradado por AEC/NS** | Baixa (se config correto) | Crítico | **Testar em música/jogos**. Garantir AEC/NS/AGC = OFF no track de tela. Code review obrigatório neste ponto. | N/A (config correta é mandatória) |
| **Vídeo compete com áudio no upload** | Média | Alto | Limite rígido de bitrate vídeo, reservar >=200kbps p/ áudio, política BWE que **nunca** reduz áudio antes de vídeo atingir mínimo. Métricas em tempo real. | Forçar vídeo a camadas mais baixas automaticamente sob stress. |
| **CPU alto → engasgos no áudio** | Média-Alta | Crítico | HW accel obrigatório com fallback, priorizar processamento de áudio (threads/tempo), medir jitter/underflow. Evitar re-encodes desnecessários. | Reduzir presets, limitar fps máx. |
| **Limitações SO (macOS antigo/Linux)** | Média | Médio | Documentar claramente, feature detection, desabilitar opção com explicação quando não suportado. | Virtual audio device (BlackHole) - UX ruim, fora MVP. |
| **LiveKit self-host complexo em prod?** | Baixa p/ MVP | Baixo | Começar single-node Docker. LiveKit é bem documentado. p/ MVP OK. | Migrar p/ mediasoup se escalar exigir. |
| **Latência vs qualidade** | Média | Alto | Jitter buffer adaptativo (não estático). PLC ativo. Opus low-latency. Balancear. | Ajustes finos por caso de uso. |
| **Simulcast aumenta upload** | Baixa | Baixo | Envia N camadas mas são necessárias p/ adaptar por viewer. Trade-off aceitável (SFU distribui). | Usar SVC se suporte melhor no futuro. |

## 7. Critérios de Aceite (Etapa 1)

- [x] Arquitetura geral documentada e coerente com escopo
- [x] Diagrama de componentes e fluxos claros (texto)
- [x] Decisão SFU justificada (LiveKit) com comparação vs mediasoup
- [x] Codecs/configs de áudio definidos (Opus, FEC/DTX, AEC/NS/AGC) conforme requisitos
- [x] Vídeo (degradation, simulcast, presets, BWE) detalhado com proteção ao áudio
- [x] Captura de áudio por plataforma explicada com **limitações explícitas**
- [x] Prevenção de eco/feedback documentada
- [x] Riscos + mitigations listados
- [x] Stack justificado, sem mudanças arbitrárias

## 8. Próximos Passos (Etapa 2)

Conforme plano: **Etapa 2: estrutura do repositório e backend (auth, canais, sinalização, tokens do SFU).** Incluirá:
- Setup monorepo (apps/server, apps/desktop, packages/shared)
- Schema DB (Prisma/Drizzle), migrations
- Auth (JWT/email+senha, OAuth opcional)
- Models: Users, Servers, Channels (Voice/Text), Members
- LiveKit token generation (access tokens com permissions)
- WebSocket (Socket.IO) p/ presença, join/leave voice, chat básico
- Health checks, .env.example, Docker compose (LiveKit + Postgres + Redis)

**Parada após Etapa 1** - conforme solicitado.