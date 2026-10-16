import { useAppStore } from '../../store'
import { ServerRail } from './ServerRail'
import { ChannelSidebar } from './ChannelSidebar'
import { MembersList } from './MembersList'
import { ChatArea } from '../chat/ChatArea'
import { CallStage } from '../call/CallStage'
import { EmptyState } from '../EmptyState'
import '../../styles/layout.css'

/**
 * Shell principal estilo Discord:
 *  [rail servidores] [sidebar canais+usuário] [área central: chat OU chamada] [membros]
 *
 * A área central mostra a chamada de voz quando há um canal de voz ativo,
 * senão o chat do canal de texto selecionado.
 */
export function AppShell() {
  const servers = useAppStore((s) => s.servers)
  const voiceChannelId = useAppStore((s) => s.voiceChannelId)
  const activeTextChannelId = useAppStore((s) => s.activeTextChannelId)

  const inVoice = !!voiceChannelId
  const hasText = !!activeTextChannelId

  return (
    <div className="app">
      <ServerRail />
      <ChannelSidebar />

      <main className="main">
        {inVoice ? <CallStage /> : hasText ? <ChatArea /> : <EmptyState />}
      </main>

      {servers.length > 0 && <MembersList />}
    </div>
  )
}
