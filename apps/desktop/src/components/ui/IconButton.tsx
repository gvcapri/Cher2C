import { forwardRef } from 'react'
import { cx } from '../../lib/utils'
import styles from './IconButton.module.css'

type Variant = 'ghost' | 'primary' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg'

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  active?: boolean
  tooltip?: string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', size = 'md', active, tooltip, className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      aria-label={tooltip}
      title={tooltip}
      className={cx(styles.iconButton, styles[variant], styles[size], active && styles.active, className)}
      {...rest}
    >
      {children}
    </button>
  )
})
