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

    ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
    ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';
    UPDATE users SET role = 'admin' WHERE role IS NULL OR role NOT IN ('admin', 'user');
    ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id text;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS matrix_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS team_owner_id uuid;

    CREATE TABLE IF NOT EXISTS mail_settings (
      id int PRIMARY KEY,
      host text NOT NULL DEFAULT '',
      port int NOT NULL DEFAULT 587,
      secure boolean NOT NULL DEFAULT false,
      username text NOT NULL DEFAULT '',
      password text NOT NULL DEFAULT '',
      from_address text NOT NULL DEFAULT ''
    );
    INSERT INTO mail_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

    ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins int NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until timestamptz;
    ALTER TABLE teams ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
    ALTER TABLE teams ADD COLUMN IF NOT EXISTS updated_by_name text NOT NULL DEFAULT '';

    CREATE TABLE IF NOT EXISTS invitations (
      id uuid PRIMARY KEY,
      token_hash text NOT NULL UNIQUE,
      email text NOT NULL,
      name text NOT NULL DEFAULT '',
      role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
      employee_id text,
      matrix_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      team_owner_id uuid REFERENCES users(id) ON DELETE CASCADE,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id bigserial PRIMARY KEY,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      user_name text NOT NULL DEFAULT '',
      action text NOT NULL,
      details jsonb NOT NULL DEFAULT '[]'::jsonb,
      entry_key text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
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
