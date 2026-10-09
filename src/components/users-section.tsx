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
import type { User } from '../lib/session.ts'

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Администратор',
  user: 'Пользователь',
}

export function UsersSection({
  currentUserId,
  onAccountChange,
  onSelfRemoved,
}: {
  currentUserId: string
  onAccountChange: (user: User) => void
  onSelfRemoved: () => void
}) {
  const [users, setUsers] = useState<User[]>([])
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [passwordFor, setPasswordFor] = useState<User | null>(null)
  const [resetFor, setResetFor] = useState<User | null>(null)
  const [resetPassword, setResetPassword] = useState<{ name: string; password: string } | null>(null)
  const [deleteFor, setDeleteFor] = useState<User | null>(null)

  function replace(user: User) {
    setUsers((items) => items.map((item) => (item.id === user.id ? user : item)))
    onAccountChange(user)
  }

  useEffect(() => {
    let cancelled = false
    void api<{ users: User[] }>('/api/users')
      .then((result) => {
        if (!cancelled) setUsers(result.users)
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось загрузить список пользователей.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Права пользователей</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-soft">
            Администратор ведёт настройки и матрицу. Пользователь создаёт smart-задачи и ставит статус «Выполнено».
            Последнего администратора нельзя понизить или удалить.
          </p>
        </div>
        <Button type="button" variant={adding ? 'outline' : 'default'} onClick={() => setAdding((open) => !open)}>
          {adding ? 'Закрыть форму' : 'Добавить пользователя'}
        </Button>
      </div>

      {adding ? (
        <AddUserForm
          onCancel={() => setAdding(false)}
          onCreated={(user) => {
            setUsers((items) => [...items, user].sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.email.localeCompare(b.email)))
            setAdding(false)
            setError('')
          }}
        />
      ) : null}

      {users.length === 0 ? <p className="mt-4 text-sm text-ink-soft">Пользователей пока нет.</p> : null}
      <ul className="mt-4 grid gap-3">
        {users.map((user) => (
          <li key={user.id} className="grid gap-3 rounded-xl border border-line p-3 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="font-medium">
                {user.name}
                {user.id === currentUserId ? <span className="ml-2 text-xs font-normal text-ink-soft">это вы</span> : null}
              </p>
              <p className="text-sm text-ink-soft">{user.email}</p>
              <p className="mt-1 text-sm">{ROLE_LABEL[user.role]}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(user)}>
                Изменить
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setPasswordFor(user)}>
                Задать пароль
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setResetFor(user)}>
                Сбросить пароль
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={() => setDeleteFor(user)}>
                Удалить
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      {editing ? (
        <EditUserDialog
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={(user) => {
            replace(user)
            setEditing(null)
            setError('')
          }}
        />
      ) : null}
      {passwordFor ? (
        <SetPasswordDialog
          user={passwordFor}
          onClose={() => setPasswordFor(null)}
          onSaved={() => {
            setPasswordFor(null)
            setError('')
          }}
        />
      ) : null}
      {resetFor ? (
        <ResetPasswordDialog
          user={resetFor}
          onClose={() => setResetFor(null)}
          onReset={(password) => {
            setResetPassword({ name: resetFor.name, password })
            setResetFor(null)
            setError('')
          }}
        />
      ) : null}
      {resetPassword ? (
        <PasswordReveal
          name={resetPassword.name}
          password={resetPassword.password}
          onClose={() => setResetPassword(null)}
        />
      ) : null}
      {deleteFor ? (
        <DeleteUserDialog
          user={deleteFor}
          onClose={() => setDeleteFor(null)}
          onDeleted={() => {
            const removed = deleteFor
            setUsers((items) => items.filter((item) => item.id !== removed.id))
            setDeleteFor(null)
            setError('')
            if (removed.id === currentUserId) onSelfRemoved()
          }}
        />
      ) : null}
    </section>
  )
}

function AddUserForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (user: User) => void }) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const role = form.get('role') === 'user' ? 'user' : 'admin'
    setPending(true)
    setError('')
    try {
      const result = await api<{ user: User }>('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          email: String(form.get('email') ?? ''),
          password: String(form.get('password') ?? ''),
          role,
        }),
      })
      onCreated(result.user)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось добавить пользователя.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 rounded-xl border border-line p-3">
      <p className="text-sm font-medium">Новый пользователь</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Имя" name="name" autoComplete="off" />
        <Field label="Почта" name="email" type="email" autoComplete="off" />
        <Field label="Пароль" name="password" type="password" autoComplete="new-password" />
        <Label className="grid gap-1.5">
          <span>Права</span>
          <select name="role" aria-label="Права нового пользователя" defaultValue="admin" className="h-8 rounded-lg border border-input bg-white px-2 text-sm">
            <option value="admin">Администратор</option>
            <option value="user">Пользователь</option>
          </select>
        </Label>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Сохраняем…' : 'Создать'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </form>
  )
}

