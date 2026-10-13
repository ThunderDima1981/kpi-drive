import type { Hono } from 'hono'
import { documentOwnerId, isRole } from '../src/lib/access.ts'
import { emptyTeam } from '../src/lib/period.ts'
import { mailErrorText } from '../src/lib/smtp.ts'
import { recordAudit } from './audit.ts'
import { pool } from './db.ts'
import { mailReady, sendLetter } from './mail.ts'
import { hashPassword, verifyPassword } from './password.ts'
import {
  accessOf,
  appOrigin,
  currentUser,
  type DbUser,
  emailOf,
  endSession,
  isUniqueViolation,
  nameOf,
  newToken,
  passwordIssueOf,
  publicUser,
  readJson,
  requireAdmin,
  startSession,
  toAccount,
  tokenHash,
  USER_FIELDS,
} from './session.ts'

export const MAX_FAILED_LOGINS = 5
const LOCK_MINUTES = 15
const INVITE_DAYS = 7
const RESET_MINUTES = 60

const ROLE_LABEL = { admin: 'Администратор', user: 'Пользователь' } as const

type InviteRow = {
  id: string
  email: string
  name: string
  role: string
  employee_id: string | null
  matrix_ids: unknown
  team_owner_id: string | null
  created_at: Date
  expires_at: Date
  created_by_name: string | null
}

