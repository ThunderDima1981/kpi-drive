import { createHash, randomBytes } from 'node:crypto'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { emptyTeam } from '../src/lib/period.ts'
import { migrate, pool } from './db.ts'
import { hashPassword, verifyPassword } from './password.ts'
import type { TeamData } from '../src/types.ts'

const SESSION = 'kpi_session'
const MONTH = 60 * 60 * 24 * 30

const app = new Hono()

app.onError((error, c) => {
  console.error(error)
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
  return c.json({ user: { id, email, name } })
})

app.post('/api/auth/login', async (c) => {
  const body = await readJson(c)
  const email = emailOf(body)
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email || !password) return c.json({ error: 'Неверная почта или пароль.' }, 401)
  const found = await pool.query<{ id: string; email: string; name: string; password_hash: string }>(
    'SELECT id, email, name, password_hash FROM users WHERE email = $1',
    [email],
  )
  const user = found.rows[0]
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: 'Неверная почта или пароль.' }, 401)
  }
  await startSession(c, user.id)
  return c.json({ user: { id: user.id, email: user.email, name: user.name } })
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
  await pool.query(
    `INSERT INTO teams (user_id, document, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE SET document = EXCLUDED.document, updated_at = now()`,
    [user.id, text],
  )
  return c.json(body)
})

function emailOf(body: { email?: unknown } | null) {
  if (typeof body?.email !== 'string') return null
  const email = body.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return null
  return email
}

async function readJson(c: { req: { json: () => Promise<unknown> } }) {
  try {
    const body = await c.req.json()
    return body && typeof body === 'object' ? (body as { email?: unknown; name?: unknown; password?: unknown }) : null
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

async function currentUser(c: Parameters<typeof getCookie>[0]) {
  const token = getCookie(c, SESSION)
  if (!token) return null
  const found = await pool.query<{ id: string; email: string; name: string }>(
    `SELECT u.id, u.email, u.name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash(token)],
  )
  return found.rows[0] ?? null
}

const port = Number(process.env.PORT ?? 4327)

await migrate()
serve({ fetch: app.fetch, hostname: '::', port }, (info) => {
  console.log(`API http://${info.address}:${info.port}`)
})
