import { useState } from 'react'
import { Plus, LogIn } from 'lucide-react'
import { useAppStore } from '../../store'
import { Button, Input, Modal, useToast } from '../ui'
import { cx } from '../../lib/utils'
import styles from './ServerModal.module.css'

/**
 * Modal para criar um servidor ou entrar em um existente usando o código
 * de convite. Abas "Criar" / "Entrar com código".
 */
export function ServerModal() {
  const open = useAppStore((s) => s.serverModalOpen)
  const setOpen = useAppStore((s) => s.setServerModalOpen)
  const createServer = useAppStore((s) => s.createServer)
  const joinServer = useAppStore((s) => s.joinServer)
  const toast = useToast()

  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function close() {
    setOpen(false)
    setError('')
    setName('')
    setCode('')
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (tab === 'create') {
        if (name.trim().length < 2) {
          setError('Dê um nome com pelo menos 2 caracteres.')
          return
        }
        await createServer(name.trim())
        toast.show('Servidor criado!', 'success')
      } else {
        if (!code.trim()) {
          setError('Cole o código de convite recebido.')
          return
        }
        await joinServer(code.trim())
        toast.show('Você entrou no servidor.', 'success')
      }
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo deu errado. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title="Adicionar servidor" width={440}>
      <div className={styles.tabs} role="tablist" aria-label="Opções de servidor">
        <button
          role="tab"
          aria-selected={tab === 'create'}
          className={cx(styles.tab, tab === 'create' && styles.tabActive)}
          onClick={() => setTab('create')}
          type="button"
        >
          <Plus size={15} /> Criar
        </button>
        <button
          role="tab"
          aria-selected={tab === 'join'}
          className={cx(styles.tab, tab === 'join' && styles.tabActive)}
          onClick={() => setTab('join')}
          type="button"
        >
          <LogIn size={15} /> Entrar com código
        </button>
      </div>

      <form onSubmit={submit} className={styles.form} noValidate>
        {tab === 'create' ? (
          <Input
            label="Nome do servidor"
            placeholder="Ex.: Sala da equipe"
            value={name}
            error={error || undefined}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        ) : (
          <>
            <Input
              label="Código de convite"
              placeholder="Ex.: aB3xK9"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              error={error || undefined}
              hint="Peça o código ao dono do servidor (menu do servidor → Copiar código)."
              autoFocus
            />
          </>
        )}

        <Button type="submit" variant="primary" fullWidth loading={busy}>
          {tab === 'create' ? 'Criar servidor' : 'Entrar'}
        </Button>
      </form>
    </Modal>
  )
}
