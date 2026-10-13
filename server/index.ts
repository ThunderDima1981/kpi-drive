import { serve } from '@hono/node-server'
import { Hono, type Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { streamSSE } from 'hono/streaming'
import { publishTeamUpdate, subscribeTeamUpdates } from '../src/lib/team-live.ts'
import { documentOwnerId, isRole, mergeUserTeam, visibleTeam } from '../src/lib/access.ts'
import { describeTeamChanges } from '../src/lib/audit.ts'
import { emptyTeam, formatPeriod, moveSmartTask, parsePeriodId } from '../src/lib/period.ts'
import { applyEvaluation, evaluationItems, hasEvaluations } from '../src/lib/evaluations.ts'
import { canMoveSmart, smartChangeError } from '../src/lib/smart-access.ts'
import { mailErrorText } from '../src/lib/smtp.ts'
import { listAudit, recordAudit, type AuditActor } from './audit.ts'
import { registerAuthRoutes } from './auth.ts'
import { deliverSmartMail, loadMailConfig, saveMailConfig, sendTestMail } from './mail.ts'
import { databaseUrl, migrate, pool } from './db.ts'
import { ensureLocalPostgres } from './ensure-postgres.ts'
import { hashPassword, temporaryPassword } from './password.ts'
import {
  accessOf,
  type Account,
  currentUser,
  type DbUser,
  emailOf,
  employeeIdOf,
  findAccount,
  isUniqueViolation,
  matrixIdsOf,
  nameOf,
  passwordIssueOf,
  publicUser,
  readJson,
  requireAdmin,
  SESSION,
  toAccount,
  tokenHash,
  USER_FIELDS,
} from './session.ts'
import { loadTeamDocument, REVISION_HEADER, withTeamLock } from './teams.ts'
import type { TeamData } from '../src/types.ts'

const MAX_TEAM_SIZE = 1_500_000
const ROLE_LABEL = { admin: 'Администратор', user: 'Пользователь' } as const

const app = new Hono()

app.onError((error, c) => {
  console.error(error)
  if (isDatabaseDown(error)) return c.json({ error: 'База данных недоступна. PostgreSQL не запущен.' }, 503)
  return c.json({ error: 'Не удалось выполнить запрос.' }, 500)
})

app.get('/api/health', (c) => c.json({ ok: true }))

registerAuthRoutes(app)

app.get('/api/users', async (c) => {
  const actor = await requireAdmin(c)
  if (!actor.user) return c.json({ error: actor.error }, actor.status)
  const found = await pool.query<DbUser & { locked: boolean }>(
    `SELECT ${USER_FIELDS}, coalesce(locked_until > now(), false) AS locked FROM users ORDER BY name, email`,
  )
  return c.json({ users: found.rows.map((row) => ({ ...publicUser(toAccount(row)), locked: row.locked })) })
})

app.post('/api/users', async (c) => {
  const actor = await requireAdmin(c)
  if (!actor.user) return c.json({ error: actor.error }, actor.status)
  const body = await readJson(c)
  const email = emailOf(body)
  const name = nameOf(body?.name)
  const passwordIssue = passwordIssueOf(body?.password)
  const role = body && 'role' in body && body.role != null ? body.role : 'user'
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
      [id, email, name, passwordHash, role, access.employeeId, JSON.stringify(access.matrixIds), documentOwnerId(actor.user)],
    )
  } catch (error) {
    if (isUniqueViolation(error)) return c.json({ error: 'Такая почта уже зарегистрирована.' }, 409)
    throw error
  }
  await pool.query('INSERT INTO teams (user_id, document) VALUES ($1, $2::jsonb)', [id, JSON.stringify(emptyTeam())])
  await recordAudit(auditActor(actor.user), 'Добавлен пользователь', [`${name} (${email}) — ${ROLE_LABEL[role]}`])
  return c.json({
    user: { id, email, name, role, employeeId: access.employeeId, matrixIds: access.matrixIds, locked: false },
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
    const ownerId = documentOwnerId(actor.user)
    teamOwnerId = ownerId === id ? null : ownerId
  }
  try {
    const updated = await pool.query<DbUser & { locked: boolean }>(
      `UPDATE users
       SET name = $2, email = $3, role = $4, employee_id = $5, matrix_ids = $6::jsonb, team_owner_id = $7
       WHERE id = $1
       RETURNING ${USER_FIELDS}, coalesce(locked_until > now(), false) AS locked`,
      [id, name, email, role, employeeId, JSON.stringify(matrixIds), teamOwnerId],
    )
    const next = updated.rows[0]
    if (!next) return c.json({ error: 'Пользователь не найден.' }, 404)
    const account = toAccount(next)
    const changes = accountChanges(existing, account)
    if (changes.length > 0) await recordAudit(auditActor(actor.user), `Изменён пользователь ${account.name}`, changes)
    return c.json({ user: { ...publicUser(account), locked: next.locked } })
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
  await recordAudit(auditActor(actor.user), 'Задан пароль', [`${existing.name} (${existing.email})`])
  return c.json({ user: { ...publicUser(existing), locked: false } })
})

app.post('/api/users/:id/reset-password', async (c) => {
  const actor = await requireAdmin(c)
  if (!actor.user) return c.json({ error: actor.error }, actor.status)
  const id = c.req.param('id')
  const existing = await findAccount(id)
  if (!existing) return c.json({ error: 'Пользователь не найден.' }, 404)
  const password = temporaryPassword()
  await replacePassword(id, password, id === actor.user.id ? getCookie(c, SESSION) : undefined)
  await recordAudit(auditActor(actor.user), 'Выдан временный пароль', [`${existing.name} (${existing.email})`])
  return c.json({ user: { ...publicUser(existing), locked: false }, password })
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
  await recordAudit(auditActor(actor.user), 'Удалён пользователь', [`${existing.name} (${existing.email})`])
  return c.json({ ok: true })
})

app.get('/api/audit', async (c) => {
  const actor = await requireAdmin(c)
  if (!actor.user) return c.json({ error: actor.error }, actor.status)
  const before = c.req.query('before') ?? ''
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 50, 1), 200)
  return c.json(await listAudit(limit, /^\d{1,18}$/.test(before) ? before : null))
})

