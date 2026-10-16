import { cx } from '../../lib/utils'
import styles from './Badge.module.css'

type Tone = 'default' | 'accent' | 'success' | 'danger' | 'warning' | 'info'

export function Badge({
  tone = 'default',
  children,
  className
}: {
  tone?: Tone
  children: React.ReactNode
  className?: string
}) {
  return <span className={cx(styles.badge, styles[tone], className)}>{children}</span>
}
