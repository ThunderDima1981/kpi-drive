import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useAvatarUrl } from '../lib/avatars.ts'
import { initials } from '../lib/format.ts'

export function Avatar({
  name,
  userId,
  employeeId,
  className,
}: {
  name: string
  userId?: string | null
  employeeId?: string | null
  className?: string
}) {
  const url = useAvatarUrl({ userId, employeeId })
  const [broken, setBroken] = useState('')
  const showPhoto = Boolean(url) && broken !== url
  return (
    <span
      className={cn(
        'grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-sm font-semibold select-none',
        className,
      )}
    >
      {showPhoto ? (
        <img src={url} alt={name} className="size-full object-cover" loading="lazy" onError={() => setBroken(url)} />
      ) : (
        <span aria-hidden="true">{initials(name) || '?'}</span>
      )}
    </span>
  )
}
