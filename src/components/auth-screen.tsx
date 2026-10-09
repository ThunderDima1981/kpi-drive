import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api } from '../lib/api.ts'
import type { User } from '../lib/session.ts'

export function AuthScreen({ onSuccess }: { onSuccess: (user: User) => void | Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const nextName = String(form.get('name') ?? name).trim()
    const nextEmail = String(form.get('email') ?? email).trim()
    const nextPassword = String(form.get('password') ?? password)
    setName(nextName)
    setEmail(nextEmail)
    setPassword(nextPassword)
    setPending(true)
    setError('')
    try {
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const payload =
        mode === 'login'
          ? { email: nextEmail, password: nextPassword }
          : { name: nextName, email: nextEmail, password: nextPassword }
      const result = await api<{ user: User }>(path, { method: 'POST', body: JSON.stringify(payload) })
      await onSuccess(result.user)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось выполнить запрос.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-4 text-ink">
      <div className="w-full max-w-md rounded-2xl border border-line bg-card p-6 shadow-sm">
        <p className="text-xs font-semibold tracking-[0.16em] text-gold uppercase">KPI-Drive</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {mode === 'login' ? 'Вход' : 'Регистрация'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Матрицы, планы и факты хранятся в базе и доступны только этой учётной записи.
        </p>
        <form onSubmit={submit} className="mt-5 grid gap-3">
          {mode === 'register' ? (
            <Label className="grid gap-1.5">
              <span>Имя</span>
              <Input name="name" value={name} autoComplete="name" aria-label="Имя" onValueChange={setName} />
            </Label>
          ) : null}
          <Label className="grid gap-1.5">
            <span>Почта</span>
            <Input name="email" value={email} type="email" autoComplete="email" aria-label="Почта" onValueChange={setEmail} />
          </Label>
          <Label className="grid gap-1.5">
            <span>Пароль</span>
            <Input
              name="password"
              value={password}
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              aria-label="Пароль"
              onValueChange={setPassword}
            />
          </Label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать учётную запись'}
          </Button>
        </form>
        <button
          type="button"
          className="mt-4 text-sm font-medium text-pine"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError('')
          }}
        >
          {mode === 'login' ? 'Нет учётной записи? Зарегистрироваться' : 'Уже есть учётная запись? Войти'}
        </button>
      </div>
    </div>
  )
}
