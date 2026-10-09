import { useSyncExternalStore } from 'react'
import { api } from './api.ts'
import { emptyTeam } from './period.ts'
import { useTeamStore } from '../store/team-store.ts'
import type { TeamData } from '../types.ts'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

let enabled = false
let subscribed = false
let timer: ReturnType<typeof setTimeout> | null = null
let pending: TeamData | null = null
let status: SaveStatus = 'idle'
const listeners = new Set<() => void>()

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

async function saveTeam(snapshot: TeamData) {
  try {
    await api('/api/team', { method: 'PUT', body: JSON.stringify(snapshot) })
    setStatus('saved')
  } catch {
    setStatus('error')
  }
}

export async function loadTeam() {
  enableTeamSync(false)
  const data = await api<unknown>('/api/team')
  useTeamStore.getState().replaceTeam(data)
  setStatus('saved')
  enableTeamSync(true)
}

export async function flushTeamSync() {
  if (!timer || !pending) return
  clearTimeout(timer)
  timer = null
  const snapshot = pending
  pending = null
  await saveTeam(snapshot)
}

export function clearTeamLocal() {
  enableTeamSync(false)
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  pending = null
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
