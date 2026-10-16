import { useEffect } from 'react'
import { useAppStore } from '../store'

/**
 * Atalhos globais de teclado:
 *   Ctrl+Shift+M  — mutar / desmutar
 *   Ctrl+Shift+E  — ensurdecer / desensurdecer
 *   Ctrl+Shift+S  — abrir seletor de compartilhamento (ou parar se já ativo)
 *   Ctrl+Shift+D  — painel de métricas de depuração
 *   Ctrl+Shift+↑/↓ — trocar de canal de texto
 *
 * Ignorado enquanto o foco está em campos de texto (input/textarea/contenteditable).
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return

      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return

      const store = useAppStore.getState()
      const inVoice = !!store.voiceChannelId
      const key = e.key.toLowerCase()

      switch (key) {
        case 'm': {
          if (!inVoice) return
          e.preventDefault()
          void store.toggleMute()
          return
        }
        case 'e': {
          if (!inVoice) return
          e.preventDefault()
          void store.toggleDeafen()
          return
        }
        case 's': {
          if (!inVoice) return
          e.preventDefault()
          if (store.sharing) void store.stopShare()
          else store.setShareModalOpen(true)
          return
        }
        case 'd': {
          e.preventDefault()
          store.toggleShowMetrics()
          return
        }
        case 'arrowup':
        case 'arrowdown': {
          const textChannels = store.channels.filter((c) => c.type === 'TEXT')
          if (textChannels.length === 0) return
          e.preventDefault()
          const currentIdx = textChannels.findIndex((c) => c.id === store.activeTextChannelId)
          const delta = key === 'arrowdown' ? 1 : -1
          const nextIdx = ((currentIdx === -1 ? 0 : currentIdx + delta) % textChannels.length + textChannels.length) % textChannels.length
          void store.selectTextChannel(textChannels[nextIdx].id)
          return
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
