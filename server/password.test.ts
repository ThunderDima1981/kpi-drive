import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password.ts'

describe('password', () => {
  it('accepts the original password and rejects another', async () => {
    const stored = await hashPassword('correct-horse')
    expect(stored.startsWith('scrypt$')).toBe(true)
    expect(await verifyPassword('correct-horse', stored)).toBe(true)
    expect(await verifyPassword('wrong-horse', stored)).toBe(false)
  })
})