app.get('/api/team/events', async (c) => {
  const user = await currentUser(c)
  if (!user) return c.json({ error: 'Нужно войти.' }, 401)
  const ownerId = documentOwnerId(user)
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
  c.header('Cache-Control', 'no-store')
  const ownerId = documentOwnerId(user)
  if (!ownerId) return c.json(emptyTeam())
  const stored = await loadTeamDocument(ownerId)
  c.header(REVISION_HEADER, String(stored?.revision ?? 0))
  const document = stored?.document ?? emptyTeam()
  if (user.role === 'admin') return c.json(document)
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
  const ownerId = documentOwnerId(user)
  if (!ownerId) return c.json({ error: 'Администратор ещё не открыл матрицы.' }, 403)
  const outcome = await withTeamLock(ownerId, async (stored, save) => {
    if (!stored) return { error: 'Администратор ещё не открыл матрицы.', status: 403 as const }
    const employee = stored.document.periods
      .find((period) => period.id === periodId)
      ?.employees.find((item) => item.id === employeeId)
    if (!employee) return { error: 'Сотрудник не найден.', status: 404 as const }
    if (user.role !== 'admin' && !user.matrixIds.includes(employeeId)) {
      return { error: 'Эти правки доступны только администратору.', status: 403 as const }
    }
    if (!canMoveSmart({ role: user.role, employeeId: user.employeeId }, employee)) {
      return { error: 'Перенести смарт на следующий месяц может только руководитель сотрудника.', status: 403 as const }
    }
    const moved = moveSmartTask(stored.document, employeeId, taskId, periodId)
    if ('error' in moved) return { error: moved.error, status: 400 as const }
    if (JSON.stringify(moved.team).length > MAX_TEAM_SIZE) return { error: 'Слишком большой объём данных.', status: 413 as const }
    const revision = await save(moved.team, user.name)
    return { team: moved.team, revision, employee: employee.name, task: taskName(employee, taskId) }
  })
  if ('error' in outcome) return c.json({ error: outcome.error }, outcome.status)
  publishTeamUpdate(ownerId, clientOrigin(c))
  await recordAudit(auditActor(user), 'Смарт перенесён на следующий месяц', [
    `${outcome.employee}: «${outcome.task}» из периода «${formatPeriod(periodId)}»`,
  ])
  c.header(REVISION_HEADER, String(outcome.revision))
  if (user.role === 'admin') return c.json(outcome.team)
  return c.json(visibleTeam(outcome.team, new Set(user.matrixIds), periodId))
})

