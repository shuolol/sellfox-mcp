// PostgreSQL-backed credential pool — replaces node:sqlite DatabaseSync
import type pg from "pg";
import { getPool } from "./db.js";

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

export class CredentialPool {
  private db: pg.Pool;

  constructor(db?: pg.Pool) {
    this.db = db ?? getPool();
  }

  async add(client_id: string, client_secret: string): Promise<boolean> {
    const existing = await this.db.query("SELECT id FROM credentials WHERE client_id = $1", [client_id]);
    if (existing.rows.length > 0) return false;
    await this.db.query("INSERT INTO credentials (client_id, client_secret) VALUES ($1, $2)", [
      client_id,
      client_secret,
    ]);
    return true;
  }

  async remove(client_id: string): Promise<boolean> {
    const result = await this.db.query("DELETE FROM credentials WHERE client_id = $1", [client_id]);
    return (result.rowCount ?? 0) > 0;
  }

  async setEnabled(client_id: string, enabled: boolean): Promise<boolean> {
    const result = await this.db.query("UPDATE credentials SET enabled = $1 WHERE client_id = $2", [
      enabled,
      client_id,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  async listAll(): Promise<CredentialRecord[]> {
    const result = await this.db.query(
      "SELECT * FROM credentials ORDER BY enabled DESC, last_used_at ASC NULLS FIRST",
    );
    return result.rows.map(rowToRecord);
  }

  async acquire(): Promise<[string, string]> {
    const result = await this.db.query(
      "SELECT * FROM credentials WHERE enabled = TRUE ORDER BY last_used_at ASC NULLS FIRST LIMIT 1",
    );
    if (result.rows.length === 0) {
      const cnt = await this.db.query("SELECT COUNT(*) as cnt FROM credentials");
      const total = Number(cnt.rows[0]?.cnt ?? 0);
      if (total > 0) throw new Error(`凭据池中有 ${total} 个凭据但全部被禁用，请至少启用一个`);
      throw new Error("凭据池为空，请先通过 CLI 添加凭据");
    }
    const row = result.rows[0]!;
    await this.db.query("UPDATE credentials SET last_used_at = $1 WHERE id = $2", [
      Date.now() / 1000,
      row["id"],
    ]);
    return [row["client_id"], row["client_secret"]];
  }

  async acquireWithToken(): Promise<[string, string, string | null]> {
    const result = await this.db.query(
      `SELECT * FROM credentials
       WHERE enabled = TRUE
       ORDER BY last_used_at IS NULL DESC, last_used_at ASC NULLS FIRST
       LIMIT 1`,
    );
    if (result.rows.length === 0) {
      const cnt = await this.db.query("SELECT COUNT(*) as cnt FROM credentials");
      const total = Number(cnt.rows[0]?.cnt ?? 0);
      if (total > 0) throw new Error(`凭据池中有 ${total} 个凭据但全部被禁用，请至少启用一个`);
      throw new Error("凭据池为空，请先通过 CLI 添加凭据");
    }
    const row = result.rows[0]!;
    await this.db.query("UPDATE credentials SET last_used_at = $1 WHERE id = $2", [
      Date.now() / 1000,
      row["id"],
    ]);
    return [row["client_id"], row["client_secret"], (row["access_token"] as string) || null];
  }

  async getCachedToken(client_id: string): Promise<[string, number] | null> {
    const result = await this.db.query(
      "SELECT access_token, expires_at FROM credentials WHERE client_id = $1",
      [client_id],
    );
    const row = result.rows[0];
    if (!row || !row["access_token"] || !row["expires_at"]) return null;
    if (Number(row["expires_at"]) <= Math.floor(Date.now() / 1000) + 60) return null;
    return [row["access_token"] as string, Number(row["expires_at"])];
  }

  async updateToken(client_id: string, access_token: string, expires_at: number): Promise<void> {
    await this.db.query("UPDATE credentials SET access_token = $1, expires_at = $2 WHERE client_id = $3", [
      access_token,
      expires_at,
      client_id,
    ]);
  }

  async clearToken(client_id: string): Promise<void> {
    await this.db.query(
      "UPDATE credentials SET access_token = NULL, expires_at = NULL WHERE client_id = $1",
      [client_id],
    );
  }

  async stats(): Promise<{ total: number; enabled: number; with_valid_token: number }> {
    const total = Number(
      (await this.db.query("SELECT COUNT(*) as cnt FROM credentials")).rows[0]?.cnt ?? 0,
    );
    const enabled = Number(
      (await this.db.query("SELECT COUNT(*) as cnt FROM credentials WHERE enabled = TRUE")).rows[0]
        ?.cnt ?? 0,
    );
    const withToken = Number(
      (
        await this.db.query(
          "SELECT COUNT(*) as cnt FROM credentials WHERE enabled = TRUE AND access_token IS NOT NULL AND expires_at > $1",
          [Math.floor(Date.now() / 1000) + 60],
        )
      ).rows[0]?.cnt ?? 0,
    );
    return { total, enabled, with_valid_token: withToken };
  }

  async close(): Promise<void> {
    // Pool is shared, don't end it here
  }
}

function rowToRecord(row: Record<string, unknown>): CredentialRecord {
  return {
    id: Number(row["id"]),
    client_id: String(row["client_id"] ?? ""),
    client_secret: String(row["client_secret"] ?? ""),
    access_token: row["access_token"] ? String(row["access_token"]) : null,
    expires_at: row["expires_at"] ? Number(row["expires_at"]) : null,
    last_used_at: row["last_used_at"] ? Number(row["last_used_at"]) : null,
    enabled: Boolean(row["enabled"]),
    created_at: String(row["created_at"] ?? ""),
  };
}
