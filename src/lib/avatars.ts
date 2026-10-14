import { useSyncExternalStore } from 'react'
import { ApiError, api } from './api.ts'
import { AVATAR_SIDE, avatarFileProblem, avatarIndex, type AvatarIndex, type AvatarRecord } from './avatar-file.ts'

let records: AvatarRecord[] = []
let index: AvatarIndex = avatarIndex([])
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function publish(next: AvatarRecord[]) {
  records = next
  index = avatarIndex(next)
  for (const listener of listeners) listener()
}

export function loadAvatars() {
  loading ??= api<{ avatars: AvatarRecord[] }>('/api/avatars')
    .then((result) => publish(result.avatars))
    .catch(() => undefined)
    .finally(() => {
      loading = null
    })
  return loading
}

export function clearAvatars() {
  publish([])
}

export function useAvatarUrl(target: { userId?: string | null; employeeId?: string | null }) {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => (target.userId ? index.byUser.get(target.userId) : undefined) ?? (target.employeeId ? index.byEmployee.get(target.employeeId) : undefined) ?? '',
    () => '',
  )
}

export async function uploadAvatar(userId: string, file: File) {
  const problem = avatarFileProblem(file)
  if (problem) throw new ApiError(400, problem)
  const blob = await squareImage(file)
  const response = await fetch(`/api/users/${userId}/avatar`, {
    method: 'PUT',
    body: blob,
    headers: { 'content-type': blob.type },
    credentials: 'same-origin',
  })
  const body = (await response.json().catch(() => null)) as (AvatarRecord & { error?: string }) | null
  if (!response.ok || !body) throw new ApiError(response.status, body?.error || 'Не удалось загрузить фото.')
  publish([...records.filter((record) => record.userId !== userId), { userId, employeeId: body.employeeId, version: body.version }])
}

export async function removeAvatar(userId: string) {
  await api(`/api/users/${userId}/avatar`, { method: 'DELETE' })
  publish(records.filter((record) => record.userId !== userId))
}

async function squareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new ApiError(400, 'Не удалось открыть картинку. Подойдёт JPEG, PNG или WebP.')
  })
  const side = Math.min(bitmap.width, bitmap.height)
  const size = Math.min(AVATAR_SIDE, side)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new ApiError(400, 'Браузер не смог обработать картинку.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size, size)
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
  if (!blob) throw new ApiError(400, 'Браузер не смог обработать картинку.')
  return blob
}
