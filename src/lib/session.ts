import type { Role } from './access.ts'

export interface User {
  id: string
  email: string
  name: string
  role: Role
}
