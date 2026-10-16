import { Mic, MicOff, Headphones, HeadphoneOff, MonitorUp, Settings, PhoneOff } from 'lucide-react'
import { useAppStore } from '../../store'
import { cx } from '../../lib/utils'
import { Tooltip } from '../ui'
import styles from './call.module.css'

/**
 * Barra de controles flutuante da chamada:
 * microfone, fone, compartilhar tela, configurações de áudio e desligar.
 * Estados claros (ativo, mutado, desativado) + atalhos nos tooltips.
 */
export function ControlBar() {
  const muted = useAppStore((s) => s.muted)
  const deafened = useAppStore((s) => s.deafened)
  const sharing = useAppStore((s) => s.sharing)
  const toggleMute = useAppStore((s) => s.toggleMute)
  const toggleDeafen = useAppStore((s) => s.toggleDeafen)
  const setShareModalOpen = useAppStore((s) => s.setShareModalOpen)
  const setAudioSettingsOpen = useAppStore((s) => s.setAudioSettingsOpen)
  const stopShare = useAppStore((s) => s.stopShare)
  const leaveVoice = useAppStore((s) => s.leaveVoice)

  async function onShare() {
    try {
      if (sharing) await stopShare()
      else setShareModalOpen(true)
    } catch {
      // erros tratados no ShareModal via toast
    }
  }

  return (
    <div className={styles.controls} role="toolbar" aria-label="Controles da chamada">
      <Tooltip label={muted ? 'Desmutar (Ctrl+Shift+M)' : 'Mutar (Ctrl+Shift+M)'}>
        <button
          className={cx(styles.control, muted && styles.controlOff)}
          onClick={() => void toggleMute()}
          aria-pressed={muted}
          aria-label={muted ? 'Desmutar' : 'Mutar'}
        >
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
      </Tooltip>

      <Tooltip label={deafened ? 'Desensurdecer (Ctrl+Shift+E)' : 'Ensurdecer (Ctrl+Shift+E)'}>
        <button
          className={cx(styles.control, deafened && styles.controlOff)}
          onClick={() => void toggleDeafen()}
          aria-pressed={deafened}
          aria-label={deafened ? 'Desensurdecer' : 'Ensurdecer'}
        >
          {deafened ? <HeadphoneOff size={22} /> : <Headphones size={22} />}
        </button>
      </Tooltip>

      <div className={styles.controlDivider} />

      <Tooltip label={sharing ? 'Parar compartilhamento (Ctrl+Shift+S)' : 'Compartilhar tela (Ctrl+Shift+S)'}>
        <button
          className={cx(styles.control, sharing && styles.controlActive)}
          onClick={() => void onShare()}
          aria-pressed={sharing}
          aria-label="Compartilhar tela"
        >
          <MonitorUp size={22} />
        </button>
      </Tooltip>

      <Tooltip label="Configurações de áudio">
        <button
          className={styles.control}
          onClick={() => setAudioSettingsOpen(true)}
          aria-label="Configurações de áudio"
        >
          <Settings size={22} />
        </button>
      </Tooltip>

      <div className={styles.controlDivider} />

      <Tooltip label="Desligar (Ctrl+Shift+D)">
        <button
          className={cx(styles.control, styles.controlLeave)}
          onClick={() => void leaveVoice()}
          aria-label="Sair da chamada"
        >
          <PhoneOff size={20} />
          <span className={styles.controlLabel}>Sair</span>
        </button>
      </Tooltip>
    </div>
  )
}
