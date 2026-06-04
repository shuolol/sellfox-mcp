// PostgreSQL-backed API key manager — replaces node:sqlite DatabaseSync
import * as crypto from "node:crypto";
import type pg from "pg";
import { getPool } from "./db.js";
import type { ShopPermission } from "./types.js";

export class ApiKeyManager {
  private db: pg.Pool;

  constructor(db?: pg.Pool) {
    this.db = db ?? getPool();
  }

  // ---- Key CRUD ----

  async addKey(opts?: {
    seq?: number;
    name?: string;
    key_value?: string;
    memo?: string;
    is_admin?: boolean;
  }): Promise<string> {
    let keyValue = opts?.key_value ?? "";
    if (!keyValue) keyValue = "sk-" + crypto.randomBytes(32).toString("base64url");
    await this.db.query(
      "INSERT INTO api_keys (seq, name, key_value, memo, is_admin) VALUES ($1, $2, $3, $4, $5)",
      [opts?.seq ?? 0, opts?.name ?? "", keyValue, opts?.memo ?? "", opts?.is_admin ?? false],
    );
    return keyValue;
  }

  async removeKey(keyValue: string): Promise<boolean> {
    const result = await this.db.query("DELETE FROM api_keys WHERE key_value = $1", [keyValue]);
    return (result.rowCount ?? 0) > 0;
  }

  async listKeys(): Promise<Record<string, unknown>[]> {
    const result = await this.db.query("SELECT * FROM api_keys ORDER BY seq ASC, id ASC");
    return result.rows;
  }

  async getKey(keyValue: string): Promise<Record<string, unknown> | null> {
    const result = await this.db.query("SELECT * FROM api_keys WHERE key_value = $1", [keyValue]);
    return result.rows[0] ?? null;
  }

  async keyExists(keyValue: string): Promise<boolean> {
    const result = await this.db.query("SELECT 1 FROM api_keys WHERE key_value = $1", [keyValue]);
    return (result.rowCount ?? 0) > 0;
  }

  async isAdmin(keyValue: string): Promise<boolean> {
    const result = await this.db.query("SELECT is_admin FROM api_keys WHERE key_value = $1", [keyValue]);
    return Boolean(result.rows[0]?.["is_admin"]);
  }

  async setAdmin(keyValue: string, isAdmin: boolean): Promise<boolean> {
    const result = await this.db.query("UPDATE api_keys SET is_admin = $1 WHERE key_value = $2", [
      isAdmin,
      keyValue,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  async updateKey(
    keyValue: string,
    opts: { seq?: number | undefined; name?: string | undefined; memo?: string | undefined },
  ): Promise<boolean> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (opts.seq !== undefined) {
      sets.push(`seq = $${idx++}`);
      params.push(opts.seq);
    }
    if (opts.name !== undefined) {
      sets.push(`name = $${idx++}`);
      params.push(opts.name);
    }
    if (opts.memo !== undefined) {
      sets.push(`memo = $${idx++}`);
      params.push(opts.memo);
    }
    if (sets.length === 0) return false;
    params.push(keyValue);
    const result = await this.db.query(
      `UPDATE api_keys SET ${sets.join(", ")} WHERE key_value = $${idx}`,
      params,
    );
    return (result.rowCount ?? 0) > 0;
  }

  generateKeyValue(): string {
    return "sk-" + crypto.randomBytes(32).toString("base64url");
  }

  // ---- Shop Permissions ----

  async getAuthorizedShops(keyValue: string): Promise<ShopPermission[]> {
    const result = await this.db.query(
      "SELECT shop_id, shop_name FROM key_shop_permissions WHERE key_value = $1 ORDER BY shop_id",
      [keyValue],
    );
    return result.rows.map((r) => ({
      shop_id: String(r["shop_id"] ?? ""),
      shop_name: String(r["shop_name"] ?? ""),
    }));
  }

  async getAuthorizedShopIds(keyValue: string): Promise<Set<string>> {
    const shops = await this.getAuthorizedShops(keyValue);
    return new Set(shops.map((s) => s.shop_id));
  }

  async setShopPermissions(
    keyValue: string,
    shops: { shop_id: string; shop_name?: string }[],
  ): Promise<void> {
    await this.db.query("DELETE FROM key_shop_permissions WHERE key_value = $1", [keyValue]);
    if (shops.length === 0) return;
    const values: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    for (const s of shops) {
      values.push(`($${idx}, $${idx + 1}, $${idx + 2})`);
      params.push(keyValue, s.shop_id, s.shop_name ?? "");
      idx += 3;
    }
    await this.db.query(
      `INSERT INTO key_shop_permissions (key_value, shop_id, shop_name) VALUES ${values.join(", ")}`,
      params,
    );
  }

  // ---- Shop Cache ----

  async syncShops(shops: Record<string, unknown>[]): Promise<number> {
    await this.db.query("DELETE FROM shop_cache");
    if (shops.length === 0) return 0;
    const values: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    for (const s of shops) {
      values.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6})`);
      params.push(
        String(s["shopId"] ?? s["shop_id"] ?? ""),
        String(s["shopName"] ?? s["shop_name"] ?? ""),
        String(s["marketplaceId"] ?? s["marketplace_id"] ?? ""),
        String(s["region"] ?? ""),
        String(s["sellerId"] ?? s["seller_id"] ?? ""),
        String(s["adStatus"] ?? s["ad_status"] ?? ""),
        String(s["status"] ?? ""),
      );
      idx += 7;
    }
    await this.db.query(
      `INSERT INTO shop_cache (shop_id, shop_name, marketplace_id, region, seller_id, ad_status, status)
       VALUES ${values.join(", ")}`,
      params,
    );
    const result = await this.db.query("SELECT COUNT(*) as cnt FROM shop_cache");
    return Number(result.rows[0]?.cnt ?? 0);
  }

  async getCachedShops(): Promise<Record<string, unknown>[]> {
    const result = await this.db.query(
      "SELECT shop_id, shop_name, marketplace_id, region, seller_id, ad_status, status FROM shop_cache ORDER BY shop_id",
    );
    return result.rows;
  }

  async getShopSyncInfo(): Promise<{ count: number; last_sync: string | null }> {
    const result = await this.db.query(
      "SELECT COUNT(*) as cnt, MAX(synced_at) as last_sync FROM shop_cache",
    );
    const row = result.rows[0];
    return {
      count: Number(row?.["cnt"] ?? 0),
      last_sync: row?.["last_sync"] ? String(row["last_sync"]) : null,
    };
  }

  // ---- Stats ----

  async stats(): Promise<{ total: number; admin_count: number; with_permissions: number }> {
    const total = Number(
      (await this.db.query("SELECT COUNT(*) as cnt FROM api_keys")).rows[0]?.cnt ?? 0,
    );
    const adminCount = Number(
      (await this.db.query("SELECT COUNT(*) as cnt FROM api_keys WHERE is_admin = TRUE")).rows[0]
        ?.cnt ?? 0,
    );
    const withPerms = Number(
      (
        await this.db.query(
          `SELECT COUNT(DISTINCT k.key_value) as cnt FROM api_keys k
           INNER JOIN key_shop_permissions p ON k.key_value = p.key_value`,
        )
      ).rows[0]?.cnt ?? 0,
    );
    return { total, admin_count: adminCount, with_permissions: withPerms };
  }

  async close(): Promise<void> {
    // Pool is shared, don't end it here
  }
}
