import { cx } from '../../lib/utils'
import styles from './Tooltip.module.css'

export function Tooltip({
  label,
  side = 'top',
  children,
  className
}: {
  label: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={cx(styles.wrap, className)}>
      {children}
      <span className={cx(styles.tip, styles[side])} role="tooltip">
        {label}
      </span>
    </span>
  )
}
