import pg from 'pg'

export const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kpi:kpi@127.0.0.1:5432/kpi_drive'

export const pool = new pg.Pool({ connectionString: databaseUrl })

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY,
      email text NOT NULL UNIQUE,
      name text NOT NULL,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teams (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      document jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `)
}
