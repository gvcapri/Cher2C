import { useEffect, useRef, useState } from 'react'
import { Mic } from 'lucide-react'
import { useAppStore } from '../../store'
import { Modal, Slider, Switch, Button } from '../ui'
import styles from './call.module.css'

/**
 * Configurações de áudio (UI de preferências locais):
 *  - dispositivo de entrada/saída (enumerateDevices)
 *  - volume de saída
 *  - teste de microfone com medidor de nível em tempo real (getUserMedia)
 *  - toggles de supressão de ruído e eco (eco/noiseSuppression na captura)
 *
 * Nota: os toggles afetam a captura do teste; a chamada em si usa as config
 * de áudio do projeto (media/audioConfig.ts). Mudanças aqui são preferências
 * locais exibidas na UI.
 */
export function AudioSettings() {
  const open = useAppStore((s) => s.audioSettingsOpen)
  const setOpen = useAppStore((s) => s.setAudioSettingsOpen)

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [inputId, setInputId] = useState('')
  const [outputId, setOutputId] = useState('')
  const [volume, setVolume] = useState(100)
  const [noiseSupp, setNoiseSupp] = useState(true)
  const [echoCancel, setEchoCancel] = useState(true)

  const [testing, setTesting] = useState(false)
  const [level, setLevel] = useState(0)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const audioCtxRef = useRef<AudioContext | null>(null)

  // Lista dispositivos ao abrir
  useEffect(() => {
    if (!open) return
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((list) => setDevices(list.filter((d) => d.kind === 'audioinput' || d.kind === 'audiooutput')))
      .catch(() => setDevices([]))
  }, [open])

  // Para o teste ao fechar
  useEffect(() => {
    if (!open) stopTest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function stopTest() {
    cancelAnimationFrame(rafRef.current)
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setTesting(false)
    setLevel(0)
  }

  async function startTest() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: inputId ? { exact: inputId } : undefined,
          noiseSuppression: noiseSupp,
          echoCancellation: echoCancel
        }
      })
      streamRef.current = stream
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      src.connect(analyser)
      const buf = new Uint8Array(analyser.frequencyBinCount)

      const loop = () => {
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / buf.length)
        setLevel(Math.min(1, rms * 4))
        rafRef.current = requestAnimationFrame(loop)
      }
      loop()
      setTesting(true)
    } catch {
      // permissão negada ou sem dispositivo — estado permanece "não testando"
      setTesting(false)
    }
  }

  const inputs = devices.filter((d) => d.kind === 'audioinput')
  const outputs = devices.filter((d) => d.kind === 'audiooutput')

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-primary)',
    outline: 'none'
  }

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Configurações de áudio"
      width={460}
      footer={<Button variant="primary" onClick={() => setOpen(false)}>Concluído</Button>}
    >
      <div>
        <span className={styles.settingTitle} style={{ display: 'block', marginBottom: 6 }}>
          Entrada (microfone)
        </span>
        <select style={selectStyle} value={inputId} onChange={(e) => setInputId(e.target.value)} aria-label="Dispositivo de entrada">
          <option value="">Padrão do sistema</option>
          {inputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microfone (${d.deviceId.slice(0, 6)}…)`}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className={styles.settingTitle} style={{ display: 'block', marginBottom: 6 }}>
          Saída (alto-falantes)
        </span>
        <select style={selectStyle} value={outputId} onChange={(e) => setOutputId(e.target.value)} aria-label="Dispositivo de saída">
          <option value="">Padrão do sistema</option>
          {outputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Saída (${d.deviceId.slice(0, 6)}…)`}
            </option>
          ))}
        </select>
      </div>

      <Slider label="Volume de saída" value={volume} onChange={setVolume} suffix="%" />

      <div style={{ display: 'grid', gap: 10 }}>
        <Switch checked={noiseSupp} onChange={setNoiseSupp} label="Supressão de ruído (voz)" />
        <Switch checked={echoCancel} onChange={setEchoCancel} label="Cancelamento de eco (voz)" />
      </div>

      <div>
        <div className={styles.settingRow} style={{ marginBottom: 8 }}>
          <span className={styles.settingTitle}>Testar microfone</span>
          {testing ? (
            <Button size="sm" variant="danger" onClick={stopTest}>
              Parar teste
            </Button>
          ) : (
            <Button size="sm" icon={<Mic size={14} />} onClick={() => void startTest()}>
              Iniciar teste
            </Button>
          )}
        </div>
        <div className={styles.meter} role="meter" aria-label="Nível do microfone" aria-valuenow={Math.round(level * 100)}>
          <div className={styles.meterFill} style={{ width: `${level * 100}%` }} />
        </div>
        <p className={styles.settingHint} style={{ marginTop: 6 }}>
          {testing ? 'Fale normalmente — o medidor deve se mover.' : 'Inicie o teste para ver o nível em tempo real.'}
        </p>
      </div>
    </Modal>
  )
}
