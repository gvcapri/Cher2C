import { clsx, type ClassValue } from 'clsx'

/** Concatena classes condicionalmente (wrapper do clsx). */
export function cx(...inputs: ClassValue[]): string {
  return clsx(inputs)
}

/** Iniciais de um nome p/ avatar (até 2 letras). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Cor determinística por string (p/ avatar). */
export function colorFromString(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 62% 52%)`
}

/** Hora curta (HH:MM). */
export function formatTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** Rótulo relativo amigável ("agora há pouco", "ontem", data). */
export function relativeTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const diff = Date.now() - date.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora há pouco'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const days = Math.floor(h / 24)
  if (days === 1) return 'ontem'
  if (days < 7) return `há ${days} dias`
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/** Mesmo dia (p/ separador de datas no chat). */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Milissegundos formatados ("123 ms", "1,2 s"). */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return '—'
  if (ms >= 1000) return `${(ms / 1000).toFixed(1).replace('.', ',')} s`
  return `${Math.round(ms)} ms`
}

/** Percentual formatado ("0,5%") a partir de fração 0..1. */
export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return '—'
  return `${(fraction * 100).toFixed(1).replace('.', ',')}%`
}

/** Rótulo de seção de data no chat. */
export function dayLabel(d: Date): string {
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (isSameDay(d, today)) return 'Hoje'
  if (isSameDay(d, yesterday)) return 'Ontem'
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric'
  })
}
