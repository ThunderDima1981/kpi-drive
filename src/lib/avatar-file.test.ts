import { describe, expect, it } from 'vitest'
import { avatarFileProblem, avatarIndex, imageMime } from './avatar-file.ts'

const bytes = (...values: number[]) => new Uint8Array(values)
const text = (value: string) => [...value].map((char) => char.charCodeAt(0))

describe('imageMime', () => {
  it('recognises JPEG, PNG and WebP by their signatures', () => {
    expect(imageMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(imageMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png')
    expect(imageMime(bytes(...text('RIFF'), 0, 0, 0, 0, ...text('WEBP')))).toBe('image/webp')
  })

  it('rejects other files', () => {
    expect(imageMime(bytes(...text('<svg>')))).toBeNull()
    expect(imageMime(bytes(...text('GIF89a')))).toBeNull()
    expect(imageMime(bytes())).toBeNull()
  })
})

describe('avatarIndex', () => {
  it('maps users and their linked employees to versioned urls', () => {
    const index = avatarIndex([
      { userId: 'u1', employeeId: 'e1', version: '10' },
      { userId: 'u2', employeeId: null, version: '5' },
    ])
    expect(index.byUser.get('u1')).toBe('/api/avatars/u1?v=10')
    expect(index.byUser.get('u2')).toBe('/api/avatars/u2?v=5')
    expect(index.byEmployee.get('e1')).toBe('/api/avatars/u1?v=10')
    expect(index.byEmployee.size).toBe(1)
  })

  it('uses the newest photo when two accounts share an employee', () => {
    const index = avatarIndex([
      { userId: 'new', employeeId: 'e1', version: '20' },
      { userId: 'old', employeeId: 'e1', version: '10' },
    ])
    expect(index.byEmployee.get('e1')).toBe('/api/avatars/new?v=20')
  })
})

describe('avatarFileProblem', () => {
  it('accepts JPEG, PNG and WebP up to 15 MB', () => {
    expect(avatarFileProblem({ type: 'image/jpeg', size: 2_000_000 })).toBeNull()
    expect(avatarFileProblem({ type: 'image/webp', size: 15 * 1024 * 1024 })).toBeNull()
  })

  it('explains what is wrong with other files', () => {
    expect(avatarFileProblem({ type: 'image/gif', size: 1000 })).toBe('Подходит только JPEG, PNG или WebP.')
    expect(avatarFileProblem({ type: 'image/png', size: 16 * 1024 * 1024 })).toBe('Файл больше 15 МБ. Выберите фото поменьше.')
    expect(avatarFileProblem({ type: 'image/png', size: 0 })).toBe('Файл пустой.')
  })
})
