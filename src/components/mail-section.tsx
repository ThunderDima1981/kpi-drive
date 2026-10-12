import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api } from '../lib/api.ts'

type MailSettings = {
  host: string
  port: number
  secure: boolean
  username: string
  from: string
  passwordSet: boolean
}

const EMPTY: MailSettings = { host: '', port: 587, secure: false, username: '', from: '', passwordSet: false }

export function MailSection() {
  const [settings, setSettings] = useState<MailSettings>(EMPTY)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    void api<MailSettings>('/api/mail')
      .then((result) => {
        if (!cancelled) setSettings(result)
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось загрузить настройки почты.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const result = await api<MailSettings>('/api/mail', {
        method: 'PUT',
        body: JSON.stringify({ ...settings, password }),
      })
      setSettings(result)
      setPassword('')
      setMessage('Настройки почты сохранены.')
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось сохранить настройки почты.')
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    setTesting(true)
    setError('')
    setMessage('')
    try {
      const result = await api<{ ok: boolean }>('/api/mail/test', { method: 'POST' })
      if (result.ok) setMessage('Проверочное письмо отправлено на вашу почту.')
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось отправить проверочное письмо.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <h2 className="font-semibold">Подключение</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">
        Письмо уходит на почту учётной записи, привязанной к сотруднику. Когда появляется smart-задача, письмо получают сотрудник и тот, кто её создал. При смене статуса письмо получает руководитель. Когда руководитель закрывает смарт, письмо получает сотрудник.
      </p>
      {loading ? <p className="mt-4 text-sm text-ink-soft">Загружаем параметры…</p> : null}
      <form onSubmit={(event) => void save(event)} className="mt-4 grid gap-3 sm:grid-cols-2">
        <Label className="grid gap-1.5">
          <span>Сервер</span>
          <Input
            value={settings.host}
            aria-label="Сервер почты"
            placeholder="smtp.example.com"
            onValueChange={(host) => setSettings((current) => ({ ...current, host }))}
          />
        </Label>
        <Label className="grid gap-1.5">
          <span>Порт</span>
          <Input
            value={String(settings.port)}
            aria-label="Порт почты"
            inputMode="numeric"
            onValueChange={(value) => setSettings((current) => ({ ...current, port: Number(value.replace(/\D/g, '')) || 0 }))}
          />
        </Label>
        <Label className="grid gap-1.5">
          <span>Логин</span>
          <Input
            value={settings.username}
            aria-label="Логин почты"
            autoComplete="off"
            onValueChange={(username) => setSettings((current) => ({ ...current, username }))}
          />
        </Label>
        <Label className="grid gap-1.5">
          <span>Пароль</span>
          <Input
            value={password}
            type="password"
            aria-label="Пароль почты"
            autoComplete="new-password"
            placeholder={settings.passwordSet ? 'Пароль сохранён' : ''}
            onValueChange={setPassword}
          />
        </Label>
        <Label className="grid gap-1.5 sm:col-span-2">
          <span>Адрес отправителя</span>
          <Input
            value={settings.from}
            aria-label="Адрес отправителя"
            placeholder="kpi@example.com"
            onValueChange={(from) => setSettings((current) => ({ ...current, from }))}
          />
        </Label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox
            checked={settings.secure}
            aria-label="Защищённое соединение"
            onCheckedChange={(checked) => setSettings((current) => ({ ...current, secure: checked === true }))}
          />
          Защищённое соединение TLS. Для портов 465 и 587 шифрование выбирается само.
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" disabled={loading || saving}>
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </Button>
          <Button type="button" variant="outline" disabled={loading || testing || saving} onClick={() => void test()}>
            {testing ? 'Отправляем…' : 'Проверочное письмо'}
          </Button>
        </div>
      </form>
      {message ? (
        <p role="status" className="mt-3 text-sm text-ink-soft">
          {message}
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
    </section>
  )
}