app.put('/api/team', async (c) => {
  const user = await currentUser(c)
  if (!user) return c.json({ error: 'Нужно войти.' }, 401)
  const body = await readJson(c)
  if (!isTeamDocument(body)) return c.json({ error: 'Некорректные данные команды.' }, 400)
  if (JSON.stringify(body).length > MAX_TEAM_SIZE) return c.json({ error: 'Слишком большой объём данных.' }, 413)
  const actor = { role: user.role, employeeId: user.employeeId, name: user.name }
  const ownerId = documentOwnerId(user)
  if (!ownerId) return c.json({ error: 'Администратор ещё не открыл матрицы.' }, 403)

  if (user.role === 'admin') {
    const expected = Number(c.req.header(REVISION_HEADER) ?? NaN)
    if (!Number.isInteger(expected) || expected < 0) {
      return c.json({ error: 'Страница устарела. Обновите её, чтобы не затереть чужие правки.', conflict: true }, 409)
    }
    const outcome = await withTeamLock(ownerId, async (found, save) => {
      const stored = found ?? { document: emptyTeam(), revision: 0, updatedBy: '' }
      if (stored.revision !== expected) return { kind: 'conflict' as const, stored }
      const storedHasPeople = stored.document.periods.some((period) => period.employees.length > 0)
      const incomingHasPeople = body.periods.some((period) => period.employees.length > 0)
      if (user.id !== ownerId && storedHasPeople && !incomingHasPeople) return { kind: 'unchanged' as const, stored }
      const statusError = smartChangeError(stored.document, body, actor)
      if (statusError) return { kind: 'error' as const, error: statusError }
      const revision = await save(body, user.name)
      return { kind: 'saved' as const, saved: body, before: stored.document, revision }
    })
    if (outcome.kind === 'conflict') {
      c.header(REVISION_HEADER, String(outcome.stored.revision))
      const who = outcome.stored.updatedBy || 'другой пользователь'
      return c.json(
        { error: `Пока вы редактировали, данные изменил ${who}. Загружена актуальная версия — повторите последние правки.`, conflict: true },
        409,
      )
    }
    if (outcome.kind === 'unchanged') {
      c.header(REVISION_HEADER, String(outcome.stored.revision))
      return c.json(outcome.stored.document)
    }
    if (outcome.kind === 'error') return c.json({ error: outcome.error }, 403)
    publishTeamUpdate(ownerId, clientOrigin(c))
    await recordTeamChanges(user, outcome.before, outcome.saved)
    void deliverSmartMail(ownerId, outcome.before, outcome.saved, actor).catch((error) => console.error(error))
    c.header(REVISION_HEADER, String(outcome.revision))
    return c.json(outcome.saved)
  }

  const outcome = await withTeamLock(ownerId, async (stored, save) => {
    if (!stored) return { error: 'Администратор ещё не открыл матрицы.', status: 403 as const }
    const merged = mergeUserTeam(stored.document, body, new Set(user.matrixIds), actor)
    if (!merged || !('saved' in merged)) {
      return {
        error: merged && 'error' in merged ? merged.error : 'Эти правки доступны только администратору.',
        status: 403 as const,
      }
    }
    if (JSON.stringify(merged.saved).length > MAX_TEAM_SIZE) return { error: 'Слишком большой объём данных.', status: 413 as const }
    const revision = await save(merged.saved, user.name)
    return { merged, before: stored.document, revision }
  })
  if ('error' in outcome) return c.json({ error: outcome.error }, outcome.status)
  publishTeamUpdate(ownerId, clientOrigin(c))
  await recordTeamChanges(user, outcome.before, outcome.merged.saved)
  void deliverSmartMail(ownerId, outcome.before, outcome.merged.saved, actor).catch((error) => console.error(error))
  c.header(REVISION_HEADER, String(outcome.revision))
  return c.json(outcome.merged.view)
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
  const saved = await saveMailConfig({ host, port, secure: body?.secure === true, username, password, from })
  await recordAudit(auditActor(actor.user), 'Изменены настройки почты', [
    `${host || 'сервер не указан'}:${port}, отправитель ${from || 'не указан'}${password ? ', пароль обновлён' : ''}`,
  ])
  return c.json(saved)
})

