import { useState } from 'react'
import {
  Hash,
  Volume2,
  ChevronDown,
  ChevronRight,
  Settings,
  Copy,
  UserPlus,
  Plus
} from 'lucide-react'
import { useAppStore } from '../../store'
import { cx } from '../../lib/utils'
import { Menu, useToast, Avatar } from '../ui'
import { UserPanel } from './UserPanel'
import '../../styles/layout.css'

export function ChannelSidebar() {
  const channels = useAppStore((s) => s.channels)
  const servers = useAppStore((s) => s.servers)
  const activeServerId = useAppStore((s) => s.activeServerId)
  const activeTextChannelId = useAppStore((s) => s.activeTextChannelId)
  const selectTextChannel = useAppStore((s) => s.selectTextChannel)
  const voiceChannelId = useAppStore((s) => s.voiceChannelId)
  const joinVoice = useAppStore((s) => s.joinVoice)
  const participants = useAppStore((s) => s.participants)
  const speaking = useAppStore((s) => s.speaking)
  const createChannel = useAppStore((s) => s.createChannel)
  const setServerModalOpen = useAppStore((s) => s.setServerModalOpen)
  const toast = useToast()

  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [creating, setCreating] = useState<null | 'TEXT' | 'VOICE'>(null)
  const [newName, setNewName] = useState('')

  const server = servers.find((s) => s.id === activeServerId)
  const voiceChannels = channels.filter((c) => c.type === 'VOICE')
  const textChannels = channels.filter((c) => c.type === 'TEXT')
  const speakingSet = new Set(speaking)

  const toggle = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }))

  async function copyInvite() {
    if (!server) return
    await navigator.clipboard.writeText(server.id).catch(() => {})
    toast.show('Código de convite copiado!', 'success')
  }

  async function handleCreate() {
    if (!newName.trim() || !creating) return
    try {
      await createChannel(newName.trim(), creating)
      toast.show(`Canal "${newName.trim()}" criado`, 'success')
      setNewName('')
      setCreating(null)
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Erro ao criar canal', 'error')
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebarHeader" style={{ position: 'relative' }}>
        <span className="truncate">{server?.name ?? 'Selecione um servidor'}</span>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Configurações do servidor"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Settings size={16} />
        </button>
        <Menu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          anchor="bottom-end"
          items={[
            { label: 'Copiar código de convite', icon: <Copy size={16} />, onClick: () => void copyInvite() },
            { label: 'Criar canal de texto', icon: <Plus size={16} />, onClick: () => setCreating('TEXT') },
            { label: 'Criar canal de voz', icon: <Volume2 size={16} />, onClick: () => setCreating('VOICE') },
            'divider',
            {
              label: 'Entrar em outro servidor',
              icon: <UserPlus size={16} />,
              onClick: () => setServerModalOpen(true)
            }
          ]}
        />
      </div>

      <div className="sidebarBody">
        {/* Formulário de criação de canal */}
        {creating && (
          <div style={{ padding: 'var(--space-2)' }}>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
              placeholder={`Nome do canal ${creating === 'TEXT' ? 'de texto' : 'de voz'}`}
              style={{
                width: '100%',
                padding: '6px 8px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                marginBottom: 6
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => void handleCreate()}
                style={{ color: 'var(--success)', fontSize: 12, fontWeight: 600 }}
              >
                Criar
              </button>
              <button onClick={() => setCreating(null)} style={{ color: 'var(--text-faint)', fontSize: 12 }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Canais de texto */}
        <div>
          <button className="category" onClick={() => toggle('text')}>
            {collapsed.text ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            Texto
          </button>
          {!collapsed.text &&
            textChannels.map((ch) => (
              <button
                key={ch.id}
                className={cx('channelItem', ch.id === activeTextChannelId && 'active')}
                onClick={() => void selectTextChannel(ch.id)}
              >
                <Hash size={18} className="channelIcon" />
                <span className="channelName">{ch.name}</span>
              </button>
            ))}
        </div>

        {/* Canais de voz */}
        <div>
          <button className="category" onClick={() => toggle('voice')}>
            {collapsed.voice ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            Voz
          </button>
          {!collapsed.voice &&
            voiceChannels.map((ch) => {
              const inThis = voiceChannelId === ch.id
              return (
                <div key={ch.id}>
                  <button
                    className={cx('channelItem', inThis && 'active')}
                    onClick={() => void joinVoice(ch.id)}
                  >
                    <Volume2 size={18} className="channelIcon" />
                    <span className="channelName">{ch.name}</span>
                  </button>
                  {/* Participantes conectados a ESTE canal */}
                  {inThis && participants.length > 0 && (
                    <div style={{ padding: '2px 0 6px 26px' }}>
                      {participants.map((p) => (
                        <div
                          key={p.identity}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '3px 0',
                            fontSize: 12,
                            color: 'var(--text-secondary)'
                          }}
                        >
                          <Avatar
                            name={p.name}
                            size={20}
                            speaking={speakingSet.has(p.identity) || p.isSpeaking}
                          />
                          <span className="truncate">{p.name}</span>
                          {p.muted && <span style={{ color: 'var(--danger)' }}>🔇</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      </div>

      <UserPanel />
    </aside>
  )
}