export function registerAuthRoutes(app: Hono) {
  app.get('/api/auth/config', async (c) => {
    return c.json({ registrationOpen: !(await adminExists()) })
  })

  app.get('/api/auth/invite', async (c) => {
    const invite = await findInvite(c.req.query('token') ?? '')
    if (!invite) return c.json({ error: 'Приглашение недействительно или истекло. Попросите администратора прислать новое.' }, 404)
    return c.json({ email: invite.email, name: invite.name })
  })

  app.post('/api/auth/register', async (c) => {
    const body = await readJson(c)
    const name = nameOf(body?.name)
    const passwordIssue = passwordIssueOf(body?.password)
    if (!name) return c.json({ error: 'Укажите имя.' }, 400)
    if (passwordIssue) return c.json({ error: passwordIssue }, 400)
    const passwordHash = await hashPassword(body?.password as string)
    const id = crypto.randomUUID()
    const inviteToken = typeof body?.invite === 'string' ? body.invite : ''

    if (!inviteToken) {
      if (await adminExists()) return c.json({ error: 'Регистрация только по приглашению администратора.' }, 403)
      const email = emailOf(body)
      if (!email) return c.json({ error: 'Укажите почту.' }, 400)
      try {
        await pool.query('INSERT INTO users (id, email, name, password_hash, role) VALUES ($1, $2, $3, $4, $5)', [
          id,
          email,
          name,
          passwordHash,
          'admin',
        ])
      } catch (error) {
        if (isUniqueViolation(error)) return c.json({ error: 'Такая почта уже зарегистрирована.' }, 409)
        throw error
      }
      await pool.query('INSERT INTO teams (user_id, document) VALUES ($1, $2::jsonb)', [id, JSON.stringify(emptyTeam())])
      await recordAudit({ id, name }, 'Создан первый администратор', [email])
      await startSession(c, id)
      return c.json({ user: { id, email, name, role: 'admin', employeeId: null, matrixIds: [] } })
    }

    const client = await pool.connect()
    let created: DbUser | null = null
    try {
      await client.query('BEGIN')
      const found = await client.query<InviteRow>(
        `SELECT i.*, NULL::text AS created_by_name FROM invitations i
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`,
        [tokenHash(inviteToken)],
      )
      const invite = found.rows[0]
      if (!invite) {
        await client.query('ROLLBACK')
        return c.json({ error: 'Приглашение недействительно или истекло. Попросите администратора прислать новое.' }, 400)
      }
      const inserted = await client.query<DbUser>(
        `INSERT INTO users (id, email, name, password_hash, role, employee_id, matrix_ids, team_owner_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
         RETURNING ${USER_FIELDS}`,
        [id, invite.email, name, passwordHash, invite.role, invite.employee_id, JSON.stringify(invite.matrix_ids ?? []), invite.team_owner_id],
      )
      await client.query('UPDATE invitations SET used_at = now() WHERE id = $1', [invite.id])
      await client.query('INSERT INTO teams (user_id, document) VALUES ($1, $2::jsonb)', [id, JSON.stringify(emptyTeam())])
      await client.query('COMMIT')
      created = inserted.rows[0] ?? null
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      if (isUniqueViolation(error)) return c.json({ error: 'Такая почта уже зарегистрирована.' }, 409)
      throw error
    } finally {
      client.release()
    }
    if (!created) return c.json({ error: 'Не удалось создать учётную запись.' }, 500)
    const account = toAccount(created)
    await recordAudit({ id: account.id, name: account.name }, 'Регистрация по приглашению', [
      `${account.email} — ${ROLE_LABEL[account.role]}`,
    ])
    await startSession(c, account.id)
    return c.json({ user: publicUser(account) })
  })

  app.post('/api/auth/login', async (c) => {
    const body = await readJson(c)
    const email = emailOf(body)
    const password = typeof body?.password === 'string' ? body.password : ''
    if (!email || !password) return c.json({ error: 'Неверная почта или пароль.' }, 401)
    const found = await pool.query<DbUser & { password_hash: string; locked_minutes: number | null }>(
      `SELECT ${USER_FIELDS}, password_hash,
              CASE WHEN locked_until > now() THEN ceil(extract(epoch FROM locked_until - now()) / 60)::int END AS locked_minutes
       FROM users WHERE email = $1`,
      [email],
    )
    const user = found.rows[0]
    if (!user) return c.json({ error: 'Неверная почта или пароль.' }, 401)
    if (user.locked_minutes) return c.json({ error: lockedText(user.locked_minutes) }, 429)
    if (!(await verifyPassword(password, user.password_hash))) {
      const failed = await pool.query<{ failed_logins: number; locked: boolean }>(
        `UPDATE users SET
           failed_logins = CASE WHEN failed_logins + 1 >= $2 THEN 0 ELSE failed_logins + 1 END,
           locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
         WHERE id = $1
         RETURNING failed_logins, coalesce(locked_until > now(), false) AS locked`,
        [user.id, MAX_FAILED_LOGINS, LOCK_MINUTES],
      )
      const state = failed.rows[0]
      if (state?.locked) {
        await recordAudit({ id: user.id, name: user.name }, 'Вход заблокирован', [
          `${user.email}: ${MAX_FAILED_LOGINS} неверных паролей подряд, блокировка на ${LOCK_MINUTES} минут`,
        ])
        return c.json({ error: lockedText(LOCK_MINUTES) }, 429)
      }
      const left = MAX_FAILED_LOGINS - (state?.failed_logins ?? 0)
      return c.json({ error: `Неверная почта или пароль. Осталось попыток: ${left}.` }, 401)
    }
    await pool.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [user.id])
    await startSession(c, user.id)
    return c.json({ user: publicUser(toAccount(user)) })
  })

  app.post('/api/auth/logout', async (c) => {
    await endSession(c)
    return c.json({ ok: true })
  })

  app.get('/api/auth/me', async (c) => {
    const user = await currentUser(c)
    if (!user) return c.json({ error: 'Нужно войти.' }, 401)
    return c.json({ user: publicUser(user) })
  })

  app.post('/api/auth/forgot', async (c) => {
    const body = await readJson(c)
    const email = emailOf(body)
    if (!email) return c.json({ error: 'Укажите почту.' }, 400)
    if (!(await mailReady())) {
      return c.json({ error: 'Восстановление по почте не настроено. Обратитесь к администратору.' }, 503)
    }
    const found = await pool.query<{ id: string; name: string; recent: boolean }>(
      `SELECT u.id, u.name,
              EXISTS (SELECT 1 FROM password_resets r WHERE r.user_id = u.id AND r.created_at > now() - interval '1 minute') AS recent
       FROM users u WHERE email = $1`,
      [email],
    )
    const user = found.rows[0]
    if (user && !user.recent) {
      const token = newToken()
      await pool.query(
        `INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(mins => $3))`,
        [tokenHash(token), user.id, RESET_MINUTES],
      )
      const link = `${appOrigin(c)}/?reset=${token}`
      try {
        await sendLetter(
          email,
          'Восстановление пароля KPI-Drive',
          [
            `${user.name}, здравствуйте!`,
            '',
            'Вы запросили восстановление пароля в KPI-Drive. Чтобы задать новый пароль, откройте ссылку:',
            link,
            '',
            'Ссылка действует 1 час и сработает один раз.',
            'Если вы не запрашивали восстановление, просто проигнорируйте это письмо — пароль останется прежним.',
          ].join('\n'),
        )
      } catch (error) {
        console.error(error)
        await pool.query('DELETE FROM password_resets WHERE token_hash = $1', [tokenHash(token)])
        return c.json({ error: 'Не удалось отправить письмо. Попробуйте позже или обратитесь к администратору.' }, 502)
      }
      await recordAudit({ id: user.id, name: user.name }, 'Запрошено восстановление пароля', [email])
    }
    return c.json({ ok: true })
  })

  app.get('/api/auth/reset', async (c) => {
    const reset = await findReset(c.req.query('token') ?? '')
    if (!reset) return c.json({ error: resetInvalidText() }, 404)
    return c.json({ email: reset.email })
  })

  app.post('/api/auth/reset', async (c) => {
    const body = await readJson(c)
    const token = typeof body?.token === 'string' ? body.token : ''
    const passwordIssue = passwordIssueOf(body?.password)
    if (passwordIssue) return c.json({ error: passwordIssue }, 400)
    const passwordHash = await hashPassword(body?.password as string)
    const client = await pool.connect()
    let user: DbUser | null = null
    try {
      await client.query('BEGIN')
      const found = await client.query<{ user_id: string }>(
        'SELECT user_id FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE',
        [tokenHash(token)],
      )
      const reset = found.rows[0]
      if (!reset) {
        await client.query('ROLLBACK')
        return c.json({ error: resetInvalidText() }, 400)
      }
      const updated = await client.query<DbUser>(
        `UPDATE users SET password_hash = $2, failed_logins = 0, locked_until = NULL WHERE id = $1 RETURNING ${USER_FIELDS}`,
        [reset.user_id, passwordHash],
      )
      await client.query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [reset.user_id])
      await client.query('DELETE FROM sessions WHERE user_id = $1', [reset.user_id])
      await client.query('COMMIT')
      user = updated.rows[0] ?? null
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
    if (!user) return c.json({ error: resetInvalidText() }, 400)
    const account = toAccount(user)
    await recordAudit({ id: account.id, name: account.name }, 'Пароль восстановлен по почте', [account.email])
    await startSession(c, account.id)
    return c.json({ user: publicUser(account) })
  })

  app.get('/api/invitations', async (c) => {
    const actor = await requireAdmin(c)
    if (!actor.user) return c.json({ error: actor.error }, actor.status)
    const found = await pool.query<InviteRow>(
      `SELECT i.*, u.name AS created_by_name FROM invitations i
       LEFT JOIN users u ON u.id = i.created_by
       WHERE i.used_at IS NULL AND i.expires_at > now()
       ORDER BY i.created_at DESC`,
    )
    return c.json({ invitations: found.rows.map(publicInvite) })
  })

  app.post('/api/invitations', async (c) => {
    const actor = await requireAdmin(c)
    if (!actor.user) return c.json({ error: actor.error }, actor.status)
    const body = await readJson(c)
    const email = emailOf(body)
    const rawName = typeof body?.name === 'string' ? body.name.trim() : ''
    const role = body && body.role != null ? body.role : 'user'
    if (!email) return c.json({ error: 'Укажите почту.' }, 400)
    if (rawName.length > 120) return c.json({ error: 'Имя слишком длинное.' }, 400)
    if (!isRole(role)) return c.json({ error: 'Неизвестные права.' }, 400)
    const access = accessOf(body)
    if ('error' in access) return c.json({ error: access.error }, 400)
    const taken = await pool.query('SELECT 1 FROM users WHERE email = $1', [email])
    if (taken.rowCount) return c.json({ error: 'Пользователь с такой почтой уже есть.' }, 409)
    const ownerId = documentOwnerId(actor.user)
    const token = newToken()
    const id = crypto.randomUUID()
    await pool.query('DELETE FROM invitations WHERE email = $1 AND used_at IS NULL', [email])
    const inserted = await pool.query<InviteRow>(
      `INSERT INTO invitations (id, token_hash, email, name, role, employee_id, matrix_ids, team_owner_id, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, now() + make_interval(days => $10))
       RETURNING *, $11::text AS created_by_name`,
      [id, tokenHash(token), email, rawName, role, access.employeeId, JSON.stringify(access.matrixIds), ownerId, actor.user.id, INVITE_DAYS, actor.user.name],
    )
    const link = `${appOrigin(c)}/?invite=${token}`
    let mailed = false
    let mailError = ''
    if (await mailReady()) {
      try {
        await sendLetter(email, 'Приглашение в KPI-Drive', inviteLetter(actor.user.name, rawName, link))
        mailed = true
      } catch (error) {
        console.error(error)
        mailError = mailErrorText(error)
      }
    }
    await recordAudit({ id: actor.user.id, name: actor.user.name }, 'Отправлено приглашение', [
      `${email} — ${ROLE_LABEL[role]}${mailed ? '' : ' (ссылка без письма)'}`,
    ])
    return c.json({ invitation: publicInvite(inserted.rows[0]!), link, mailed, mailError }, 201)
  })

  app.delete('/api/invitations/:id', async (c) => {
    const actor = await requireAdmin(c)
    if (!actor.user) return c.json({ error: actor.error }, actor.status)
    const removed = await pool.query<{ email: string }>(
      'DELETE FROM invitations WHERE id = $1 AND used_at IS NULL RETURNING email',
      [c.req.param('id')],
    )
    const email = removed.rows[0]?.email
    if (!email) return c.json({ error: 'Приглашение не найдено.' }, 404)
    await recordAudit({ id: actor.user.id, name: actor.user.name }, 'Приглашение отозвано', [email])
    return c.json({ ok: true })
  })
}