app.post('/api/mail/test', async (c) => {
  const actor = await requireAdmin(c)
  if (!actor.user) return c.json({ error: actor.error }, actor.status)
  try {
    await sendTestMail(actor.user.email)
  } catch (error) {
    console.error(error)
    return c.json({ error: mailErrorText(error) }, 502)
  }
  return c.json({ ok: true })
})

app.get('/api/evaluations', async (c) => {
  const user = await currentUser(c)
  if (!user) return c.json({ error: 'Нужно войти.' }, 401)
  const ownerId = documentOwnerId(user)
  const team = ownerId ? (await loadTeamDocument(ownerId))?.document : null
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
  const ownerId = documentOwnerId(user)
  if (!ownerId) return c.json({ error: 'Администратор ещё не открыл матрицы.' }, 403)
  const outcome = await withTeamLock(ownerId, async (stored, save) => {
    if (!stored) return { error: 'Администратор ещё не открыл матрицы.', status: 403 as const }
    const applied = applyEvaluation(stored.document, user.employeeId, periodId, employeeId, indicatorId, score)
    if ('error' in applied) return { error: applied.error, status: 400 as const }
    await save(applied.team, user.name)
    return { before: stored.document, team: applied.team }
  })
  if ('error' in outcome) return c.json({ error: outcome.error }, outcome.status)
  publishTeamUpdate(ownerId, clientOrigin(c))
  await recordTeamChanges(user, outcome.before, outcome.team, 'Выставлена оценка')
  const item = evaluationItems(outcome.team, user.employeeId, periodId).find(
    (row) => row.employeeId === employeeId && row.indicatorId === indicatorId,
  )
  return c.json({ item })
})

async function recordTeamChanges(user: Account, before: TeamData, after: TeamData, action = 'Изменены данные команды') {
  const lines = describeTeamChanges(before, after)
  if (lines.length === 0) return
  await recordAudit(auditActor(user), action, lines, 'team')
}

function auditActor(user: Account): AuditActor {
  return { id: user.id, name: user.name }
}

function accountChanges(before: Account, after: Account) {
  const lines: string[] = []
  if (before.name !== after.name) lines.push(`Имя: ${before.name} → ${after.name}`)
  if (before.email !== after.email) lines.push(`Почта: ${before.email} → ${after.email}`)
  if (before.role !== after.role) lines.push(`Права: ${ROLE_LABEL[before.role]} → ${ROLE_LABEL[after.role]}`)
  if (before.employeeId !== after.employeeId) lines.push('Изменён связанный сотрудник')
  if (JSON.stringify(before.matrixIds) !== JSON.stringify(after.matrixIds)) {
    lines.push(`Доступ к матрицам: ${after.matrixIds.length}`)
  }
  return lines
}

function taskName(employee: TeamData['employees'][number], taskId: string) {
  for (const indicator of employee.indicators) {
    if (indicator.type !== 'smart') continue
    const task = indicator.tasks.find((item) => item.id === taskId)
    if (task) return task.name || 'без названия'
  }
  return 'смарт'
}

function textField(value: unknown, max: number) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text.length > max) return null
  return text
}

function clientOrigin(c: Context) {
  const value = c.req.header('x-client-id') ?? ''
  return /^[0-9a-f-]{36}$/i.test(value) ? value : ''
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
  await pool.query('UPDATE users SET password_hash = $2, failed_logins = 0, locked_until = NULL WHERE id = $1', [
    userId,
    passwordHash,
  ])
  if (keepToken) {
    await pool.query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [userId, tokenHash(keepToken)])
  } else {
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId])
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
