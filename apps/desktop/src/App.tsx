import { useEffect, useState } from 'react'
import { Wifi, WifiOff } from 'lucide-react'
import { useAppStore } from './store'
import { AuthScreen } from './components/auth/AuthScreen'
import { AppShell } from './components/layout/AppShell'
import { ServerModal } from './components/layout/ServerModal'
import { DebugMetricsPanel } from './components/DebugMetricsPanel'
import { ToastProvider } from './components/ui'
import { useKeyboardShortcuts } from './lib/useKeyboardShortcuts'
import { checkHealth } from './api'
import './styles/global.css'

/**
 * Raiz do app:
 *  - sem token: tela de autenticação (AuthScreen) com indicador de saúde do backend
 *  - logado: shell estilo Discord (rail + sidebar + chat/chamada + membros)
 *  - globais: toasts, modal de servidor, drawer de métricas e atalhos de teclado
 */
export default function App() {
  const token = useAppStore((s) => s.token)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)

  useKeyboardShortcuts()

  // Aplica o tema (resolve "system") e reage a trocas do sistema
  useEffect(() => {
    setTheme(theme)
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => setTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme, setTheme])

  return (
    <ToastProvider>
      {token ? (
        <AppShell />
      ) : (
        <>
          <AuthScreen />
          <HealthPill />
        </>
      )}
      <ServerModal />
      <DebugMetricsPanel />
    </ToastProvider>
  )
}

/** Indicador discreto de saúde do backend (canto inferior direito do login). */
function HealthPill() {
  const [health, setHealth] = useState('...')

  useEffect(() => {
    checkHealth()
      .then((h) => setHealth(h.status))
      .catch(() => setHealth('offline'))
  }, [])

  const online = health === 'ok' || health === 'healthy'

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 12,
        right: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: 'var(--text-faint)'
      }}
      role="status"
    >
      {online ? <Wifi size={13} /> : <WifiOff size={13} />}
      backend: {health}
    </div>
  )
}
