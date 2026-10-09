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

    ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'admin';
    UPDATE users SET role = 'admin' WHERE role IS NULL OR role NOT IN ('admin', 'user');
    ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id text;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS matrix_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS team_owner_id uuid;
  `)
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `)
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE users
        ADD CONSTRAINT users_team_owner_fk
        FOREIGN KEY (team_owner_id) REFERENCES users(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `)
}
