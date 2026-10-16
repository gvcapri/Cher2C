import { useEffect, useRef } from 'react'
import { cx } from '../../lib/utils'
import styles from './Menu.module.css'

export interface MenuItem {
  label: string
  icon?: React.ReactNode
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
}

export function Menu({
  open,
  onClose,
  items,
  anchor, // posicionamento relativo ao gatilho
  className
}: {
  open: boolean
  onClose: () => void
  items: (MenuItem | 'divider')[]
  anchor?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  const pos = anchor ?? 'bottom-start'

  return (
    <div ref={ref} className={cx(styles.menu, styles[pos], className)} role="menu">
      {items.map((item, i) =>
        item === 'divider' ? (
          <div key={i} className={styles.divider} />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={cx(styles.item, item.danger && styles.danger)}
            disabled={item.disabled}
            onClick={() => {
              item.onClick?.()
              onClose()
            }}
          >
            {item.icon && <span className={styles.icon}>{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        )
      )}
    </div>
  )
}
