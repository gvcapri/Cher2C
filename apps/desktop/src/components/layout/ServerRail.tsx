import { Plus } from 'lucide-react'
import { useAppStore } from '../../store'
import { cx, initials } from '../../lib/utils'
import { Tooltip } from '../ui'
import '../../styles/layout.css'

export function ServerRail() {
  const servers = useAppStore((s) => s.servers)
  const activeId = useAppStore((s) => s.activeServerId)
  const selectServer = useAppStore((s) => s.selectServer)
  const setServerModalOpen = useAppStore((s) => s.setServerModalOpen)

  return (
    <nav className="rail" aria-label="Servidores">
      {servers.map((srv) => (
        <Tooltip key={srv.id} label={srv.name} side="right">
          <button
            className={cx('railItem', srv.id === activeId && 'active')}
            onClick={() => void selectServer(srv.id)}
            aria-label={srv.name}
            aria-current={srv.id === activeId}
          >
            {initials(srv.name)}
          </button>
        </Tooltip>
      ))}

      <div className="railDivider" />

      <Tooltip label="Adicionar servidor" side="right">
        <button className="railAdd" onClick={() => setServerModalOpen(true)} aria-label="Adicionar servidor">
          <Plus size={22} />
        </button>
      </Tooltip>
    </nav>
  )
}
