import { createContext, useContext } from 'react'
import type { Role } from './access.ts'

const RoleContext = createContext<Role>('admin')

export function RoleProvider({ role, children }: { role: Role; children: React.ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>
}

export function useRole() {
  return useContext(RoleContext)
}

export function useIsAdmin() {
  return useRole() === 'admin'
}
