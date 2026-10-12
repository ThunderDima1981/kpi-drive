import { useSyncExternalStore } from 'react'
import { api } from './api.ts'
import { emptyTeam } from './period.ts'
import { useTeamStore } from '../store/team-store.ts'
import type { TeamData } from '../types.ts'

const clientId = crypto.randomUUID()

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

let enabled = false
let subscribed = false
let timer: ReturnType<typeof setTimeout> | null = null
let pending: TeamData | null = null
let saving = false
let refreshing = false
let refreshQueued = false
let status: SaveStatus = 'idle'
let events: EventSource | null = null
const listeners = new Set<() => void>()
const refreshListeners = new Set<() => void>()

export function onTeamRefreshed(listener: () => void) {
  refreshListeners.add(listener)
  return () => refreshListeners.delete(listener)
}

function notifyTeamRefreshed() {
  for (const listener of refreshListeners) listener()
}

function setStatus(next: SaveStatus) {
  status = next
  for (const listener of listeners) listener()
}

export function teamSnapshot(state: TeamData): TeamData {
  return {
    currentPeriod: state.currentPeriod,
    periodLabel: state.periodLabel,
    periods: state.periods,
    employees: state.employees,
    kpiCatalog: state.kpiCatalog,
  }
}

export function enableTeamSync(on: boolean) {
  enabled = on
  if (!on && timer) {
    clearTimeout(timer)
    timer = null
  }
}

export function startTeamSync() {
  if (subscribed) return
  subscribed = true
  useTeamStore.subscribe((state) => {
    if (!enabled) return
    if (timer) clearTimeout(timer)
    pending = teamSnapshot(state)
    setStatus('saving')
    timer = setTimeout(() => {
      timer = null
      const snapshot = pending
      pending = null
      if (snapshot) void saveTeam(snapshot)
    }, 250)
  })
}

let savePromise: Promise<void> = Promise.resolve()

function saveTeam(snapshot: TeamData) {
  saving = true
  const run = (async () => {
    try {
      await api('/api/team', {
        method: 'PUT',
        body: JSON.stringify(snapshot),
        headers: { 'x-client-id': clientId },
      })
      setStatus('saved')
    } catch {
      setStatus('error')
    } finally {
      saving = false
      if (refreshQueued) void refreshFromPeer()
    }
  })()
  savePromise = run
  return run
}

export function refreshFromPeer() {
  if (timer || pending || saving || refreshing) {
    refreshQueued = true
    return
  }
  refreshQueued = false
  refreshing = true
  void loadTeam()
    .catch(() => undefined)
    .finally(() => {
      refreshing = false
      if (refreshQueued) refreshFromPeer()
    })
}

export function startTeamEvents() {
  stopTeamEvents()
  const stream = new EventSource('/api/team/events')
  events = stream
  stream.addEventListener('team', (event) => {
    let origin = ''
    try {
      origin = String(JSON.parse((event as MessageEvent).data)?.origin ?? '')
    } catch {
      origin = ''
    }
    if (origin === clientId) return
    refreshFromPeer()
  })
  return stopTeamEvents
}

export function stopTeamEvents() {
  events?.close()
  events = null
}

export async function loadTeam() {
  enableTeamSync(false)
  const data = await api<unknown>('/api/team')
  useTeamStore.getState().replaceTeam(data)
  setStatus('saved')
  enableTeamSync(true)
  notifyTeamRefreshed()
}

export async function flushTeamSync() {
  const snapshot = timer && pending ? pending : null
  if (timer) {
    clearTimeout(timer)
    timer = null
    pending = null
  }
  await savePromise
  if (snapshot) await saveTeam(snapshot)
}

export async function moveSmartToNextMonth(employeeId: string, taskId: string) {
  const periodId = useTeamStore.getState().currentPeriod
  await flushTeamSync()
  const data = await api<unknown>('/api/smart-tasks/move', {
    method: 'POST',
    body: JSON.stringify({ employeeId, taskId, periodId }),
    headers: { 'x-client-id': clientId },
  })
  enableTeamSync(false)
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  pending = null
  useTeamStore.getState().replaceTeam(data)
  setStatus('saved')
  enableTeamSync(true)
}

export function clearTeamLocal() {
  enableTeamSync(false)
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  pending = null
  refreshQueued = false
  stopTeamEvents()
  useTeamStore.getState().replaceTeam(emptyTeam())
  setStatus('idle')
}

export function useSaveStatus() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => status,
    () => 'idle' as SaveStatus,
  )
}
