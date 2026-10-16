import { Loader2 } from 'lucide-react'
import { cx } from '../../lib/utils'
import styles from './Spinner.module.css'

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cx(styles.spinner, className)} aria-label="Carregando" />
}
