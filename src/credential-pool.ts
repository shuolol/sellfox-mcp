// ============================================================
// SQLite-backed credential pool — mirrors credential_pool.py
// Uses Node 22+ built-in node:sqlite (DatabaseSync)
// ============================================================

import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";

const DEFAULT_CREDENTIAL_DB = path.join("runtime", "sellfox", "credentials.db");

export interface CredentialRecord {
  id: number;
  client_id: string;
  client_secret: string;
  access_token: string | null;
  expires_at: number | null;
  last_used_at: number | null;
  enabled: boolean;
  created_at: string;
}

function nowText(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export class CredentialPool {
  private db_path: string;
  private db: DatabaseSync;

  constructor(dbPath?: string) {
    this.db_path = dbPath ?? process.env["SELLFOX_CREDENTIAL_DB"] ?? DEFAULT_CREDENTIAL_DB;
    const dir = path.dirname(this.db_path);
    fs.mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(this.db_path);
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec("PRAGMA busy_timeout=5000");
    this._initDB();
  }

  private _initDB(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS credentials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT NOT NULL UNIQUE,
        client_secret TEXT NOT NULL,
        access_token TEXT,
        expires_at INTEGER,
        last_used_at REAL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_credentials_enabled_last_used
      ON credentials(enabled, last_used_at)
    `);
  }

  add(client_id: string, client_secret: string): boolean {
    const existing = this.db.prepare("SELECT id FROM credentials WHERE client_id = ?").get(client_id);
    if (existing) return false;
    this.db.prepare("INSERT INTO credentials (client_id, client_secret, created_at) VALUES (?, ?, ?)").run(
      client_id,
      client_secret,
      nowText(),
    );
    return true;
  }

  remove(client_id: string): boolean {
    const result = this.db.prepare("DELETE FROM credentials WHERE client_id = ?").run(client_id);
    return result.changes > 0;
  }

  setEnabled(client_id: string, enabled: boolean): boolean {
    const result = this.db
      .prepare("UPDATE credentials SET enabled = ? WHERE client_id = ?")
      .run(enabled ? 1 : 0, client_id);
    return result.changes > 0;
  }

  listAll(): CredentialRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM credentials ORDER BY enabled DESC, last_used_at ASC")
      .all() as Record<string, unknown>[];
    return rows.map(rowToRecord);
  }

  acquire(): [string, string] {
    const row = this.db
      .prepare("SELECT * FROM credentials WHERE enabled = 1 ORDER BY last_used_at ASC LIMIT 1")
      .get() as Record<string, unknown> | undefined;
    if (!row) {
      const total = (this.db.prepare("SELECT COUNT(*) as cnt FROM credentials").get() as Record<string, unknown>)["cnt"] as number;
      if (total > 0) throw new Error(`凭据池中有 ${total} 个凭据但全部被禁用，请至少启用一个`);
      throw new Error("凭据池为空，请先通过 CLI 添加凭据");
    }
    this.db.prepare("UPDATE credentials SET last_used_at = ? WHERE id = ?").run(Date.now() / 1000, row["id"] as number);
    return [row["client_id"] as string, row["client_secret"] as string];
  }

  acquireWithToken(): [string, string, string | null] {
    const row = this.db
      .prepare(
        `SELECT * FROM credentials
         WHERE enabled = 1
         ORDER BY last_used_at IS NULL DESC, last_used_at ASC
         LIMIT 1`,
      )
      .get() as Record<string, unknown> | undefined;
    if (!row) {
      const total = (this.db.prepare("SELECT COUNT(*) as cnt FROM credentials").get() as Record<string, unknown>)["cnt"] as number;
      if (total > 0) throw new Error(`凭据池中有 ${total} 个凭据但全部被禁用，请至少启用一个`);
      throw new Error("凭据池为空，请先通过 CLI 添加凭据");
    }
    this.db.prepare("UPDATE credentials SET last_used_at = ? WHERE id = ?").run(Date.now() / 1000, row["id"] as number);
    return [row["client_id"] as string, row["client_secret"] as string, (row["access_token"] as string) || null];
  }

  getCachedToken(client_id: string): [string, number] | null {
    const row = this.db
      .prepare("SELECT access_token, expires_at FROM credentials WHERE client_id = ?")
      .get(client_id) as Record<string, unknown> | undefined;
    if (!row || !row["access_token"] || !row["expires_at"]) return null;
    if ((row["expires_at"] as number) <= Math.floor(Date.now() / 1000) + 60) return null;
    return [row["access_token"] as string, row["expires_at"] as number];
  }

  updateToken(client_id: string, access_token: string, expires_at: number): void {
    this.db
      .prepare("UPDATE credentials SET access_token = ?, expires_at = ? WHERE client_id = ?")
      .run(access_token, expires_at, client_id);
  }

  clearToken(client_id: string): void {
    this.db
      .prepare("UPDATE credentials SET access_token = NULL, expires_at = NULL WHERE client_id = ?")
      .run(client_id);
  }

  stats(): { total: number; enabled: number; with_valid_token: number } {
    const total = (this.db.prepare("SELECT COUNT(*) as cnt FROM credentials").get() as Record<string, unknown>)["cnt"] as number;
    const enabled = (this.db.prepare("SELECT COUNT(*) as cnt FROM credentials WHERE enabled = 1").get() as Record<string, unknown>)["cnt"] as number;
    const withToken = (this.db.prepare(
      "SELECT COUNT(*) as cnt FROM credentials WHERE enabled = 1 AND access_token IS NOT NULL AND expires_at > ?",
    ).get(Math.floor(Date.now() / 1000) + 60) as Record<string, unknown>)["cnt"] as number;
    return { total, enabled, with_valid_token: withToken };
  }

  close(): void {
    this.db.close();
  }
}

function rowToRecord(row: Record<string, unknown>): CredentialRecord {
  return {
    id: row["id"] as number,
    client_id: row["client_id"] as string,
    client_secret: row["client_secret"] as string,
    access_token: (row["access_token"] as string) ?? null,
    expires_at: (row["expires_at"] as number) ?? null,
    last_used_at: (row["last_used_at"] as number) ?? null,
    enabled: Boolean(row["enabled"]),
    created_at: row["created_at"] as string,
  };
}
