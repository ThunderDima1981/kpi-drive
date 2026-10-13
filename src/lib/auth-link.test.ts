import { describe, expect, it } from 'vitest'
import { readAuthLink } from './auth-link.ts'

const token = 'a'.repeat(64)

describe('readAuthLink', () => {
  it('reads invite and reset tokens', () => {
    expect(readAuthLink(`?invite=${token}`)).toEqual({ kind: 'invite', token })
    expect(readAuthLink(`?reset=${token}`)).toEqual({ kind: 'reset', token })
  })

  it('ignores malformed tokens and empty queries', () => {
    expect(readAuthLink('?invite=abc')).toBeNull()
    expect(readAuthLink('')).toBeNull()
  })
})
