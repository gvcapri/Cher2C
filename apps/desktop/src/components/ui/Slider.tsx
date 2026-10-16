import { cx } from '../../lib/utils'
import styles from './Slider.module.css'

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  suffix = '',
  className
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
  suffix?: string
  className?: string
}) {
  return (
    <div className={cx(styles.wrap, className)}>
      {label && (
        <div className={styles.head}>
          <span className={styles.label}>{label}</span>
          <span className={styles.value}>
            {value}
            {suffix}
          </span>
        </div>
      )}
      <input
        type="range"
        className={styles.range}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: `linear-gradient(to right, var(--accent) ${((value - min) / (max - min)) * 100}%, var(--bg-active) 0%)` }}
      />
    </div>
  )
}
