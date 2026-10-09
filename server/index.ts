import { createHash, randomBytes } from 'node:crypto'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { isRole, userChangeAllowed } from '../src/lib/access.ts'
import { emptyTeam } from '../src/lib/period.ts'
import { databaseUrl, migrate, pool } from './db.ts'
import { ensureLocalPostgres } from './ensure-postgres.ts'
import { hashPassword, temporaryPassword, verifyPassword } from './password.ts'
import type { TeamData } from '../src/types.ts'

const SESSION = 'kpi_session'
const MONTH = 60 * 60 * 24 * 30

const app = new Hono()

app.onError((error, c) => {
  console.error(error)
  if (isDatabaseDown(error)) return c.json({ error: 'База данных недоступна. PostgreSQL не запущен.' }, 503)
  return c.json({ error: 'Не удалось выполнить запрос.' }, 500)
})

app.get('/api/health', (c) => c.json({ ok: true }))

app.post('/api/auth/register', async (c) => {
  const body = await readJson(c)
  const email = emailOf(body)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email) return c.json({ error: 'Укажите почту.' }, 400)
  if (name.length < 2) return c.json({ error: 'Укажите имя.' }, 400)
  if (password.length < 8) return c.json({ error: 'Пароль должен быть не короче 8 символов.' }, 400)
  if (password.length > 72) return c.json({ error: 'Пароль слишком длинный.' }, 400)
  const id = crypto.randomUUID()
  const passwordHash = await hashPassword(password)
  try {
    await pool.query('INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)', [
      id,
      email,
      name,
      passwordHash,
    ])
  } catch (error) {
    if (isUniqueViolation(error)) return c.json({ error: 'Такая почта уже зарегистрирована.' }, 409)
    throw error
  }
  await pool.query('INSERT INTO teams (user_id, document) VALUES ($1, $2::jsonb)', [id, JSON.stringify(emptyTeam())])
  await startSession(c, id)
  return c.json({ user: { id, email, name, role: 'admin' as const } })
})

app.post('/api/auth/login', async (c) => {
  const body = await readJson(c)
  const email = emailOf(body)
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email || !password) return c.json({ error: 'Неверная почта или пароль.' }, 401)
  const found = await pool.query<{ id: string; email: string; name: string; role: string; password_hash: string }>(
    'SELECT id, email, name, role, password_hash FROM users WHERE email = $1',
    [email],
  )
  const user = found.rows[0]
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: 'Неверная почта или пароль.' }, 401)
  }
  await startSession(c, user.id)
  return c.json({ user: publicUser(user) })
})

app.post('/api/auth/logout', async (c) => {
  const token = getCookie(c, SESSION)
  if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(token)])
  deleteCookie(c, SESSION, { path: '/' })
  return c.json({ ok: true })
})

app.get('/api/auth/me', async (c) => {
  const user = await currentUser(c)
  if (!user) return c.json({ error: 'Нужно войти.' }, 401)
  return c.json({ user })
})

app.get('/api/users', async (c) => {
  const actor = await requireAdmin(c)
  if (!actor.user) return c.json({ error: actor.error }, actor.status)
  const found = await pool.query<{ id: string; email: string; name: string; role: string }>(
    'SELECT id, email, name, role FROM users ORDER BY name, email',
  )
  return c.json({ users: found.rows.map(publicUser) })
})

app.post('/api/users', async (c) => {
  const actor = await requireAdmin(c)
  if (!actor.user) return c.json({ error: actor.error }, actor.status)
  const body = await readJson(c)
  const email = emailOf(body)
  const name = nameOf(body?.name)
  const passwordIssue = passwordIssueOf(body?.password)
  const role = body && 'role' in body && body.role != null ? body.role : 'admin'
  if (!email) return c.json({ error: 'Укажите почту.' }, 400)
  if (!name) return c.json({ error: 'Укажите имя.' }, 400)
  if (passwordIssue) return c.json({ error: passwordIssue }, 400)
  if (!isRole(role)) return c.json({ error: 'Неизвестные права.' }, 400)
  const id = crypto.randomUUID()
  const passwordHash = await hashPassword(body?.password as string)
  try {
    await pool.query('INSERT INTO users (id, email, name, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [
      id,
      email,
      name,
      passwordHash,
      role,
    ])
  } catch (error) {
    if (isUniqueViolation(error)) return c.json({ error: 'Такая почта уже зарегистрирована.' }, 409)
    throw error
  }
  await pool.query('INSERT INTO teams (user_id, document) VALUES ($1, $2::jsonb)', [id, JSON.stringify(emptyTeam())])
  return c.json({ user: { id, email, name, role } }, 201)
})

