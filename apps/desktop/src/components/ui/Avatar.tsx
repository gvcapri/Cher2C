import { cx, initials, colorFromString } from '../../lib/utils'
import styles from './Avatar.module.css'

export interface AvatarProps {
  name: string
  src?: string | null
  size?: number
  /** Presença: online / offline / ocupado */
  status?: 'online' | 'idle' | 'dnd' | 'offline'
  /** Mostra anel verde pulsante de fala */
  speaking?: boolean
  className?: string
}

export function Avatar({ name, src, size = 32, status, speaking, className }: AvatarProps) {
  const bg = colorFromString(name)
  return (
    <div
      className={cx(styles.wrap, speaking && styles.speaking, className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt={name} className={styles.img} draggable={false} />
      ) : (
        <span className={styles.initials} style={{ background: bg, fontSize: size * 0.4 }}>
          {initials(name)}
        </span>
      )}
      {status && (
        <span
          className={cx(styles.status, styles[`status_${status}`])}
          style={{ width: size * 0.32, height: size * 0.32 }}
          aria-label={status}
        />
      )}
    </div>
  )
}
