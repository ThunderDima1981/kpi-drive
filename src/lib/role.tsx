import { createContext, useContext } from 'react'
import type { Role } from './access.ts'
import type { SmartActor } from './smart-access.ts'

const RoleContext = createContext<SmartActor>({ role: 'admin', employeeId: null })

export function RoleProvider({
  role,
  employeeId,
  children,
}: {
  role: Role
  employeeId: string | null
  children: React.ReactNode
}) {
  return <RoleContext.Provider value={{ role, employeeId }}>{children}</RoleContext.Provider>
}

export function useRole() {
  return useContext(RoleContext).role
}

export function useActor() {
  return useContext(RoleContext)
}

export function useIsAdmin() {
  return useRole() === 'admin'
}
