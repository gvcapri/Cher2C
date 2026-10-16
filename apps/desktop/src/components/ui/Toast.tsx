import { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cx } from '../../lib/utils'
import styles from './Toast.module.css'

type ToastTone = 'success' | 'error' | 'info'
interface Toast {
  id: number
  tone: ToastTone
  message: string
}

interface ToastCtx {
  show: (message: string, tone?: ToastTone) => void
}

const Ctx = createContext<ToastCtx>({ show: () => {} })

export function useToast() {
  return useContext(Ctx)
}

let nextId = 1

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId++
      setToasts((t) => [...t, { id, tone, message }])
      setTimeout(() => remove(id), 4000)
    },
    [remove]
  )

  const icons = {
    success: <CheckCircle2 size={18} />,
    error: <AlertCircle size={18} />,
    info: <Info size={18} />
  }

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className={styles.stack} aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx(styles.toast, styles[t.tone])}>
            <span className={styles.icon}>{icons[t.tone]}</span>
            <span className={styles.message}>{t.message}</span>
            <button className={styles.close} onClick={() => remove(t.id)} aria-label="Fechar">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