function EditUserDialog({
  user,
  onClose,
  onSaved,
}: {
  user: User
  onClose: () => void
  onSaved: (user: User) => void
}) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const role = form.get('role') === 'user' ? 'user' : 'admin'
    setPending(true)
    setError('')
    try {
      const result = await api<{ user: User }>(`/api/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          email: String(form.get('email') ?? ''),
          role,
        }),
      })
      onSaved(result.user)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить пользователя.')
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(event) => void submit(event)} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Изменить пользователя</DialogTitle>
            <DialogDescription>Имя, почта и права сохраняются для входа в эту учётную запись.</DialogDescription>
          </DialogHeader>
          <Field label="Имя" name="name" defaultValue={user.name} autoComplete="off" />
          <Field label="Почта" name="email" type="email" defaultValue={user.email} autoComplete="off" />
          <Label className="grid gap-1.5">
            <span>Права</span>
            <select name="role" aria-label={`Права: ${user.name}`} defaultValue={user.role} className="h-8 rounded-lg border border-input bg-white px-2 text-sm">
              <option value="admin">Администратор</option>
              <option value="user">Пользователь</option>
            </select>
          </Label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SetPasswordDialog({
  user,
  onClose,
  onSaved,
}: {
  user: User
  onClose: () => void
  onSaved: () => void
}) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') ?? '')
    const repeat = String(form.get('repeat') ?? '')
    if (password !== repeat) {
      setError('Пароли не совпадают.')
      return
    }
    setPending(true)
    setError('')
    try {
      await api(`/api/users/${user.id}/password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
      onSaved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось задать пароль.')
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(event) => void submit(event)} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Задать пароль</DialogTitle>
            <DialogDescription>
              Новый пароль для {user.name}. Прежние сеансы этой учётной записи завершатся.
            </DialogDescription>
          </DialogHeader>
          <Field label="Новый пароль" name="password" type="password" autoComplete="new-password" />
          <Field label="Повтор пароля" name="repeat" type="password" autoComplete="new-password" />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Сохраняем…' : 'Задать пароль'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({
  user,
  onClose,
  onReset,
}: {
  user: User
  onClose: () => void
  onReset: (password: string) => void
}) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function reset() {
    setPending(true)
    setError('')
    try {
      const result = await api<{ password: string }>(`/api/users/${user.id}/reset-password`, { method: 'POST' })
      onReset(result.password)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сбросить пароль.')
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Сбросить пароль</DialogTitle>
          <DialogDescription>
            Для {user.name} будет создан новый пароль. Старый перестанет подходить, а открытые сеансы завершатся.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button type="button" disabled={pending} onClick={() => void reset()}>
            {pending ? 'Сбрасываем…' : 'Сбросить пароль'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PasswordReveal({ name, password, onClose }: { name: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новый пароль</DialogTitle>
          <DialogDescription>
            Пароль для {name} показан один раз. Передайте его пользователю и попросите войти заново.
          </DialogDescription>
        </DialogHeader>
        <Label className="grid gap-1.5">
          <span>Пароль</span>
          <Input readOnly value={password} aria-label="Новый пароль" className="font-mono" />
        </Label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => void copy()}>
            {copied ? 'Скопирован' : 'Скопировать'}
          </Button>
          <Button type="button" onClick={onClose}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteUserDialog({
  user,
  onClose,
  onDeleted,
}: {
  user: User
  onClose: () => void
  onDeleted: () => void
}) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function remove() {
    setPending(true)
    setError('')
    try {
      await api(`/api/users/${user.id}`, { method: 'DELETE' })
      onDeleted()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось удалить пользователя.')
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Удалить пользователя</DialogTitle>
          <DialogDescription>
            Учётная запись {user.name} и её матрица будут удалены.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={() => void remove()}>
            {pending ? 'Удаляем…' : 'Удалить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  name,
  type = 'text',
  defaultValue,
  autoComplete,
}: {
  label: string
  name: string
  type?: string
  defaultValue?: string
  autoComplete?: string
}) {
  return (
    <Label className="grid gap-1.5">
      <span>{label}</span>
      <Input name={name} type={type} defaultValue={defaultValue} autoComplete={autoComplete} aria-label={label} />
    </Label>
  )
}
