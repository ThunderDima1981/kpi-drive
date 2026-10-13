import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api } from '../lib/api.ts'
import { readAuthLink, type AuthLink } from '../lib/auth-link.ts'
import type { User } from '../lib/session.ts'

type Mode = 'login' | 'register' | 'forgot' | 'reset'

const TITLES: Record<Mode, string> = {
  login: 'Вход',
  register: 'Регистрация',
  forgot: 'Восстановление пароля',
  reset: 'Новый пароль',
}

export function AuthScreen({ onSuccess }: { onSuccess: (user: User) => void | Promise<void> }) {
  const [link] = useState<AuthLink | null>(() => readAuthLink(window.location.search))
  const [mode, setMode] = useState<Mode>(link?.kind === 'reset' ? 'reset' : link?.kind === 'invite' ? 'register' : 'login')
  const [registrationOpen, setRegistrationOpen] = useState(false)
  const [checking, setChecking] = useState(Boolean(link))
  const [lockedEmail, setLockedEmail] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    void api<{ registrationOpen: boolean }>('/api/auth/config')
      .then((config) => {
        if (!cancelled) setRegistrationOpen(config.registrationOpen)
      })
      .catch(() => undefined)
    if (link) {
      const path =
        link.kind === 'invite'
          ? `/api/auth/invite?token=${encodeURIComponent(link.token)}`
          : `/api/auth/reset?token=${encodeURIComponent(link.token)}`
      void api<{ email: string; name?: string }>(path)
        .then((result) => {
          if (cancelled) return
          setLockedEmail(result.email)
          setEmail(result.email)
          if (result.name) setName(result.name)
        })
        .catch((reason) => {
          if (cancelled) return
          clearLink()
          setMode(link.kind === 'reset' ? 'forgot' : 'login')
          setError(reason instanceof ApiError ? reason.message : 'Ссылка не открылась. Попробуйте ещё раз.')
        })
        .finally(() => {
          if (!cancelled) setChecking(false)
        })
    }
    return () => {
      cancelled = true
    }
  }, [link])

  const invited = mode === 'register' && link?.kind === 'invite' && Boolean(lockedEmail)
  const canRegister = registrationOpen || invited

  function switchTo(next: Mode) {
    setMode(next)
    setError('')
    setInfo('')
    if (next === 'login' || next === 'forgot') {
      setLockedEmail('')
      clearLink()
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const nextName = String(form.get('name') ?? name).trim()
    const nextEmail = lockedEmail || String(form.get('email') ?? email).trim()
    const nextPassword = String(form.get('password') ?? password)
    const nextConfirm = String(form.get('confirm') ?? confirm)
    setName(nextName)
    setEmail(nextEmail)
    setPassword(nextPassword)
    setError('')
    setInfo('')
    if ((mode === 'reset' || mode === 'register') && nextPassword !== nextConfirm) {
      setError('Пароли не совпадают.')
      return
    }
    setPending(true)
    try {
      if (mode === 'forgot') {
        await api('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ email: nextEmail }) })
        setInfo('Если такая почта зарегистрирована, мы отправили на неё письмо со ссылкой. Ссылка действует 1 час.')
        return
      }
      let path = '/api/auth/login'
      let payload: Record<string, string> = { email: nextEmail, password: nextPassword }
      if (mode === 'register') {
        path = '/api/auth/register'
        payload = { name: nextName, email: nextEmail, password: nextPassword }
        if (link?.kind === 'invite') payload.invite = link.token
      }
      if (mode === 'reset' && link?.kind === 'reset') {
        path = '/api/auth/reset'
        payload = { token: link.token, password: nextPassword }
      }
      const result = await api<{ user: User }>(path, { method: 'POST', body: JSON.stringify(payload) })
      clearLink()
      await onSuccess(result.user)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось выполнить запрос.')
    } finally {
      setPending(false)
    }
  }

  const lead =
    mode === 'forgot'
      ? 'Укажите почту учётной записи — пришлём ссылку, по которой можно задать новый пароль.'
      : mode === 'reset'
        ? 'Придумайте новый пароль. После сохранения вы сразу войдёте, а другие сеансы будут закрыты.'
        : mode === 'register' && !canRegister
          ? 'Учётные записи создаёт администратор. Попросите его прислать приглашение на вашу почту.'
          : mode === 'register' && invited
            ? 'Вас пригласили в KPI-Drive. Укажите имя и придумайте пароль.'
            : 'Матрицы, планы и факты команды хранятся в базе и доступны по правам вашей учётной записи.'

  const submitLabel = {
    login: 'Войти',
    register: 'Создать учётную запись',
    forgot: 'Отправить ссылку',
    reset: 'Сохранить пароль и войти',
  }[mode]

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-4 text-ink">
      <div className="w-full max-w-md rounded-2xl border border-line bg-card p-6 shadow-sm">
        <p className="text-xs font-semibold tracking-[0.16em] text-gold uppercase">KPI-Drive</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{TITLES[mode]}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{lead}</p>
        {checking ? (
          <p className="mt-5 text-sm text-ink-soft" role="status">
            Проверяем ссылку…
          </p>
        ) : mode === 'register' && !canRegister ? (
          <>
            {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
            <Button className="mt-5 w-full" variant="outline" onClick={() => switchTo('login')}>
              Ко входу
            </Button>
          </>
        ) : (
          <form onSubmit={submit} className="mt-5 grid gap-3">
            {mode === 'register' ? (
              <Label className="grid gap-1.5">
                <span>Имя</span>
                <Input name="name" value={name} autoComplete="name" aria-label="Имя" onValueChange={setName} />
              </Label>
            ) : null}
            {mode !== 'reset' || lockedEmail ? (
              <Label className="grid gap-1.5">
                <span>Почта</span>
                <Input
                  name="email"
                  value={lockedEmail || email}
                  type="email"
                  autoComplete="email"
                  aria-label="Почта"
                  readOnly={Boolean(lockedEmail)}
                  className={lockedEmail ? 'bg-muted text-ink-soft' : undefined}
                  onValueChange={setEmail}
                />
              </Label>
            ) : null}
            {mode !== 'forgot' ? (
              <Label className="grid gap-1.5">
                <span>{mode === 'reset' ? 'Новый пароль' : 'Пароль'}</span>
                <Input
                  name="password"
                  value={password}
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  aria-label={mode === 'reset' ? 'Новый пароль' : 'Пароль'}
                  onValueChange={setPassword}
                />
              </Label>
            ) : null}
            {mode === 'register' || mode === 'reset' ? (
              <Label className="grid gap-1.5">
                <span>Повторите пароль</span>
                <Input
                  name="confirm"
                  value={confirm}
                  type="password"
                  autoComplete="new-password"
                  aria-label="Повторите пароль"
                  onValueChange={setConfirm}
                />
                <span className="text-xs font-normal text-ink-soft">Не короче 8 символов.</span>
              </Label>
            ) : null}
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {info ? (
              <p className="rounded-lg bg-pine/10 px-3 py-2 text-sm text-pine" role="status">
                {info}
              </p>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? 'Подождите…' : submitLabel}
            </Button>
          </form>
        )}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium text-pine">
          {mode === 'login' ? (
            <>
              <button type="button" onClick={() => switchTo('forgot')}>
                Забыли пароль?
              </button>
              {registrationOpen ? (
                <button type="button" onClick={() => switchTo('register')}>
                  Создать первую учётную запись
                </button>
              ) : null}
            </>
          ) : (
            <button type="button" onClick={() => switchTo('login')}>
              Вернуться ко входу
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function clearLink() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('invite') && !url.searchParams.has('reset')) return
  url.searchParams.delete('invite')
  url.searchParams.delete('reset')
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}
