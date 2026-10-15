import { useAppStore } from '../store'
import { QUALITY_PRESETS, QUALITY_PRESET_ORDER, type QualityPresetId, type ContentHint } from '../media/videoConfig'

export function ScreenSharePanel() {
  const sharing = useAppStore((s) => s.sharing)
  const preset = useAppStore((s) => s.sharePreset)
  const contentHint = useAppStore((s) => s.shareContentHint)
  const withAudio = useAppStore((s) => s.shareWithSystemAudio)
  const startShare = useAppStore((s) => s.startShare)
  const stopShare = useAppStore((s) => s.stopShare)
  const setPreset = useAppStore((s) => s.setSharePreset)
  const setContentHint = useAppStore((s) => s.setShareContentHint)
  const setWithAudio = useAppStore((s) => s.setShareWithSystemAudio)

  async function toggle() {
    try {
      if (sharing) await stopShare()
      else await startShare()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div style={{ borderTop: '1px solid #333', padding: 12 }}>
      <h4 style={{ margin: '0 0 8px' }}>Compartilhar tela</h4>

      <button
        onClick={() => void toggle()}
        style={{
          background: sharing ? '#f23f43' : '#5865f2',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '6px 12px',
          cursor: 'pointer'
        }}
      >
        {sharing ? 'Parar compartilhamento' : 'Compartilhar tela/janela'}
      </button>

      <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
        <label style={{ fontSize: 12 }}>
          Qualidade:{' '}
          <select
            value={preset}
            disabled={sharing}
            onChange={(e) => setPreset(e.target.value as QualityPresetId)}
          >
            {QUALITY_PRESET_ORDER.map((id) => (
              <option key={id} value={id}>
                {QUALITY_PRESETS[id].label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 12 }}>
          Conteúdo:{' '}
          <select
            value={contentHint}
            disabled={sharing}
            onChange={(e) => setContentHint(e.target.value as ContentHint)}
          >
            <option value="detail">Texto/código (nitidez)</option>
            <option value="motion">Jogo/vídeo (fluidez)</option>
          </select>
        </label>

        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={withAudio}
            disabled={sharing}
            onChange={(e) => setWithAudio(e.target.checked)}
          />
          Incluir áudio do sistema
        </label>
      </div>

      <p style={{ fontSize: 11, color: '#80848e', marginTop: 8 }}>
        Áudio da tela é um track separado (AEC/NS/AGC off, DTX off, ~128 kbps estéreo). O áudio
        nunca é degradado pelo vídeo.
      </p>
    </div>
  )
}
