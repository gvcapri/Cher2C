import { useState } from 'react'
import { Monitor, AppWindow, Type, Gamepad2, Check } from 'lucide-react'
import { useAppStore } from '../../store'
import { Modal, Button, Switch, useToast } from '../ui'
import { QUALITY_PRESETS, QUALITY_PRESET_ORDER, type QualityPresetId, type ContentHint } from '../../media/videoConfig'
import { cx } from '../../lib/utils'
import styles from './call.module.css'

/**
 * Modal de seleção de compartilhamento:
 *  - cards de preset (720p30/1080p30/1080p60) com descrição
 *  - tipo de conteúdo (Texto/Código vs Jogo/Movimento) como cards
 *  - toggle de áudio do sistema
 *  - (a escolha de tela/janela é feita pelo handler nativo do Electron;
 *     com system picker no futuro vira lista de miniaturas)
 */
export function ShareModal() {
  const open = useAppStore((s) => s.shareModalOpen)
  const setOpen = useAppStore((s) => s.setShareModalOpen)
  const preset = useAppStore((s) => s.sharePreset)
  const contentHint = useAppStore((s) => s.shareContentHint)
  const withAudio = useAppStore((s) => s.shareWithSystemAudio)
  const setPreset = useAppStore((s) => s.setSharePreset)
  const setContentHint = useAppStore((s) => s.setShareContentHint)
  const setWithAudio = useAppStore((s) => s.setShareWithSystemAudio)
  const startShare = useAppStore((s) => s.startShare)
  const toast = useToast()

  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await startShare()
      setOpen(false)
      toast.show('Compartilhamento iniciado', 'success')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Falha ao compartilhar', 'error')
    } finally {
      setBusy(false)
    }
  }

  const hintOptions: Array<{ id: ContentHint; title: string; desc: string; icon: React.ReactNode }> = [
    { id: 'detail', title: 'Texto / Código', desc: 'Prioriza nitidez (mantém resolução)', icon: <Type size={18} /> },
    { id: 'motion', title: 'Jogo / Movimento', desc: 'Prioriza fluidez (mantém FPS)', icon: <Gamepad2 size={18} /> }
  ]

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Compartilhar tela"
      width={520}
      footer={
        <>
          <Button onClick={() => setOpen(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void confirm()}>
            Compartilhar
          </Button>
        </>
      }
    >
      <div>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 8 }}>
          A captura da tela começa automaticamente na próxima etapa.
        </p>
        <div className={styles.optionGrid}>
          <div className={cx(styles.optionCard, styles.optionCardSelected)}>
            <Monitor size={18} className={styles.optionIcon} />
            <span className={styles.optionTitle}>Tela ou janela</span>
            <span className={styles.optionDesc}>Captura automática</span>
          </div>
          <div className={cx(styles.optionCard, styles.optionCardSelected)}>
            <AppWindow size={18} className={styles.optionIcon} />
            <span className={styles.optionTitle}>Áudio do sistema</span>
            <span className={styles.optionDesc}>{withAudio ? 'Incluído (track separada)' : 'Desativado'}</span>
          </div>
        </div>
      </div>

      <div>
        <div className={styles.settingRow} style={{ marginBottom: 8 }}>
          <div className={styles.settingLabel}>
            <span className={styles.settingTitle}>Qualidade</span>
            <span className={styles.settingHint}>Limite de bitrate que não compete com o áudio</span>
          </div>
        </div>
        <div className={styles.optionGrid}>
          {QUALITY_PRESET_ORDER.map((id) => {
            const p = QUALITY_PRESETS[id]
            const selected = preset === id
            return (
              <button
                key={id}
                className={cx(styles.optionCard, selected && styles.optionCardSelected)}
                onClick={() => setPreset(id as QualityPresetId)}
                aria-pressed={selected}
              >
                <span className={styles.optionTitle}>
                  {selected && <Check size={13} style={{ verticalAlign: -2, marginRight: 4, color: 'var(--accent)' }} />}
                  {p.label}
                </span>
                <span className={styles.optionDesc}>
                  {p.width}×{p.height} · até {Math.round(p.videoMaxBitrateBps / 1000)} kbps
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <span className={styles.settingTitle} style={{ display: 'block', marginBottom: 8 }}>
          Tipo de conteúdo
        </span>
        <div className={styles.optionGrid} style={{ gridTemplateColumns: '1fr 1fr' }}>
          {hintOptions.map((h) => {
            const selected = contentHint === h.id
            return (
              <button
                key={h.id}
                className={cx(styles.optionCard, selected && styles.optionCardSelected)}
                onClick={() => setContentHint(h.id)}
                aria-pressed={selected}
              >
                <span className={styles.optionIcon}>{h.icon}</span>
                <span className={styles.optionTitle}>{h.title}</span>
                <span className={styles.optionDesc}>{h.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className={styles.settingRow}>
        <div className={styles.settingLabel}>
          <span className={styles.settingTitle}>Compartilhar áudio do sistema</span>
          <span className={styles.settingHint}>Música e jogos com AEC/NS/AGC desligados</span>
        </div>
        <Switch checked={withAudio} onChange={setWithAudio} />
      </div>
    </Modal>
  )
}
