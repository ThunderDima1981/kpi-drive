type TeamNotice = { origin: string }
type TeamListener = (notice: TeamNotice) => void

const rooms = new Map<string, Set<TeamListener>>()

export function publishTeamUpdate(ownerId: string, origin: string) {
  for (const listener of rooms.get(ownerId) ?? []) listener({ origin })
}

export function subscribeTeamUpdates(ownerId: string, listener: TeamListener) {
  const listeners = rooms.get(ownerId) ?? new Set()
  listeners.add(listener)
  rooms.set(ownerId, listeners)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) rooms.delete(ownerId)
  }
}
