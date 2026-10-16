import { cx } from '../../lib/utils'
import styles from './Skeleton.module.css'

export function Skeleton({
  width,
  height = 16,
  radius = 6,
  className
}: {
  width?: number | string
  height?: number | string
  radius?: number
  className?: string
}) {
  return (
    <span
      className={cx(styles.skeleton, className)}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  )
}
