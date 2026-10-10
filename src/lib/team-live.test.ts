import { describe, expect, it } from 'vitest'
import { publishTeamUpdate, subscribeTeamUpdates } from './team-live.ts'

describe('team live updates', () => {
  it('tells every open window except a listener that already unsubscribed', () => {
    const seen: string[] = []
    const stopAdmin = subscribeTeamUpdates('owner', (notice) => seen.push(`admin:${notice.origin}`))
    const stopOther = subscribeTeamUpdates('owner', (notice) => seen.push(`other:${notice.origin}`))
    publishTeamUpdate('owner', 'user-window')
    stopOther()
    publishTeamUpdate('owner', 'user-window')
    stopAdmin()
    publishTeamUpdate('owner', 'user-window')
    expect(seen).toEqual(['admin:user-window', 'other:user-window', 'admin:user-window'])
  })
})