async function adminExists() {
  const found = await pool.query<{ exists: boolean }>("SELECT EXISTS (SELECT 1 FROM users WHERE role = 'admin') AS exists")
  return Boolean(found.rows[0]?.exists)
}

async function findInvite(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null
  const found = await pool.query<{ email: string; name: string }>(
    'SELECT email, name FROM invitations WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()',
    [tokenHash(token)],
  )
  return found.rows[0] ?? null
}

async function findReset(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null
  const found = await pool.query<{ email: string }>(
    `SELECT u.email FROM password_resets r JOIN users u ON u.id = r.user_id
     WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now()`,
    [tokenHash(token)],
  )
  return found.rows[0] ?? null
}

function publicInvite(row: InviteRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role === 'admin' ? 'admin' : 'user',
    employeeId: row.employee_id,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    createdBy: row.created_by_name ?? '',
  }
}

function inviteLetter(inviter: string, name: string, link: string) {
  return [
    name ? `${name}, здравствуйте!` : 'Здравствуйте!',
    '',
    `${inviter} приглашает вас в KPI-Drive — сервис расчёта коэффициента результативности.`,
    'Чтобы создать учётную запись, откройте ссылку и придумайте пароль:',
    link,
    '',
    `Ссылка действует ${INVITE_DAYS} дней и сработает один раз.`,
  ].join('\n')
}

function lockedText(minutes: number) {
  return `Слишком много неверных паролей. Вход заблокирован на ${minutes} мин. Попробуйте позже или восстановите пароль через «Забыли пароль?».`
}

function resetInvalidText() {
  return 'Ссылка для восстановления недействительна или устарела. Запросите новую.'
}