app.patch('/api/users/:id', async (c) => {
  const actor = await requireAdmin(c)
  if (!actor.user) return c.json({ error: actor.error }, actor.status)
  const body = await readJson(c)
  const id = c.req.param('id')
  const existing = await findUser(id)
  if (!existing) return c.json({ error: 'Пользователь не найден.' }, 404)
  const name = body && 'name' in body ? nameOf(body.name) : existing.name
  const email = body && 'email' in body ? emailOf(body) : existing.email
  const role = body && 'role' in body ? body.role : existing.role
  if (body && 'name' in body && !name) return c.json({ error: 'Укажите имя.' }, 400)
  if (body && 'email' in body && !email) return c.json({ error: 'Укажите почту.' }, 400)
  if (!isRole(role)) return c.json({ error: 'Неизвестные права.' }, 400)
  if (!name || !email) return c.json({ error: 'Укажите имя и почту.' }, 400)
  if (role === 'user' && !(await anotherAdminExists(id))) {
    return c.json({ error: 'Должен остаться хотя бы один администратор.' }, 400)
  }
  try {
    const updated = await pool.query<{ id: string; email: string; name: string; role: string }>(
      'UPDATE users SET name = $2, email = $3, role = $4 WHERE id = $1 RETURNING id, email, name, role',
      [id, name, email, role],
    )
    const next = updated.rows[0]
    if (!next) return c.json({ error: 'Пользователь не найден.' }, 404)
    return c.json({ user: publicUser(next) })
  } catch (error) {
    if (isUniqueViolation(error)) return c.json({ error: 'Такая почта уже зарегистрирована.' }, 409)
    throw error
  }
})

app.post('/api/users/:id/password', async (c) => {
  const actor = await requireAdmin(c)
  if (!actor.user) return c.json({ error: actor.error }, actor.status)
  const body = await readJson(c)
  const passwordIssue = passwordIssueOf(body?.password)
  if (passwordIssue) return c.json({ error: passwordIssue }, 400)
  const id = c.req.param('id')
  const existing = await findUser(id)
  if (!existing) return c.json({ error: 'Пользователь не найден.' }, 404)
  await replacePassword(id, body?.password as string, id === actor.user.id ? getCookie(c, SESSION) : undefined)
  return c.json({ user: existing })
})

app.post('/api/users/:id/reset-password', async (c) => {
  const actor = await requireAdmin(c)
  if (!actor.user) return c.json({ error: actor.error }, actor.status)
  const id = c.req.param('id')
  const existing = await findUser(id)
  if (!existing) return c.json({ error: 'Пользователь не найден.' }, 404)
  const password = temporaryPassword()
  await replacePassword(id, password, id === actor.user.id ? getCookie(c, SESSION) : undefined)
  return c.json({ user: existing, password })
})

app.delete('/api/users/:id', async (c) => {
  const actor = await requireAdmin(c)
  if (!actor.user) return c.json({ error: actor.error }, actor.status)
  const id = c.req.param('id')
  const existing = await findUser(id)
  if (!existing) return c.json({ error: 'Пользователь не найден.' }, 404)
  if (existing.role === 'admin' && !(await anotherAdminExists(id))) {
    return c.json({ error: 'Должен остаться хотя бы один администратор.' }, 400)
  }
  await pool.query('DELETE FROM users WHERE id = $1', [id])
  return c.json({ ok: true })
})

app.get('/api/team', async (c) => {
  const user = await currentUser(c)
  if (!user) return c.json({ error: 'Нужно войти.' }, 401)
  const found = await pool.query<{ document: TeamData }>('SELECT document FROM teams WHERE user_id = $1', [user.id])
  const document = found.rows[0]?.document
  if (!document) return c.json(emptyTeam())
  return c.json(document)
})

