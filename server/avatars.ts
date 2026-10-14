import type { Hono } from 'hono'
import { documentOwnerId } from '../src/lib/access.ts'
import { imageMime } from '../src/lib/avatar-file.ts'
import { recordAudit } from './audit.ts'
import { pool } from './db.ts'
import { currentUser, findAccount } from './session.ts'

export const MAX_AVATAR_BYTES = 512 * 1024

export function registerAvatarRoutes(app: Hono) {
  app.get('/api/avatars', async (c) => {
    const user = await currentUser(c)
    if (!user) return c.json({ error: 'Нужно войти.' }, 401)
    const ownerId = documentOwnerId(user)
    const found = await pool.query<{ user_id: string; employee_id: string | null; version: string }>(
      `SELECT a.user_id, u.employee_id, (extract(epoch FROM a.updated_at) * 1000)::bigint::text AS version
       FROM avatars a JOIN users u ON u.id = a.user_id
       WHERE u.id = $1 OR ($2::uuid IS NOT NULL AND (u.id = $2 OR u.team_owner_id = $2))`,
      [user.id, ownerId],
    )
    c.header('Cache-Control', 'no-store')
    return c.json({
      avatars: found.rows.map((row) => ({ userId: row.user_id, employeeId: row.employee_id, version: row.version })),
    })
  })

  app.get('/api/avatars/:userId', async (c) => {
    const user = await currentUser(c)
    if (!user) return c.json({ error: 'Нужно войти.' }, 401)
    const id = c.req.param('userId')
    if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'Фото не найдено.' }, 404)
    const found = await pool.query<{ mime: string; data: Buffer }>('SELECT mime, data FROM avatars WHERE user_id = $1', [id])
    const row = found.rows[0]
    if (!row) return c.json({ error: 'Фото не найдено.' }, 404)
    return c.body(new Uint8Array(row.data), 200, {
      'Content-Type': row.mime,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    })
  })

  app.put('/api/users/:id/avatar', async (c) => {
    const actor = await currentUser(c)
    if (!actor) return c.json({ error: 'Нужно войти.' }, 401)
    const id = c.req.param('id')
    if (actor.role !== 'admin' && actor.id !== id) return c.json({ error: 'Менять можно только своё фото.' }, 403)
    const target = actor.id === id ? actor : await findAccount(id)
    if (!target) return c.json({ error: 'Пользователь не найден.' }, 404)
    if (Number(c.req.header('content-length') ?? 0) > MAX_AVATAR_BYTES) return tooLarge(c)
    const data = new Uint8Array(await c.req.arrayBuffer())
    if (data.byteLength > MAX_AVATAR_BYTES) return tooLarge(c)
    const mime = imageMime(data)
    if (!mime) return c.json({ error: 'Нужна картинка JPEG, PNG или WebP.' }, 400)
    const saved = await pool.query<{ version: string }>(
      `INSERT INTO avatars (user_id, mime, data, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, updated_at = now()
       RETURNING (extract(epoch FROM updated_at) * 1000)::bigint::text AS version`,
      [id, mime, Buffer.from(data)],
    )
    await recordAudit({ id: actor.id, name: actor.name }, 'Загружено фото', [`${target.name} (${target.email})`])
    return c.json({ userId: id, employeeId: target.employeeId, version: saved.rows[0]?.version ?? '' })
  })

  app.delete('/api/users/:id/avatar', async (c) => {
    const actor = await currentUser(c)
    if (!actor) return c.json({ error: 'Нужно войти.' }, 401)
    const id = c.req.param('id')
    if (actor.role !== 'admin' && actor.id !== id) return c.json({ error: 'Менять можно только своё фото.' }, 403)
    const target = actor.id === id ? actor : await findAccount(id)
    if (!target) return c.json({ error: 'Пользователь не найден.' }, 404)
    const removed = await pool.query('DELETE FROM avatars WHERE user_id = $1', [id])
    if (removed.rowCount) {
      await recordAudit({ id: actor.id, name: actor.name }, 'Удалено фото', [`${target.name} (${target.email})`])
    }
    return c.json({ ok: true })
  })
}

function tooLarge(c: { json: (body: unknown, status: 413) => Response }) {
  return c.json({ error: 'Фото слишком большое. Выберите файл поменьше.' }, 413)
}
