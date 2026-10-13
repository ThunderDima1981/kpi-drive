import { createHash, randomBytes } from 'node:crypto'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { pool } from './db.ts'

export const SESSION = 'kpi_session'
const MONTH = 60 * 60 * 24 * 30

export const USER_FIELDS = 'id, email, name, role, employee_id, matrix_ids, team_owner_id'

export type DbUser = {
  id: string
  email: string
  name: string
  role: string
  employee_id: string | null
  matrix_ids: unknown
  team_owner_id: string | null
}

export type Account = {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  employeeId: string | null
  matrixIds: string[]
  teamOwnerId: string | null
}

export function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function newToken() {
  return randomBytes(32).toString('hex')
}

export function isHttps(c: Context) {
  const forwarded = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim()
  if (forwarded) return forwarded === 'https'
  return new URL(c.req.url).protocol === 'https:'
}

export function appOrigin(c: Context) {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, '')
  if (configured) return configured
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? new URL(c.req.url).host
  return `${isHttps(c) ? 'https' : 'http'}://${host}`
}

export async function startSession(c: Context, userId: string) {
  const token = newToken()
  const expires = new Date(Date.now() + MONTH * 1000)
  await pool.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
    tokenHash(token),
    userId,
    expires,
  ])
  setCookie(c, SESSION, token, {
    httpOnly: true,
    secure: isHttps(c),
    path: '/',
    sameSite: 'Lax',
    maxAge: MONTH,
  })
}

export async function endSession(c: Context) {
  const token = getCookie(c, SESSION)
  if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(token)])
  deleteCookie(c, SESSION, { path: '/', secure: isHttps(c), httpOnly: true, sameSite: 'Lax' })
}

export async function currentUser(c: Context) {
  const token = getCookie(c, SESSION)
  if (!token) return null
  const found = await pool.query<DbUser>(
    `SELECT ${USER_FIELDS.split(', ').map((field) => `u.${field}`).join(', ')}
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash(token)],
  )
  const user = found.rows[0]
  return user ? toAccount(user) : null
}

export async function requireAdmin(c: Context) {
  const user = await currentUser(c)
  if (!user) return { user: null, status: 401 as const, error: 'Нужно войти.' }
  if (user.role !== 'admin') return { user: null, status: 403 as const, error: 'Это может только администратор.' }
  return { user, status: 200 as const, error: '' }
}

export async function findAccount(id: string) {
  const found = await pool.query<DbUser>(`SELECT ${USER_FIELDS} FROM users WHERE id = $1`, [id])
  const user = found.rows[0]
  return user ? toAccount(user) : null
}

export function toAccount(user: DbUser): Account {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role === 'user' ? 'user' : 'admin',
    employeeId: typeof user.employee_id === 'string' && user.employee_id ? user.employee_id : null,
    matrixIds: matrixIdsOf(user.matrix_ids) ?? [],
    teamOwnerId: user.team_owner_id,
  }
}

export function publicUser(user: Account) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    employeeId: user.employeeId,
    matrixIds: user.matrixIds,
  }
}

export function matrixIdsOf(value: unknown) {
  const source = typeof value === 'string' ? parseJsonArray(value) : value
  if (!Array.isArray(source)) return null
  const ids: string[] = []
  for (const item of source) {
    if (typeof item !== 'string') return null
    const id = item.trim()
    if (!id || id.length > 80) return null
    if (!ids.includes(id)) ids.push(id)
  }
  return ids
}

export function employeeIdOf(value: unknown) {
  if (value === null || value === '' || value === undefined) return null
  if (typeof value !== 'string') return undefined
  const id = value.trim()
  if (!id || id.length > 80) return undefined
  return id
}

export function accessOf(body: { employeeId?: unknown; matrixIds?: unknown } | null) {
  const employeeId = body && 'employeeId' in body ? employeeIdOf(body.employeeId) : null
  const matrixIds = body && 'matrixIds' in body ? matrixIdsOf(body.matrixIds) : []
  if (employeeId === undefined) return { error: 'Выберите сотрудника из команды.' }
  if (!matrixIds) return { error: 'Отметьте матрицы из команды.' }
  return { employeeId, matrixIds }
}

export function nameOf(value: unknown) {
  if (typeof value !== 'string') return null
  const name = value.trim()
  if (name.length < 2 || name.length > 120) return null
  return name
}

export function passwordIssueOf(value: unknown) {
  if (typeof value !== 'string' || value.length < 8) return 'Пароль должен быть не короче 8 символов.'
  if (value.length > 72) return 'Пароль слишком длинный.'
  return null
}

export function emailOf(body: { email?: unknown } | null) {
  if (typeof body?.email !== 'string') return null
  const email = body.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return null
  return email
}

export async function readJson(c: { req: { json: () => Promise<unknown> } }) {
  try {
    const body = await c.req.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}

function parseJsonArray(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}
