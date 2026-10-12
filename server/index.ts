import { createHash, randomBytes } from 'node:crypto'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { streamSSE } from 'hono/streaming'
import { publishTeamUpdate, subscribeTeamUpdates } from '../src/lib/team-live.ts'
import { isRole, mergeUserTeam, visibleTeam } from '../src/lib/access.ts'
import { emptyTeam, moveSmartTask, parsePeriodId } from '../src/lib/period.ts'
import { applyEvaluation, evaluationItems, hasEvaluations } from '../src/lib/evaluations.ts'
import { canMoveSmart, smartChangeError } from '../src/lib/smart-access.ts'
import { deliverSmartMail, loadMailConfig, saveMailConfig, sendTestMail } from './mail.ts'
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
  return c.json({ user: { id, email, name, role: 'admin' as const, employeeId: null, matrixIds: [] } })
})

app.post('/api/auth/login', async (c) => {
  const body = await readJson(c)
  const email = emailOf(body)
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email || !password) return c.json({ error: 'Неверная почта или пароль.' }, 401)
  const found = await pool.query<DbUser & { password_hash: string }>(
    `SELECT ${USER_FIELDS}, password_hash FROM users WHERE email = $1`,
    [email],
  )
  const user = found.rows[0]
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: 'Неверная почта или пароль.' }, 401)
  }
  await startSession(c, user.id)
  return c.json({ user: publicUser(toAccount(user)) })
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
  return c.json({ user: publicUser(user) })
})

