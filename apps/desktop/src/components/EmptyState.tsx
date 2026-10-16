import { MessageSquareText, Plus, LogIn } from 'lucide-react'
import { useAppStore } from '../store'
import { Button } from './ui'

/**
 * Estado vazio quando não há canal de texto selecionado ou servidor.
 * Se o usuário não tem servidores, oferece criar/entrar (primeiro acesso).
 */
export function EmptyState() {
  const servers = useAppStore((s) => s.servers)
  const setServerModalOpen = useAppStore((s) => s.setServerModalOpen)

  const firstAccess = servers.length === 0

  return (
    <div
      style={{
        flex: 1,
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        padding: 'var(--space-5)'
      }}
    >
      <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: 380 }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 'var(--radius-xl)',
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto'
          }}
        >
          <MessageSquareText size={36} />
        </div>

        {firstAccess ? (
          <>
            <h2 style={{ fontSize: 'var(--text-xl)' }}>Bem-vindo ao Cher2C!</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-md)' }}>
              Você ainda não está em nenhum servidor. Crie um servidor para começar ou entre num
              existente usando o código de convite.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center' }}>
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setServerModalOpen(true)}>
                Criar servidor
              </Button>
              <Button icon={<LogIn size={16} />} onClick={() => setServerModalOpen(true)}>
                Entrar com código
              </Button>
            </div>
          </>
        ) : (
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-md)' }}>
            Selecione um canal de texto para conversar, ou entre em um canal de voz para começar a
            falar.
          </p>
        )}
      </div>
    </div>
  )
}
