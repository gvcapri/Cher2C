import { Users } from 'lucide-react'
import { useAppStore } from '../../store'
import { Avatar } from '../ui'
import '../../styles/layout.css'

/**
 * Lista de membros do servidor ativo (recolhível), agrupada por papel
 * (donos/admins primeiro) com presença online.
 */
export function MembersList() {
  const members = useAppStore((s) => s.members)
  const membersVisible = useAppStore((s) => s.membersVisible)

  if (!membersVisible) return null

  const privileged = members.filter((m) => m.role === 'OWNER' || m.role === 'ADMIN')
  const regular = members.filter((m) => m.role !== 'OWNER' && m.role !== 'ADMIN')

  const renderItem = (m: (typeof members)[number]) => (
    <div key={m.id} className="memberItem">
      <Avatar name={m.username} size={32} status="online" src={m.avatarUrl} />
      <span className="memberName">{m.username}</span>
      {m.role === 'OWNER' && (
        <span style={{ color: 'var(--warning)', fontSize: 12 }} title="Dono">
          👑
        </span>
      )}
    </div>
  )

  return (
    <aside className="members" aria-label="Membros">
      {privileged.length > 0 && (
        <>
          <div className="membersGroup">
            <Users size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
            Administração — {privileged.length}
          </div>
          {privileged.map(renderItem)}
        </>
      )}
      {regular.length > 0 && (
        <>
          <div className="membersGroup">Membros — {regular.length}</div>
          {regular.map(renderItem)}
        </>
      )}
    </aside>
  )
}
