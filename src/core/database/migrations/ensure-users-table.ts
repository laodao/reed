/**
 * 确保 users 表存在
 * @module core/database/migrations/ensure-users-table
 * @description 兼容 SQLite + PostgreSQL 的最小可用 DDL；幂等。
 */

import type { DataSource } from 'typeorm'

const SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER,
  last_login_at INTEGER
);
`

const PG_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id varchar PRIMARY KEY,
  email varchar NOT NULL,
  display_name varchar,
  password_hash varchar,
  role varchar NOT NULL DEFAULT 'user',
  is_active integer NOT NULL DEFAULT 1,
  created_at bigint,
  last_login_at bigint
);
`

export async function ensureUsersTable(ds: DataSource): Promise<void> {
  const isSqlite =
    ds.options.type === 'better-sqlite3' || ds.options.type === 'sqlite'
  const ddl = isSqlite ? SQLITE_DDL : PG_DDL
  // 拆分多个语句逐条执行
  for (const stmt of ddl.split(';').map(s => s.trim()).filter(Boolean)) {
    await ds.query(stmt)
  }
  // unique index on email
  if (isSqlite) {
    await ds.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)',
    )
  } else {
    await ds.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email)',
    )
  }
}