app.put('/api/team', async (c) => {
  const user = await currentUser(c)
  if (!user) return c.json({ error: 'Нужно войти.' }, 401)
  const body = await readJson(c)
  if (!isTeamDocument(body)) return c.json({ error: 'Некорректные данные команды.' }, 400)
  const text = JSON.stringify(body)
  if (text.length > 1_500_000) return c.json({ error: 'Слишком большой объём данных.' }, 413)
  if (user.role !== 'admin') {
    const stored = await pool.query<{ document: TeamData }>('SELECT document FROM teams WHERE user_id = $1', [user.id])
    const previous = stored.rows[0]?.document ?? emptyTeam()
    if (!userChangeAllowed(previous, body)) {
      return c.json({ error: 'Эти правки доступны только администратору.' }, 403)
    }
  }
  await pool.query(
    `INSERT INTO teams (user_id, document, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE SET document = EXCLUDED.document, updated_at = now()`,
    [user.id, text],
  )
  return c.json(body)
})

async function requireAdmin(c: Parameters<typeof currentUser>[0]) {
  const user = await currentUser(c)
  if (!user) return { user: null, status: 401 as const, error: 'Нужно войти.' }
  if (user.role !== 'admin') return { user: null, status: 403 as const, error: 'Это может только администратор.' }
  return { user, status: 200 as const, error: '' }
}

async function findUser(id: string) {
  const found = await pool.query<{ id: string; email: string; name: string; role: string }>(
    'SELECT id, email, name, role FROM users WHERE id = $1',
    [id],
  )
  const user = found.rows[0]
  return user ? publicUser(user) : null
}

async function anotherAdminExists(exceptId: string) {
  const admins = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM users WHERE role = 'admin' AND id <> $1`,
    [exceptId],
  )
  return Number(admins.rows[0]?.count ?? 0) > 0
}

async function replacePassword(userId: string, password: string, keepToken: string | undefined) {
  const passwordHash = await hashPassword(password)
  await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, passwordHash])
  if (keepToken) {
    await pool.query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [userId, tokenHash(keepToken)])
  } else {
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId])
  }
}

function nameOf(value: unknown) {
  if (typeof value !== 'string') return null
  const name = value.trim()
  if (name.length < 2 || name.length > 120) return null
  return name
}

function passwordIssueOf(value: unknown) {
  if (typeof value !== 'string' || value.length < 8) return 'Пароль должен быть не короче 8 символов.'
  if (value.length > 72) return 'Пароль слишком длинный.'
  return null
}

function emailOf(body: { email?: unknown } | null) {
  if (typeof body?.email !== 'string') return null
  const email = body.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return null
  return email
}

async function readJson(c: { req: { json: () => Promise<unknown> } }) {
  try {
    const body = await c.req.json()
    return body && typeof body === 'object' ? (body as { email?: unknown; name?: unknown; password?: unknown; role?: unknown }) : null
  } catch {
    return null
  }
}

function isTeamDocument(value: unknown): value is TeamData {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<TeamData>
  if (typeof data.currentPeriod !== 'string' || !/^\d{4}-\d{2}$/.test(data.currentPeriod)) return false
  if (!Array.isArray(data.periods) || data.periods.length === 0) return false
  if (!Array.isArray(data.employees) || !Array.isArray(data.kpiCatalog)) return false
  return data.periods.every((period) => {
    if (!period || typeof period !== 'object') return false
    const item = period as { id?: unknown; employees?: unknown; kpiCatalog?: unknown }
    return typeof item.id === 'string' && /^\d{4}-\d{2}$/.test(item.id) && Array.isArray(item.employees) && Array.isArray(item.kpiCatalog)
  })
}

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

async function startSession(c: Parameters<typeof setCookie>[0], userId: string) {
  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + MONTH * 1000)
  await pool.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
    tokenHash(token),
    userId,
    expires,
  ])
  setCookie(c, SESSION, token, {
    httpOnly: true,
    path: '/',
    sameSite: 'Lax',
    maxAge: MONTH,
  })
}

function publicUser(user: { id: string; email: string; name: string; role: string }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role === 'user' ? 'user' as const : 'admin' as const }
}

async function currentUser(c: Parameters<typeof getCookie>[0]) {
  const token = getCookie(c, SESSION)
  if (!token) return null
  const found = await pool.query<{ id: string; email: string; name: string; role: string }>(
    `SELECT u.id, u.email, u.name, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash(token)],
  )
  const user = found.rows[0]
  return user ? publicUser(user) : null
}

function isDatabaseDown(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String(error.code) : ''
  return code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === '57P01' || code === '3D000' || code === '28P01'
}

const port = Number(process.env.PORT ?? 4327)

ensureLocalPostgres(databaseUrl)
await migrate()
serve({ fetch: app.fetch, hostname: '::', port }, (info) => {
  console.log(`API http://${info.address}:${info.port}`)
})
