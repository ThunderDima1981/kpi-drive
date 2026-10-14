import { useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ApiError } from '../lib/api.ts'
import { AVATAR_RULES } from '../lib/avatar-file.ts'
import { removeAvatar, uploadAvatar, useAvatarUrl } from '../lib/avatars.ts'
import { Avatar } from './avatar.tsx'

export function AvatarPicker({
  userId,
  name,
  className,
  tone = 'light',
  showActions = true,
}: {
  userId: string
  name: string
  className?: string
  tone?: 'light' | 'dark'
  showActions?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const url = useAvatarUrl({ userId })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function choose(file: File | undefined) {
    if (!file) return
    setPending(true)
    setError('')
    try {
      await uploadAvatar(userId, file)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить фото.')
    } finally {
      setPending(false)
      if (input.current) input.current.value = ''
    }
  }

  async function remove() {
    setPending(true)
    setError('')
    try {
      await removeAvatar(userId)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось удалить фото.')
    } finally {
      setPending(false)
    }
  }

  const muted = tone === 'dark' ? 'text-white/60 hover:text-white' : 'text-ink-soft hover:text-ink'

  return (
    <div className="flex items-center gap-3">
      <span className="group/avatar relative shrink-0">
      <button
        type="button"
        disabled={pending}
        aria-label={url ? `Заменить фото: ${name}` : `Загрузить фото: ${name}`}
        title={`${url ? 'Заменить фото' : 'Загрузить фото'}\n${AVATAR_RULES.join('\n')}`}
        className="group relative shrink-0 rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        onClick={() => input.current?.click()}
      >
        <Avatar name={name} userId={userId} className={cn(pending && 'opacity-60', className)} />
        <span className="absolute inset-0 grid place-items-center rounded-full bg-ink/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera className="size-4" />
        </span>
      </button>
      {!showActions && url && !pending ? (
        <button
          type="button"
          aria-label={`Удалить фото: ${name}`}
          title="Удалить фото"
          className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full border border-line bg-card text-ink opacity-0 shadow-sm transition-opacity group-hover/avatar:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          onClick={() => void remove()}
        >
          <X className="size-3" />
        </button>
      ) : null}
      </span>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => void choose(event.target.files?.[0])}
      />
      {showActions ? (
        <div className="grid gap-0.5 text-xs">
          <button type="button" disabled={pending} className={cn('text-left font-medium', muted)} onClick={() => input.current?.click()}>
            {pending ? 'Сохраняем…' : url ? 'Заменить фото' : 'Загрузить фото'}
          </button>
          {url && !pending ? (
            <button type="button" className={cn('text-left', muted)} onClick={() => void remove()}>
              Удалить фото
            </button>
          ) : null}
          {error ? <span className="text-destructive">{error}</span> : null}
          <ul className={cn('mt-1 grid gap-0.5', tone === 'dark' ? 'text-white/50' : 'text-ink-soft')}>
            {AVATAR_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      ) : error ? (
        <span className="text-xs text-destructive">{error}</span>
      ) : null}
    </div>
  )
}
