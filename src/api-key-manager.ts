// ============================================================
// SQLite-backed API key manager — mirrors api_key_manager.py
// Uses Node 22+ built-in node:sqlite (DatabaseSync)
// ============================================================

import { DatabaseSync } from "node:sqlite";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ApiKeyRecord, ShopInfo, ShopPermission } from "./types.js";

const DEFAULT_API_KEY_DB = path.join("runtime", "sellfox", "api_keys.db");

function nowText(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export class ApiKeyManager {
  private db_path: string;
  private db: DatabaseSync;

  constructor(dbPath?: string) {
    this.db_path = dbPath ?? process.env["SELLFOX_API_KEY_DB"] ?? DEFAULT_API_KEY_DB;
    const dir = path.dirname(this.db_path);
    fs.mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(this.db_path);
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec("PRAGMA busy_timeout=5000");
    this.db.exec("PRAGMA foreign_keys = ON");
    this._initDB();
  }

  private _initDB(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seq INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL DEFAULT '',
        key_value TEXT NOT NULL UNIQUE,
        memo TEXT NOT NULL DEFAULT '',
        is_admin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS key_shop_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_value TEXT NOT NULL,
        shop_id TEXT NOT NULL,
        shop_name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        UNIQUE(key_value, shop_id),
        FOREIGN KEY (key_value) REFERENCES api_keys(key_value) ON DELETE CASCADE
      )
    `);
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_api_keys_key_value ON api_keys(key_value)");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_key_shop_permissions_key ON key_shop_permissions(key_value)");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shop_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id TEXT NOT NULL UNIQUE,
        shop_name TEXT NOT NULL DEFAULT '',
        marketplace_id TEXT NOT NULL DEFAULT '',
        region TEXT NOT NULL DEFAULT '',
        seller_id TEXT NOT NULL DEFAULT '',
        ad_status TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '',
        synced_at TEXT NOT NULL
      )
    `);
  }

  // ---- Key CRUD ----

  addKey(opts?: { seq?: number; name?: string; key_value?: string; memo?: string; is_admin?: number }): string {
    let keyValue = opts?.key_value ?? "";
    if (!keyValue) keyValue = "sk-" + crypto.randomBytes(32).toString("base64url");
    this.db
      .prepare(
        "INSERT INTO api_keys (seq, name, key_value, memo, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(opts?.seq ?? 0, opts?.name ?? "", keyValue, opts?.memo ?? "", opts?.is_admin ?? 0, nowText());
    return keyValue;
  }

  removeKey(keyValue: string): boolean {
    const result = this.db.prepare("DELETE FROM api_keys WHERE key_value = ?").run(keyValue);
    return result.changes > 0;
  }

  listKeys(): Record<string, unknown>[] {
    const rows = this.db.prepare("SELECT * FROM api_keys ORDER BY seq ASC, id ASC").all() as Record<string, unknown>[];
    return rows;
  }

  getKey(keyValue: string): Record<string, unknown> | null {
    const row = this.db.prepare("SELECT * FROM api_keys WHERE key_value = ?").get(keyValue) as Record<string, unknown> | undefined;
    return row ?? null;
  }

  keyExists(keyValue: string): boolean {
    const row = this.db.prepare("SELECT 1 FROM api_keys WHERE key_value = ?").get(keyValue);
    return row !== undefined;
  }

  isAdmin(keyValue: string): boolean {
    const row = this.db.prepare("SELECT is_admin FROM api_keys WHERE key_value = ?").get(keyValue) as Record<string, unknown> | undefined;
    return Boolean(row && row["is_admin"]);
  }

  setAdmin(keyValue: string, isAdmin: boolean): boolean {
    const result = this.db
      .prepare("UPDATE api_keys SET is_admin = ? WHERE key_value = ?")
      .run(isAdmin ? 1 : 0, keyValue);
    return result.changes > 0;
  }

  updateKey(keyValue: string, opts: { seq?: number | undefined; name?: string | undefined; memo?: string | undefined }): boolean {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (opts.seq !== undefined) { sets.push("seq = ?"); params.push(opts.seq); }
    if (opts.name !== undefined) { sets.push("name = ?"); params.push(opts.name); }
    if (opts.memo !== undefined) { sets.push("memo = ?"); params.push(opts.memo); }
    if (sets.length === 0) return false;
    params.push(keyValue);
    const result = this.db.prepare(`UPDATE api_keys SET ${sets.join(", ")} WHERE key_value = ?`).run(...params as import("node:sqlite").SQLInputValue[]);
    return result.changes > 0;
  }

  generateKeyValue(): string {
    return "sk-" + crypto.randomBytes(32).toString("base64url");
  }

  // ---- Shop Permissions ----

  getAuthorizedShops(keyValue: string): ShopPermission[] {
    const rows = this.db
      .prepare("SELECT shop_id, shop_name FROM key_shop_permissions WHERE key_value = ? ORDER BY shop_id")
      .all(keyValue) as Record<string, unknown>[];
    return rows.map((r) => ({ shop_id: r["shop_id"] as string, shop_name: r["shop_name"] as string }));
  }

  getAuthorizedShopIds(keyValue: string): Set<string> {
    const shops = this.getAuthorizedShops(keyValue);
    return new Set(shops.map((s) => s.shop_id));
  }

  setShopPermissions(keyValue: string, shops: { shop_id: string; shop_name?: string }[]): void {
    const now = nowText();
    const db = this.db;
    db.prepare("DELETE FROM key_shop_permissions WHERE key_value = ?").run(keyValue);
    const insert = db.prepare(
      "INSERT INTO key_shop_permissions (key_value, shop_id, shop_name, created_at) VALUES (?, ?, ?, ?)",
    );
    for (const s of shops) {
      insert.run(keyValue, s.shop_id, s.shop_name ?? "", now);
    }
  }

  // ---- Shop Cache ----

  syncShops(shops: Record<string, unknown>[]): number {
    const now = nowText();
    const db = this.db;
    db.prepare("DELETE FROM shop_cache").run();
    const insert = db.prepare(
      `INSERT INTO shop_cache (shop_id, shop_name, marketplace_id, region, seller_id, ad_status, status, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const s of shops) {
      insert.run(
        String(s["shopId"] ?? s["shop_id"] ?? ""),
        String(s["shopName"] ?? s["shop_name"] ?? ""),
        String(s["marketplaceId"] ?? s["marketplace_id"] ?? ""),
        String(s["region"] ?? ""),
        String(s["sellerId"] ?? s["seller_id"] ?? ""),
        String(s["adStatus"] ?? s["ad_status"] ?? ""),
        String(s["status"] ?? ""),
        now,
      );
    }
    const row = db.prepare("SELECT COUNT(*) as cnt FROM shop_cache").get() as Record<string, unknown>;
    return (row["cnt"] as number) ?? 0;
  }

  getCachedShops(): Record<string, unknown>[] {
    const rows = this.db
      .prepare("SELECT shop_id, shop_name, marketplace_id, region, seller_id, ad_status, status FROM shop_cache ORDER BY shop_id")
      .all() as Record<string, unknown>[];
    return rows;
  }

  getShopSyncInfo(): { count: number; last_sync: string | null } {
    const row = this.db
      .prepare("SELECT COUNT(*) as cnt, MAX(synced_at) as last_sync FROM shop_cache")
      .get() as Record<string, unknown>;
    return { count: (row["cnt"] as number) ?? 0, last_sync: (row["last_sync"] as string) ?? null };
  }

  // ---- Stats ----

  stats(): { total: number; admin_count: number; with_permissions: number } {
    const total = (this.db.prepare("SELECT COUNT(*) as cnt FROM api_keys").get() as Record<string, unknown>)["cnt"] as number;
    const adminCount = (this.db.prepare("SELECT COUNT(*) as cnt FROM api_keys WHERE is_admin = 1").get() as Record<string, unknown>)["cnt"] as number;
    const withPerms = (this.db.prepare(
      `SELECT COUNT(DISTINCT k.key_value) as cnt FROM api_keys k
       INNER JOIN key_shop_permissions p ON k.key_value = p.key_value`,
    ).get() as Record<string, unknown>)["cnt"] as number;
    return { total, admin_count: adminCount, with_permissions: withPerms };
  }

  close(): void {
    this.db.close();
  }
}
