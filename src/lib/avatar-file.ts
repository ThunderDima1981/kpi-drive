export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const AVATAR_MAX_FILE_MB = 15
export const AVATAR_SIDE = 320
export const AVATAR_RULES = [
  `Формат JPEG, PNG или WebP, файл до ${AVATAR_MAX_FILE_MB} МБ.`,
  'Лучше квадратное фото, лицо по центру: края обрежутся до квадрата.',
  `Картинка уменьшится до ${AVATAR_SIDE}×${AVATAR_SIDE} пикселей.`,
]

export function avatarFileProblem(file: { type: string; size: number }) {
  if (!AVATAR_TYPES.includes(file.type)) return 'Подходит только JPEG, PNG или WebP.'
  if (file.size > AVATAR_MAX_FILE_MB * 1024 * 1024) return `Файл больше ${AVATAR_MAX_FILE_MB} МБ. Выберите фото поменьше.`
  if (file.size === 0) return 'Файл пустой.'
  return null
}

export type AvatarRecord = { userId: string; employeeId: string | null; version: string }

export type AvatarIndex = { byUser: Map<string, string>; byEmployee: Map<string, string> }

export function imageMime(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) {
    return 'image/png'
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp'
  return null
}

export function avatarUrl(record: AvatarRecord) {
  return `/api/avatars/${record.userId}?v=${encodeURIComponent(record.version)}`
}

export function avatarIndex(records: AvatarRecord[]): AvatarIndex {
  const byUser = new Map<string, string>()
  const byEmployee = new Map<string, string>()
  const newest = new Map<string, number>()
  for (const record of records) {
    const url = avatarUrl(record)
    byUser.set(record.userId, url)
    if (!record.employeeId) continue
    const version = Number(record.version) || 0
    if ((newest.get(record.employeeId) ?? -1) >= version) continue
    newest.set(record.employeeId, version)
    byEmployee.set(record.employeeId, url)
  }
  return { byUser, byEmployee }
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end))
}