app.get('/api/users', async (c) => {
  const actor = await requireAdmin(c)
  if (!actor.user) return c.json({ error: actor.error }, actor.status)
  const found = await pool.query<DbUser>(`SELECT ${USER_FIELDS} FROM users ORDER BY name, email`)
  return c.json({ users: found.rows.map((row) => publicUser(toAccount(row))) })
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
  const access = accessOf(body)
  if ('error' in access) return c.json({ error: access.error }, 400)
  const id = crypto.randomUUID()
  const passwordHash = await hashPassword(body?.password as string)
  try {
    await pool.query(
      `INSERT INTO users (id, email, name, password_hash, role, employee_id, matrix_ids, team_owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [id, email, name, passwordHash, role, access.employeeId, JSON.stringify(access.matrixIds), actor.user.id],
    )
  } catch (error) {
    if (isUniqueViolation(error)) return c.json({ error: 'Такая почта уже зарегистрирована.' }, 409)
    throw error
  }
  await pool.query('INSERT INTO teams (user_id, document) VALUES ($1, $2::jsonb)', [id, JSON.stringify(emptyTeam())])
  return c.json({
    user: { id, email, name, role, employeeId: access.employeeId, matrixIds: access.matrixIds },
  }, 201)
})

app.patch('/api/users/:id', async (c) => {
  const actor = await requireAdmin(c)
  if (!actor.user) return c.json({ error: actor.error }, actor.status)
  const body = await readJson(c)
  const id = c.req.param('id')
  const existing = await findAccount(id)
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
  const touchesAccess = Boolean(body && ('employeeId' in body || 'matrixIds' in body))
  let employeeId = existing.employeeId
  let matrixIds = existing.matrixIds
  let teamOwnerId = existing.teamOwnerId
  if (touchesAccess) {
    if (body && 'employeeId' in body) {
      const parsed = employeeIdOf(body.employeeId)
      if (parsed === undefined) return c.json({ error: 'Выберите сотрудника из команды.' }, 400)
      employeeId = parsed
    }
    if (body && 'matrixIds' in body) {
      const parsed = matrixIdsOf(body.matrixIds)
      if (!parsed) return c.json({ error: 'Отметьте матрицы из команды.' }, 400)
      matrixIds = parsed
    }
    teamOwnerId = actor.user.id
  }
  try {
    const updated = await pool.query<DbUser>(
      `UPDATE users
       SET name = $2, email = $3, role = $4, employee_id = $5, matrix_ids = $6::jsonb, team_owner_id = $7
       WHERE id = $1
       RETURNING ${USER_FIELDS}`,
      [id, name, email, role, employeeId, JSON.stringify(matrixIds), teamOwnerId],
    )
    const next = updated.rows[0]
    if (!next) return c.json({ error: 'Пользователь не найден.' }, 404)
    return c.json({ user: publicUser(toAccount(next)) })
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
  const existing = await findAccount(id)
  if (!existing) return c.json({ error: 'Пользователь не найден.' }, 404)
  await replacePassword(id, body?.password as string, id === actor.user.id ? getCookie(c, SESSION) : undefined)
  return c.json({ user: publicUser(existing) })
})

app.post('/api/users/:id/reset-password', async (c) => {
  const actor = await requireAdmin(c)
  if (!actor.user) return c.json({ error: actor.error }, actor.status)
  const id = c.req.param('id')
  const existing = await findAccount(id)
  if (!existing) return c.json({ error: 'Пользователь не найден.' }, 404)
  const password = temporaryPassword()
  await replacePassword(id, password, id === actor.user.id ? getCookie(c, SESSION) : undefined)
  return c.json({ user: publicUser(existing), password })
})

app.delete('/api/users/:id', async (c) => {
  const actor = await requireAdmin(c)
  if (!actor.user) return c.json({ error: actor.error }, actor.status)
  const id = c.req.param('id')
  const existing = await findAccount(id)
  if (!existing) return c.json({ error: 'Пользователь не найден.' }, 404)
  if (existing.role === 'admin' && !(await anotherAdminExists(id))) {
    return c.json({ error: 'Должен остаться хотя бы один администратор.' }, 400)
  }
  await pool.query('DELETE FROM users WHERE id = $1', [id])
  return c.json({ ok: true })
})

app.get('/api/team/events', async (c) => {
  const user = await currentUser(c)
  if (!user) return c.json({ error: 'Нужно войти.' }, 401)
  const ownerId = user.role === 'admin' ? user.id : user.teamOwnerId
  if (!ownerId) return c.json({ error: 'Администратор ещё не открыл матрицы.' }, 403)
  c.header('Cache-Control', 'no-cache')
  c.header('X-Accel-Buffering', 'no')
  return streamSSE(c, async (stream) => {
    let unsubscribe = () => {}
    const ping = setInterval(() => {
      void stream.writeSSE({ event: 'ping', data: '' }).catch(() => undefined)
    }, 20000)
    unsubscribe = subscribeTeamUpdates(ownerId, (notice) => {
      void stream.writeSSE({ event: 'team', data: JSON.stringify(notice) }).catch(() => undefined)
    })
    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        clearInterval(ping)
        unsubscribe()
        resolve()
      })
    })
  })
})

app.get('/api/team', async (c) => {
  const user = await currentUser(c)
  if (!user) return c.json({ error: 'Нужно войти.' }, 401)
  if (user.role === 'admin') return c.json((await loadTeamDocument(user.id)) ?? emptyTeam())
  if (!user.teamOwnerId) return c.json(emptyTeam())
  const document = await loadTeamDocument(user.teamOwnerId)
  if (!document) return c.json(emptyTeam())
  return c.json(visibleTeam(document, new Set(user.matrixIds)))
})

app.post('/api/smart-tasks/move', async (c) => {
  const user = await currentUser(c)
  if (!user) return c.json({ error: 'Нужно войти.' }, 401)
  const body = await readJson(c)
  const employeeId = typeof body?.employeeId === 'string' ? body.employeeId : ''
  const taskId = typeof body?.taskId === 'string' ? body.taskId : ''
  const periodId = typeof body?.periodId === 'string' ? body.periodId : ''
  if (!employeeId || employeeId.length > 80 || !taskId || taskId.length > 80 || !parsePeriodId(periodId)) {
    return c.json({ error: 'Некорректный запрос.' }, 400)
  }
  const ownerId = user.role === 'admin' ? user.id : user.teamOwnerId
  if (!ownerId) return c.json({ error: 'Администратор ещё не открыл матрицы.' }, 403)
  const stored = await loadTeamDocument(ownerId)
  if (!stored) return c.json({ error: 'Администратор ещё не открыл матрицы.' }, 403)
  const employee = stored.periods.find((period) => period.id === periodId)?.employees.find((item) => item.id === employeeId)
  if (!employee) return c.json({ error: 'Сотрудник не найден.' }, 404)
  if (user.role !== 'admin' && !user.matrixIds.includes(employeeId)) {
    return c.json({ error: 'Эти правки доступны только администратору.' }, 403)
  }
  if (!canMoveSmart({ role: user.role, employeeId: user.employeeId }, employee)) {
    return c.json({ error: 'Перенести смарт на следующий месяц может только руководитель сотрудника.' }, 403)
  }
  const moved = moveSmartTask(stored, employeeId, taskId, periodId)
  if ('error' in moved) return c.json({ error: moved.error }, 400)
  if (JSON.stringify(moved.team).length > 1_500_000) return c.json({ error: 'Слишком большой объём данных.' }, 413)
  await saveTeamDocument(ownerId, moved.team)
  publishTeamUpdate(ownerId, clientOrigin(c))
  if (user.role === 'admin') return c.json(moved.team)
  return c.json(visibleTeam(moved.team, new Set(user.matrixIds), periodId))
})

app.put('/api/team', async (c) => {
  const user = await currentUser(c)
  if (!user) return c.json({ error: 'Нужно войти.' }, 401)
  const body = await readJson(c)
  if (!isTeamDocument(body)) return c.json({ error: 'Некорректные данные команды.' }, 400)
  if (JSON.stringify(body).length > 1_500_000) return c.json({ error: 'Слишком большой объём данных.' }, 413)
  const actor = { role: user.role, employeeId: user.employeeId }
  if (user.role === 'admin') {
    const stored = (await loadTeamDocument(user.id)) ?? emptyTeam()
    const statusError = smartChangeError(stored, body, actor)
    if (statusError) return c.json({ error: statusError }, 403)
    await saveTeamDocument(user.id, body)
    publishTeamUpdate(user.id, clientOrigin(c))
    void deliverSmartMail(user.id, stored, body, actor).catch((error) => console.error(error))
    return c.json(body)
  }
  if (!user.teamOwnerId) return c.json({ error: 'Администратор ещё не открыл матрицы.' }, 403)
  const stored = await loadTeamDocument(user.teamOwnerId)
  if (!stored) return c.json({ error: 'Администратор ещё не открыл матрицы.' }, 403)
  const merged = mergeUserTeam(stored, body, new Set(user.matrixIds), actor)
  if (!merged || !('saved' in merged)) {
    return c.json({ error: merged && 'error' in merged ? merged.error : 'Эти правки доступны только администратору.' }, 403)
  }
  if (JSON.stringify(merged.saved).length > 1_500_000) return c.json({ error: 'Слишком большой объём данных.' }, 413)
  await saveTeamDocument(user.teamOwnerId, merged.saved)
  publishTeamUpdate(user.teamOwnerId, clientOrigin(c))
  void deliverSmartMail(user.teamOwnerId, stored, merged.saved, actor).catch((error) => console.error(error))
  return c.json(merged.view)
})

app.get('/api/mail', async (c) => {
  const actor = await requireAdmin(c)
  if (!actor.user) return c.json({ error: actor.error }, actor.status)
  return c.json(await loadMailConfig())
})

app.put('/api/mail', async (c) => {
  const actor = await requireAdmin(c)
  if (!actor.user) return c.json({ error: actor.error }, actor.status)
  const body = await readJson(c)
  const host = textField(body?.host, 200)
  const username = textField(body?.username, 200)
  const from = textField(body?.from, 200)
  const password = typeof body?.password === 'string' ? body.password : ''
  const port = typeof body?.port === 'number' ? body.port : Number(body?.port)
  if (host === null || username === null || from === null) return c.json({ error: 'Проверьте поля почтового сервера.' }, 400)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return c.json({ error: 'Укажите порт от 1 до 65535.' }, 400)
  if (from && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) return c.json({ error: 'Укажите адрес отправителя.' }, 400)
  if (password.length > 200) return c.json({ error: 'Пароль почты слишком длинный.' }, 400)
  return c.json(await saveMailConfig({ host, port, secure: body?.secure === true, username, password, from }))
})

app.post('/api/mail/test', async (c) => {
  const actor = await requireAdmin(c)
  if (!actor.user) return c.json({ error: actor.error }, actor.status)
  try {
    await sendTestMail(actor.user.email)
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Не удалось отправить письмо. Проверьте сервер, порт и пароль.' }, 502)
  }
  return c.json({ ok: true })
})

app.get('/api/evaluations', async (c) => {
  const user = await currentUser(c)
  if (!user) return c.json({ error: 'Нужно войти.' }, 401)
  const ownerId = user.role === 'admin' ? user.id : user.teamOwnerId
  const team = ownerId ? await loadTeamDocument(ownerId) : null
  if (!team) return c.json({ assigned: false, period: '', items: [] })
  const requested = c.req.query('period') ?? ''
  const period = /^\d{4}-\d{2}$/.test(requested) ? requested : team.currentPeriod
  return c.json({
    assigned: hasEvaluations(team, user.employeeId),
    period,
    items: evaluationItems(team, user.employeeId, period),
  })
})

app.post('/api/evaluations', async (c) => {
  const user = await currentUser(c)
  if (!user) return c.json({ error: 'Нужно войти.' }, 401)
  const body = await readJson(c)
  const periodId = typeof body?.periodId === 'string' ? body.periodId : ''
  const employeeId = typeof body?.employeeId === 'string' ? body.employeeId : ''
  const indicatorId = typeof body?.indicatorId === 'string' ? body.indicatorId : ''
  const score = typeof body?.score === 'number' ? body.score : Number(body?.score)
  if (!/^\d{4}-\d{2}$/.test(periodId) || !employeeId || employeeId.length > 80 || !indicatorId || indicatorId.length > 80) {
    return c.json({ error: 'Некорректный запрос.' }, 400)
  }
  if (!Number.isFinite(score)) return c.json({ error: 'Такой оценки нет на шкале.' }, 400)
  const ownerId = user.role === 'admin' ? user.id : user.teamOwnerId
  if (!ownerId) return c.json({ error: 'Администратор ещё не открыл матрицы.' }, 403)
  const stored = await loadTeamDocument(ownerId)
  if (!stored) return c.json({ error: 'Администратор ещё не открыл матрицы.' }, 403)
  const applied = applyEvaluation(stored, user.employeeId, periodId, employeeId, indicatorId, score)
  if ('error' in applied) return c.json({ error: applied.error }, 400)
  await saveTeamDocument(ownerId, applied.team)
  publishTeamUpdate(ownerId, clientOrigin(c))
  const item = evaluationItems(applied.team, user.employeeId, periodId).find(
    (row) => row.employeeId === employeeId && row.indicatorId === indicatorId,
  )
  return c.json({ item })
})

function textField(value: unknown, max: number) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text.length > max) return null
  return text
}

function clientOrigin(c: { req: { header: (name: string) => string | undefined } }) {
  const value = c.req.header('x-client-id') ?? ''
  return /^[0-9a-f-]{36}$/i.test(value) ? value : ''
}

async function requireAdmin(c: Parameters<typeof currentUser>[0]) {
  const user = await currentUser(c)
  if (!user) return { user: null, status: 401 as const, error: 'Нужно войти.' }
  if (user.role !== 'admin') return { user: null, status: 403 as const, error: 'Это может только администратор.' }
  return { user, status: 200 as const, error: '' }
}

const USER_FIELDS = 'id, email, name, role, employee_id, matrix_ids, team_owner_id'

type DbUser = {
  id: string
  email: string
  name: string
  role: string
  employee_id: string | null
  matrix_ids: unknown
  team_owner_id: string | null
}

type Account = {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  employeeId: string | null
  matrixIds: string[]
  teamOwnerId: string | null
}

async function findAccount(id: string) {
  const found = await pool.query<DbUser>(`SELECT ${USER_FIELDS} FROM users WHERE id = $1`, [id])
  const user = found.rows[0]
  return user ? toAccount(user) : null
}

async function loadTeamDocument(userId: string) {
  const found = await pool.query<{ document: TeamData }>('SELECT document FROM teams WHERE user_id = $1', [userId])
  return found.rows[0]?.document ?? null
}

async function saveTeamDocument(userId: string, document: TeamData) {
  await pool.query(
    `INSERT INTO teams (user_id, document, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE SET document = EXCLUDED.document, updated_at = now()`,
    [userId, JSON.stringify(document)],
  )
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

function accessOf(body: { employeeId?: unknown; matrixIds?: unknown } | null) {
  const employeeId = body && 'employeeId' in body ? employeeIdOf(body.employeeId) : null
  const matrixIds = body && 'matrixIds' in body ? matrixIdsOf(body.matrixIds) : []
  if (employeeId === undefined) return { error: 'Выберите сотрудника из команды.' }
  if (!matrixIds) return { error: 'Отметьте матрицы из команды.' }
  return { employeeId, matrixIds }
}

function employeeIdOf(value: unknown) {
  if (value === null || value === '') return null
  if (typeof value !== 'string') return undefined
  const id = value.trim()
  if (!id || id.length > 80) return undefined
  return id
}

function matrixIdsOf(value: unknown) {
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

function parseJsonArray(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
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
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null
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

function toAccount(user: DbUser): Account {
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

function publicUser(user: Account) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    employeeId: user.employeeId,
    matrixIds: user.matrixIds,
  }
}

async function currentUser(c: Parameters<typeof getCookie>[0]) {
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
