import { describe, expect, it } from 'vitest'
import { sameJson } from './teams.ts'

describe('sameJson', () => {
  it('ignores key order and undefined fields', () => {
    expect(sameJson({ a: 1, b: [1, { c: 'x' }] }, { b: [1, { c: 'x' }], a: 1, d: undefined })).toBe(true)
  })

  it('notices changed values, lengths and types', () => {
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false)
    expect(sameJson([1, 2], [1])).toBe(false)
    expect(sameJson({ a: [] }, { a: {} })).toBe(false)
    expect(sameJson({ a: null }, { a: 0 })).toBe(false)
  })
})
