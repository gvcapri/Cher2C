import { useEffect, useMemo, useRef, useState } from 'react'
import { Hash, Paperclip, SendHorizonal } from 'lucide-react'
import { useAppStore, type ChatMessage } from '../../store'
import { Avatar, Skeleton } from '../ui'
import { cx, dayLabel, isSameDay, formatTime } from '../../lib/utils'
import styles from './ChatArea.module.css'

/**
 * Chat do canal de texto:
 *  - mensagens agrupadas por autor (avatar+só o nome na 1ª do grupo)
 *  - separadores de datas
 *  - Enter envia, Shift+Enter quebra linha
 *  - auto-scroll inteligente (não puxa se lendo histórico; mostra botão "Novas mensagens")
 */
export function ChatArea() {
  const channels = useAppStore((s) => s.channels)
  const activeId = useAppStore((s) => s.activeTextChannelId)
  const messages = useAppStore((s) => (activeId ? s.messages[activeId] : undefined))
  const loading = useAppStore((s) => s.messagesLoading)
  const sendMessage = useAppStore((s) => s.sendMessage)
  const members = useAppStore((s) => s.members)
  const user = useAppStore((s) => s.user)

  const [draft, setDraft] = useState('')
  const [atBottom, setAtBottom] = useState(true)

  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const channel = channels.find((c) => c.id === activeId)

  // username por userId (mensagens vindas do socket têm username vazio)
  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    members.forEach((m) => map.set(m.userId, m.username))
    if (user) map.set(user.id, user.username)
    return map
  }, [members, user])

  const resolved: ChatMessage[] = useMemo(
    () =>
      (messages ?? []).map((m) => ({
        ...m,
        username: m.username || nameById.get(m.userId) || 'Usuário'
      })),
    [messages, nameById]
  )

  // Auto-scroll: puxa apenas quando já estamos no fim;
  // caso contrário mantém a posição e o botão "Novas mensagens" aparece.
  useEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [resolved.length, atBottom])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    setAtBottom(distance < 60)
  }

  function jumpToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setAtBottom(true)
  }

  function submit() {
    if (!draft.trim() || !activeId) return
    sendMessage(activeId, draft)
    setDraft('')
    setAtBottom(true)
    // garante scroll após a próxima renderização
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
  }

  if (!channel) return null

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Hash size={20} className={styles.headerIcon} />
        <strong>{channel.name}</strong>
        <span className={styles.headerHint}>Conversas do canal</span>
      </header>

      <div className={styles.messages} ref={scrollRef} onScroll={onScroll}>
        {loading && (
          <div style={{ display: 'grid', gap: 12, padding: 'var(--space-4)' }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Skeleton width={40} height={40} radius={20} />
                <div style={{ display: 'grid', gap: 6 }}>
                  <Skeleton width={120} height={12} />
                  <Skeleton width={260} height={12} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && resolved.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>💬</div>
            <p>Nenhuma mensagem ainda em #{channel.name}.</p>
            <p style={{ color: 'var(--text-faint)' }}>Envie a primeira mensagem!</p>
          </div>
        )}

        {resolved.map((m, i) => {
          const prevM = i > 0 ? resolved[i - 1] : null
          const newDay = !prevM || !isSameDay(new Date(prevM.createdAt), new Date(m.createdAt))
          const grouped =
            !newDay && prevM !== null && prevM.userId === m.userId && !m.own
              ? isSameDay(new Date(prevM.createdAt), new Date(m.createdAt)) &&
                new Date(m.createdAt).getTime() - new Date(prevM.createdAt).getTime() < 7 * 60000
              : false
          const own = !!m.own

          return (
            <div key={m.id}>
              {newDay && (
                <div className={styles.dayDivider}>
                  <span>{dayLabel(new Date(m.createdAt))}</span>
                </div>
              )}
              <div className={cx(styles.row, grouped && styles.grouped, own && styles.own)}>
                <div className={styles.avatarCell}>
                  {!grouped && <Avatar name={m.username} size={40} />}
                </div>
                <div className={styles.body}>
                  {!grouped && (
                    <div className={styles.meta}>
                      <span className={styles.author}>{m.username}</span>
                      <time className={styles.time}>{formatTime(m.createdAt)}</time>
                    </div>
                  )}
                  <p className={styles.content}>{m.content}</p>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {!atBottom && resolved.length > 0 && (
        <button className={styles.jump} onClick={jumpToBottom}>
          ↓ Novas mensagens
        </button>
      )}

      <div className={styles.composer}>
        <button className={styles.attach} aria-label="Anexar (em breve)" disabled title="Em breve">
          <Paperclip size={18} />
        </button>
        <textarea
          className={styles.input}
          rows={1}
          placeholder={`Mensagem em #${channel.name}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          aria-label="Escrever mensagem"
        />
        <button
          className={styles.send}
          onClick={submit}
          disabled={!draft.trim()}
          aria-label="Enviar mensagem"
        >
          <SendHorizonal size={18} />
        </button>
      </div>
    </div>
  )
}
