// Shared PostgreSQL pool — replaces node:sqlite DatabaseSync
import pg from "pg";

const { Pool } = pg;

let _pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (_pool) return _pool;
  const connectionString = process.env["DATABASE_URL"]?.trim() || undefined;
  _pool = new Pool({
    connectionString,
    host: process.env["PGHOST"] ?? "127.0.0.1",
    port: parseInt(process.env["PGPORT"] ?? "5432", 10),
    database: process.env["PGDATABASE"] ?? "sellfox",
    user: process.env["PGUSER"] ?? "sellfox",
    password: process.env["PGPASSWORD"] ?? "",
    ssl: process.env["PGSSLMODE"] === "require" ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });
  return _pool;
}

export async function initSchema(pool?: pg.Pool): Promise<void> {
  const db = pool ?? getPool();
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS credentials (
        id SERIAL PRIMARY KEY,
        client_id VARCHAR(255) NOT NULL UNIQUE,
        client_secret VARCHAR(255) NOT NULL,
        access_token TEXT,
        expires_at BIGINT,
        last_used_at DOUBLE PRECISION,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_credentials_enabled_last_used
      ON credentials(enabled, last_used_at)
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        seq INTEGER NOT NULL DEFAULT 0,
        name VARCHAR(255) NOT NULL DEFAULT '',
        key_value VARCHAR(255) NOT NULL UNIQUE,
        memo TEXT NOT NULL DEFAULT '',
        is_admin BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS key_shop_permissions (
        id SERIAL PRIMARY KEY,
        key_value VARCHAR(255) NOT NULL,
        shop_id VARCHAR(255) NOT NULL,
        shop_name VARCHAR(255) NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(key_value, shop_id),
        FOREIGN KEY (key_value) REFERENCES api_keys(key_value) ON DELETE CASCADE
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_api_keys_key_value ON api_keys(key_value)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_key_shop_permissions_key ON key_shop_permissions(key_value)`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS shop_cache (
        id SERIAL PRIMARY KEY,
        shop_id VARCHAR(255) NOT NULL UNIQUE,
        shop_name VARCHAR(255) NOT NULL DEFAULT '',
        marketplace_id VARCHAR(64) NOT NULL DEFAULT '',
        region VARCHAR(64) NOT NULL DEFAULT '',
        seller_id VARCHAR(64) NOT NULL DEFAULT '',
        ad_status VARCHAR(32) NOT NULL DEFAULT '',
        status VARCHAR(32) NOT NULL DEFAULT '',
        synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } catch (err) {
    console.warn("[initSchema] 建表失败（可能无 CREATE 权限，假设表已存在）: %s", String(err));
  }
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
