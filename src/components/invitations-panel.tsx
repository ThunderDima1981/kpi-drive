import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Role } from '../lib/access.ts'
import { api } from '../lib/api.ts'
import { AccessFields, Field, type TeamEmployee } from './user-fields.tsx'

export type Invitation = {
  id: string
  email: string
  name: string
  role: Role
  employeeId: string | null
  createdAt: string
  expiresAt: string
  createdBy: string
}

type Created = { invitation: Invitation; link: string; mailed: boolean; mailError: string }

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export function InvitationsPanel({ employees, inviting, onCloseForm }: {
  employees: TeamEmployee[]
  inviting: boolean
  onCloseForm: () => void
}) {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<Created | null>(null)
  const [revoking, setRevoking] = useState('')

  useEffect(() => {
    let cancelled = false
    void api<{ invitations: Invitation[] }>('/api/invitations')
      .then((result) => {
        if (!cancelled) setInvitations(result.invitations)
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось загрузить приглашения.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function revoke(invitation: Invitation) {
    setRevoking(invitation.id)
    setError('')
    try {
      await api(`/api/invitations/${invitation.id}`, { method: 'DELETE' })
      setInvitations((items) => items.filter((item) => item.id !== invitation.id))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отозвать приглашение.')
    } finally {
      setRevoking('')
    }
  }

  return (
    <>
      {inviting ? (
        <InviteForm
          employees={employees}
          onCancel={onCloseForm}
          onCreated={(result) => {
            setInvitations((items) => [result.invitation, ...items.filter((item) => item.email !== result.invitation.email)])
            setCreated(result)
            onCloseForm()
          }}
        />
      ) : null}
      {loading ? null : invitations.length > 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-line p-3">
          <p className="text-sm font-medium">Ожидают регистрации</p>
          <ul className="mt-2 grid gap-2">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="font-medium">{invitation.name || invitation.email}</span>
                    {invitation.name ? <span className="text-ink-soft"> · {invitation.email}</span> : null}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {invitation.role === 'admin' ? 'Администратор' : 'Пользователь'} · действует до{' '}
                    {dateFormat.format(new Date(invitation.expiresAt))}
                    {invitation.createdBy ? ` · пригласил ${invitation.createdBy}` : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={revoking === invitation.id}
                  onClick={() => void revoke(invitation)}
                >
                  {revoking === invitation.id ? 'Отзываем…' : 'Отозвать'}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {created ? <InviteLinkDialog created={created} onClose={() => setCreated(null)} /> : null}
    </>
  )
}

function InviteForm({
  employees,
  onCancel,
  onCreated,
}: {
  employees: TeamEmployee[]
  onCancel: () => void
  onCreated: (result: Created) => void
}) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [matrixIds, setMatrixIds] = useState<string[]>([])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError('')
    try {
      const result = await api<Created>('/api/invitations', {
        method: 'POST',
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          email: String(form.get('email') ?? ''),
          role: form.get('role') === 'admin' ? 'admin' : 'user',
          employeeId: employeeId || null,
          matrixIds,
        }),
      })
      onCreated(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось создать приглашение.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 rounded-xl border border-line p-3">
      <div>
        <p className="text-sm font-medium">Приглашение</p>
        <p className="mt-1 text-xs text-ink-soft">
          Человек получит письмо со ссылкой, сам укажет имя и придумает пароль. Ссылка действует 7 дней.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Почта" name="email" type="email" autoComplete="off" />
        <Field label="Имя (необязательно)" name="name" autoComplete="off" />
        <Label className="grid gap-1.5">
          <span>Права</span>
          <select name="role" aria-label="Права приглашённого" defaultValue="user" className="h-8 rounded-lg border border-input bg-white px-2 text-sm">
            <option value="user">Пользователь</option>
            <option value="admin">Администратор</option>
          </select>
        </Label>
      </div>
      <AccessFields
        employees={employees}
        employeeId={employeeId}
        matrixIds={matrixIds}
        onEmployeeId={setEmployeeId}
        onMatrixIds={setMatrixIds}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Отправляем…' : 'Пригласить'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </form>
  )
}

function InviteLinkDialog({ created, onClose }: { created: Created; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(created.link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const description = created.mailed
    ? `Письмо со ссылкой отправлено на ${created.invitation.email}. Ссылку можно также передать вручную.`
    : created.mailError
      ? `Письмо не ушло: ${created.mailError} Передайте ссылку ${created.invitation.email} вручную.`
      : `Почтовый сервер не настроен, поэтому письмо не отправлено. Передайте ссылку ${created.invitation.email} вручную.`

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Приглашение создано</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Label className="grid gap-1.5">
          <span>Ссылка для регистрации</span>
          <Input
            readOnly
            value={created.link}
            aria-label="Ссылка для регистрации"
            className="font-mono text-xs"
            onFocus={(event) => event.currentTarget.select()}
          />
          <span className="text-xs font-normal text-ink-soft">Ссылка показана один раз и сработает только для этой почты.</span>
        </Label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => void copy()}>
            {copied ? 'Скопирована' : 'Скопировать ссылку'}
          </Button>
          <Button type="button" onClick={onClose}>
            Готово
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
