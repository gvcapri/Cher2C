import { useState } from 'react'
import { MessageSquareText, Mail, Lock, User as UserIcon } from 'lucide-react'
import { useAppStore } from '../../store'
import { Button, Input } from '../ui'
import styles from './AuthScreen.module.css'

/**
 * Tela de autenticação redesenhada:
 *  - card centralizado sobre fundo com gradiente sutil
 *  - validação inline (email/senha/usuário)
 *  - mostrar/ocultar senha (via Input)
 *  - loading no botão + mensagens de erro amigáveis
 */
export function AuthScreen() {
  const login = useAppStore((s) => s.login)
  const register = useAppStore((s) => s.register)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; username?: string; password?: string }>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  function validate(): boolean {
    const e: typeof errors = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Informe um e-mail válido'
    if (mode === 'register' && username.trim().length < 3) e.username = 'Mínimo de 3 caracteres'
    if (password.length < 8) e.password = 'A senha precisa de pelo menos 8 caracteres'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    setFormError('')
    if (!validate()) return
    setBusy(true)
    try {
      if (mode === 'login') await login(email.trim(), password)
      else await register(email.trim(), username.trim(), password)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setFormError(
        msg.includes('401') || msg.toLowerCase().includes('credenciais')
          ? 'E-mail ou senha incorretos.'
          : msg.includes('409') || msg.toLowerCase().includes('cadastrado')
            ? 'Este e-mail já está cadastrado.'
            : msg
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.logo}>
            <MessageSquareText size={30} />
          </div>
          <h1 className={styles.title}>Cher2C</h1>
          <p className={styles.subtitle}>
            {mode === 'login' ? 'Entre na sua conta para continuar' : 'Crie sua conta gratuitamente'}
          </p>
        </div>

        <form onSubmit={submit} className={styles.form} noValidate>
          <Input
            label="E-mail"
            type="email"
            icon={<Mail size={16} />}
            placeholder="voce@exemplo.com"
            value={email}
            error={errors.email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />

          {mode === 'register' && (
            <Input
              label="Nome de usuário"
              icon={<UserIcon size={16} />}
              placeholder="Como quer ser chamado"
              value={username}
              error={errors.username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          )}

          <Input
            label="Senha"
            type="password"
            icon={<Lock size={16} />}
            placeholder="Mínimo de 8 caracteres"
            value={password}
            error={errors.password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />

          {formError && (
            <div className={styles.formError} role="alert">
              {formError}
            </div>
          )}

          <Button type="submit" variant="primary" size="lg" loading={busy} fullWidth>
            {mode === 'login' ? 'Entrar' : 'Criar conta'}
          </Button>
        </form>

        <p className={styles.switch}>
          {mode === 'login' ? 'Não tem uma conta? ' : 'Já tem uma conta? '}
          <button
            className={styles.switchLink}
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login')
              setErrors({})
              setFormError('')
            }}
          >
            {mode === 'login' ? 'Criar conta' : 'Entrar'}
          </button>
        </p>
      </div>
    </div>
  )
}
