// ============================================================
// Token-based HTTP auth helpers — mirrors auth.py
// ============================================================

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AuthMatch, AuthTokenRecord, BearerAuthConfig, TokensFilePayload } from "./types.js";
import { SellfoxConfigError } from "./errors.js";

export const TOKENS_FILE_VERSION = 1;

function nowISO(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "");
}

export function generateMemberToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function maskToken(token: string): string {
  if (token.length <= 10) return "*".repeat(token.length);
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export function buildTokensPayload(records: AuthTokenRecord[]): TokensFilePayload {
  return {
    version: TOKENS_FILE_VERSION,
    tokens: records.map((r) => ({
      id: r.token_id,
      description: r.description,
      token: r.token,
      status: r.status,
      created_at: r.created_at,
      updated_at: r.updated_at,
      revoked_at: r.revoked_at,
    })),
  };
}

function parseRecord(raw: Record<string, unknown>, index: number): AuthTokenRecord {
  const token_id = String(raw["id"] || `token-${index + 1}`).trim();
  const token = String(raw["token"] ?? "").trim();
  const description = String(raw["description"] ?? "").trim();
  const status = (String(raw["status"] ?? "").trim().toLowerCase() || "active");
  const created_at = String(raw["created_at"] ?? "").trim() || nowISO();
  const updated_at = String(raw["updated_at"] ?? "").trim() || created_at;
  const revoked_at = (String(raw["revoked_at"] ?? "").trim() || null) as string | null;
  const enabled = raw["enabled"];
  const finalStatus = enabled === false && status === "active" ? "disabled" : status;
  return { token_id, token, description, status: finalStatus, created_at, updated_at, revoked_at: revoked_at ?? null };
}

export function loadTokensFile(tokensFile: string): AuthTokenRecord[] {
  const resolved = path.resolve(tokensFile.replace(/^~/, () => process.env["HOME"] ?? ""));
  if (!fs.existsSync(resolved)) {
    throw new SellfoxConfigError(`令牌文件不存在: ${resolved}`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  } catch (err) {
    throw new SellfoxConfigError(`令牌文件不是合法 JSON: ${resolved}`);
  }
  const rawTokens = (payload as Record<string, unknown>)["tokens"];
  if (!Array.isArray(rawTokens)) {
    throw new SellfoxConfigError(`令牌文件缺少 tokens 数组: ${resolved}`);
  }
  return rawTokens.map((item, idx) => parseRecord((item ?? {}) as Record<string, unknown>, idx));
}

export function loadBearerAuthConfig(opts?: {
  bootstrap_token?: string;
  tokens_file?: string;
}): BearerAuthConfig {
  const normalizedBootstrap = (opts?.bootstrap_token ?? "").trim() || null;
  const normalizedFile = (opts?.tokens_file ?? "").trim();
  let records: AuthTokenRecord[] = [];
  let filePath: string | null = null;

  if (normalizedFile) {
    filePath = path.resolve(normalizedFile.replace(/^~/, () => process.env["HOME"] ?? ""));
    if (fs.existsSync(filePath)) {
      records = loadTokensFile(filePath);
    } else if (!normalizedBootstrap) {
      throw new SellfoxConfigError(`令牌文件不存在: ${filePath}`);
    }
  }

  const config: BearerAuthConfig = {
    bootstrap_token: normalizedBootstrap,
    tokens_file: filePath,
    records,
  };

  if (!hasAnyAuth(config)) {
    throw new SellfoxConfigError("HTTP MCP 至少需要一个单令牌或一个有效的多人令牌文件。");
  }
  return config;
}

// ---- Auth logic ----

export function hasAnyAuth(config: BearerAuthConfig): boolean {
  return Boolean(config.bootstrap_token) || config.records.some((r) => r.status === "active" && r.token);
}

export function authModes(config: BearerAuthConfig): string[] {
  const modes: string[] = [];
  if (config.bootstrap_token) modes.push("single");
  if (config.records.some((r) => r.status === "active" && r.token)) modes.push("multi");
  return modes;
}

export function authSummary(config: BearerAuthConfig): Record<string, unknown> {
  return {
    modes: authModes(config),
    bootstrap_enabled: Boolean(config.bootstrap_token),
    tokens_file: config.tokens_file,
    active_member_tokens: config.records.filter((r) => r.status === "active" && r.token).length,
  };
}

export function authenticateHeader(config: BearerAuthConfig, authorization: string): AuthMatch | null {
  const normalized = authorization.trim();
  if (!normalized.startsWith("Bearer ")) return null;
  const token = normalized.slice("Bearer ".length).trim();
  if (!token) return null;

  const tokenBuf = Buffer.from(token);
  if (config.bootstrap_token) {
    const bt = Buffer.from(config.bootstrap_token);
    if (bt.length === tokenBuf.length && crypto.timingSafeEqual(tokenBuf, bt)) {
      return { mode: "single", token_id: "bootstrap", description: "bootstrap" };
    }
  }
  for (const record of config.records) {
    if (record.status === "active" && record.token) {
      const rt = Buffer.from(record.token);
      if (rt.length === tokenBuf.length && crypto.timingSafeEqual(tokenBuf, rt)) {
        return { mode: "multi", token_id: record.token_id, description: record.description };
      }
    }
  }
  return null;
}

// ---- Token file management ----

export function initTokensFile(
  tokensFile: string,
  opts: { token_id: string; description: string; token?: string },
): { path: string; token: string } {
  const resolved = path.resolve(tokensFile.replace(/^~/, () => process.env["HOME"] ?? ""));
  if (fs.existsSync(resolved)) {
    throw new SellfoxConfigError(`令牌文件已存在: ${resolved}`);
  }
  const dir = path.dirname(resolved);
  fs.mkdirSync(dir, { recursive: true });
  const value = opts.token ?? generateMemberToken();
  const now = nowISO();
  const records: AuthTokenRecord[] = [
    {
      token_id: opts.token_id,
      token: value,
      description: opts.description,
      status: "active",
      created_at: now,
      updated_at: now,
      revoked_at: null,
    },
  ];
  fs.writeFileSync(resolved, JSON.stringify(buildTokensPayload(records), null, 2), "utf-8");
  return { path: resolved, token: value };
}

export function upsertToken(
  tokensFile: string,
  opts: { token_id: string; description: string; token?: string },
): string {
  const resolved = path.resolve(tokensFile.replace(/^~/, () => process.env["HOME"] ?? ""));
  const existing = loadTokensFile(resolved);
  const value = opts.token ?? generateMemberToken();
  const now = nowISO();
  let replaced = false;

  for (let i = 0; i < existing.length; i++) {
    const r = existing[i]!;
    if (r.token_id === opts.token_id) {
      existing[i] = {
        ...r,
        token: value,
        description: opts.description || r.description,
        status: "active",
        updated_at: now,
      };
      replaced = true;
      break;
    }
  }

  if (!replaced) {
    existing.push({
      token_id: opts.token_id,
      token: value,
      description: opts.description,
      status: "active",
      created_at: now,
      updated_at: now,
      revoked_at: null,
    });
  }

  fs.writeFileSync(resolved, JSON.stringify(buildTokensPayload(existing), null, 2), "utf-8");
  return value;
}

export function revokeToken(tokensFile: string, token_id: string): boolean {
  const resolved = path.resolve(tokensFile.replace(/^~/, () => process.env["HOME"] ?? ""));
  const existing = loadTokensFile(resolved);
  const now = nowISO();
  let changed = false;

  for (let i = 0; i < existing.length; i++) {
    const r = existing[i]!;
    if (r.token_id === token_id && r.status !== "revoked") {
      existing[i] = { ...r, status: "revoked", updated_at: now, revoked_at: now };
      changed = true;
      break;
    }
  }

  if (changed) {
    fs.writeFileSync(resolved, JSON.stringify(buildTokensPayload(existing), null, 2), "utf-8");
  }
  return changed;
}

export function rotateToken(tokensFile: string, token_id: string, token?: string): string {
  const resolved = path.resolve(tokensFile.replace(/^~/, () => process.env["HOME"] ?? ""));
  const existing = loadTokensFile(resolved);
  const now = nowISO();
  const value = token ?? generateMemberToken();

  for (let i = 0; i < existing.length; i++) {
    const r = existing[i]!;
    if (r.token_id === token_id) {
      existing[i] = { ...r, token: value, status: "active", updated_at: now };
      fs.writeFileSync(resolved, JSON.stringify(buildTokensPayload(existing), null, 2), "utf-8");
      return value;
    }
  }
  throw new SellfoxConfigError(`未找到令牌 ID: ${token_id}`);
}
