import { describe, expect, it } from 'vitest'
import { hrefFor, parseHash } from './routes.ts'

describe('routes', () => {
  it('opens the team section from the settings root and keeps the other sections', () => {
    expect(parseHash('#/settings')).toEqual({ name: 'settings', section: 'team' })
    expect(parseHash('#/settings/kpi')).toEqual({ name: 'settings', section: 'kpi' })
    expect(parseHash('#/settings/users')).toEqual({ name: 'settings', section: 'users' })
    expect(parseHash('#/settings/mail')).toEqual({ name: 'settings', section: 'mail' })
    expect(parseHash('#/settings/log')).toEqual({ name: 'settings', section: 'log' })
    expect(parseHash('#/settings/unknown')).toEqual({ name: 'settings', section: 'team' })
    expect(parseHash('#/evaluations')).toEqual({ name: 'evaluations' })
    expect(hrefFor({ name: 'settings', section: 'users' })).toBe('#/settings/users')
    expect(hrefFor({ name: 'evaluations' })).toBe('#/evaluations')
  })
})
