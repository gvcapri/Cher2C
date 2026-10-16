import { useState } from 'react'
import { Mic, MicOff, Headphones, HeadphoneOff, Settings, Sun, Moon, Monitor } from 'lucide-react'
import { useAppStore, type ThemeMode } from '../../store'
import { Avatar, IconButton, Menu } from '../ui'
import '../../styles/layout.css'

export function UserPanel() {
  const user = useAppStore((s) => s.user)
  const muted = useAppStore((s) => s.muted)
  const deafened = useAppStore((s) => s.deafened)
  const toggleMute = useAppStore((s) => s.toggleMute)
  const toggleDeafen = useAppStore((s) => s.toggleDeafen)
  const logout = useAppStore((s) => s.logout)
  const setTheme = useAppStore((s) => s.setTheme)
  const setAudioSettingsOpen = useAppStore((s) => s.setAudioSettingsOpen)
  const inVoice = useAppStore((s) => !!s.voiceChannelId)

  const [settingsOpen, setSettingsOpen] = useState(false)

  if (!user) return null

  const themeItems: Array<{ label: string; icon: React.ReactNode; onClick: () => void }> = [
    { label: 'Tema escuro', icon: <Moon size={16} />, onClick: () => setTheme('dark' as ThemeMode) },
    { label: 'Tema claro', icon: <Sun size={16} />, onClick: () => setTheme('light' as ThemeMode) },
    { label: 'Seguir o sistema', icon: <Monitor size={16} />, onClick: () => setTheme('system' as ThemeMode) }
  ]

  return (
    <div className="userPanel">
      <Avatar name={user.username} size={32} status="online" />
      <div className="userInfo">
        <span className="userName">{user.username}</span>
        <span className="userTag">{inVoice ? 'Em chamada' : 'Online'}</span>
      </div>
      <div className="userActions">
        <IconButton
          tooltip={muted ? 'Desmutar (Ctrl+Shift+M)' : 'Mutar (Ctrl+Shift+M)'}
          active={muted}
          onClick={() => void toggleMute()}
          disabled={!inVoice}
        >
          {muted ? <MicOff size={18} /> : <Mic size={18} />}
        </IconButton>
        <IconButton
          tooltip={deafened ? 'Desensurdecer' : 'Ensurdecer'}
          active={deafened}
          onClick={() => void toggleDeafen()}
          disabled={!inVoice}
        >
          {deafened ? <HeadphoneOff size={18} /> : <Headphones size={18} />}
        </IconButton>
        <div style={{ position: 'relative' }}>
          <IconButton tooltip="Configurações" onClick={() => setSettingsOpen((o) => !o)}>
            <Settings size={18} />
          </IconButton>
          <Menu
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            anchor="top-end"
            items={[
              { label: 'Áudio', icon: <Mic size={16} />, onClick: () => setAudioSettingsOpen(true) },
              'divider',
              ...themeItems,
              'divider',
              { label: 'Sair', danger: true, onClick: logout }
            ]}
          />
        </div>
      </div>
    </div>
  )
}
