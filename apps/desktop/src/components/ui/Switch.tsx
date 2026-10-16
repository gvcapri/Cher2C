import { cx } from '../../lib/utils'
import styles from './Switch.module.css'

export function Switch({
  checked,
  onChange,
  label,
  disabled
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  disabled?: boolean
}) {
  return (
    <label className={cx(styles.wrap, disabled && styles.disabled)}>
      {label && <span className={styles.label}>{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={cx(styles.track, checked && styles.on)}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.knob} />
      </button>
    </label>
  )
}
