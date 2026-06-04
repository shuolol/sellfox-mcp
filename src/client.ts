// ============================================================
// Sellfox OpenAPI client — mirrors client.py
// Uses: native fetch, crypto.createHmac, zlib, no external deps
// ============================================================

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import type { CredentialPool } from "./credential-pool.js";
import {
  SellfoxConfigError,
  SellfoxRequestError,
  SellfoxTransportError,
  hintForBusinessError,
} from "./errors.js";
import type { DownloadedFile, PagedRows, RawResponse, TokenBundle } from "./types.js";

// ---- Constants ----

export const DEFAULT_TOKEN_CACHE = path.join("runtime", "sellfox", "token_cache.json");
export const BASE_URL = "https://openapi.sellfox.com";
export const SUCCESS_CODES = new Set<unknown>([0, "0", 200, "200"]);

// ---- Logging ----

function logger(): typeof import("node:console") {
  return console;
}

function logInfo(fmt: string, ...args: unknown[]): void {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  process.stderr.write(`[${ts}] INFO sellfox ${interpolate(fmt, args)}\n`);
}

function logError(fmt: string, ...args: unknown[]): void {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  process.stderr.write(`[${ts}] ERROR sellfox ${interpolate(fmt, args)}\n`);
}

function logDebug(fmt: string, ...args: unknown[]): void {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  process.stderr.write(`[${ts}] DEBUG sellfox ${interpolate(fmt, args)}\n`);
}

function interpolate(fmt: string, args: unknown[]): string {
  let idx = 0;
  return fmt.replace(/%[sd]/g, () => String(args[idx++] ?? ""));
}

export function setupLogging(): void {
  // Logging is always on via stderr; this matches Python's setup_logging
}

// ---- .env loader ----

export function loadEnvFile(filePath?: string): void {
  const target = filePath ?? process.env["SELLFOX_ENV_FILE"] ?? ".env";
  if (!fs.existsSync(target)) return;
  const content = fs.readFileSync(target, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eqIdx = trimmed.indexOf("=");
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// ---- Helpers ----

function jsonDumps(value: unknown): string {
  return JSON.stringify(value);
}

export function extractPathValue(payload: unknown, dotPath: string | null): unknown {
  if (!dotPath) return payload;
  let current: unknown = payload;
  for (const part of dotPath.split(".")) {
    if (!part) continue;
    if (current == null || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function stringifySignValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null || value === undefined) return "null";
  if (typeof value === "object") return jsonDumps(value);
  return String(value);
}

// ---- Token helpers ----

export function makeTokenBundle(access_token: string, expires_at: number): TokenBundle {
  return { access_token, expires_at };
}

export function isTokenValid(bundle: TokenBundle, leadSeconds = 60): boolean {
  return Boolean(bundle.access_token) && bundle.expires_at > Math.floor(Date.now() / 1000) + leadSeconds;
}

// ---- Signing ----

export function buildSignParams(access_token: string, client_id: string, url_path: string): Record<string, string> {
  return {
    access_token,
    client_id,
    method: "post",
    nonce: String(Math.floor(Math.random() * 99999) + 1),
    timestamp: String(Date.now()),
    url: url_path,
  };
}

export function generateSign(signParams: Record<string, string>, client_secret: string): string {
  const sortedItems = Object.entries(signParams).sort(([a], [b]) => a.localeCompare(b));
  const paramStr = sortedItems.map(([key, value]) => `${key}=${value}`).join("&");
  return crypto.createHmac("sha256", client_secret).update(paramStr, "utf-8").digest("hex");
}

export function envOrRaise(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) {
    throw new SellfoxConfigError(`缺少环境变量: ${name}`);
  }
  return value;
}

// ---- Retry helper ----

function isRetryable(statusCode: number, body: string): boolean {
  if (statusCode >= 500) return true;
  if (statusCode === 400 && body.includes("40019")) return true;
  return false;
}

// ---- Main client ----

export class SellfoxOpenAPIClient {
  client_id: string;
  client_secret: string;
  token_cache_file: string;
  base_url: string;
  timeout: number;
  private _pool: CredentialPool | null;
  private _pool_access_token: string | null;
  private _cred_last_used: Record<string, number>;
  private _cred_min_interval: number;

  constructor(options?: {
    client_id?: string;
    client_secret?: string;
    token_cache_file?: string;
    base_url?: string;
    timeout?: number;
    credential_pool?: CredentialPool;
  }) {
    loadEnvFile();
    this._pool = options?.credential_pool ?? null;
    if (this._pool) {
      this.client_id = "";
      this.client_secret = "";
      this._pool_access_token = null;
    } else {
      this.client_id = options?.client_id ?? envOrRaise("SELLFOX_CLIENT_ID");
      this.client_secret = options?.client_secret ?? envOrRaise("SELLFOX_CLIENT_SECRET");
      this._pool_access_token = null;
    }
    this.token_cache_file =
      options?.token_cache_file ??
      process.env["SELLFOX_TOKEN_CACHE_FILE"] ??
      DEFAULT_TOKEN_CACHE;
    this.base_url = (
      options?.base_url ??
      process.env["SELLFOX_BASE_URL"] ??
      BASE_URL
    ).replace(/\/+$/, "");
    this.timeout = options?.timeout ?? 30;
    this._cred_last_used = {};
    this._cred_min_interval = parseFloat(process.env["SELLFOX_RATE_LIMIT_INTERVAL"] ?? "1.1");
  }

  // ---- Pool credential rotation ----

  private async _refreshPoolCredential(): Promise<void> {
    if (!this._pool) return;
    const [cid, csecret, cachedToken] = await this._pool.acquireWithToken();
    const now = Date.now() / 1000;
    const last = this._cred_last_used[cid] ?? 0;
    const wait = last + this._cred_min_interval - now;
    if (wait > 0) {
      logInfo("凭据 %s*** 冷却中，等待 %.1fs", cid.slice(0, 8), wait);
      await sleep(wait * 1000);
    }
    this.client_id = cid;
    this.client_secret = csecret;
    this._pool_access_token = cachedToken;
    this._cred_last_used[cid] = Date.now() / 1000;
  }

  // ---- Token cache ----

  async getCachedToken(): Promise<TokenBundle | null> {
    if (this._pool) {
      if (this._pool_access_token != null) {
        const cached = await this._pool.getCachedToken(this.client_id);
        if (cached) {
          return makeTokenBundle(cached[0], cached[1]);
        }
      }
      return null;
    }
    if (!fs.existsSync(this.token_cache_file)) return null;
    try {
      const raw = fs.readFileSync(this.token_cache_file, "utf-8");
      const payload = JSON.parse(raw) as Record<string, unknown>;
      const access_token = String(payload["access_token"] ?? "");
      const expires_at = Number(payload["expires_at"] ?? 0);
      if (!access_token || !expires_at) return null;
      return makeTokenBundle(access_token, expires_at);
    } catch {
      return null;
    }
  }

  private async _writeTokenCache(bundle: TokenBundle): Promise<void> {
    if (this._pool) {
      await this._pool.updateToken(this.client_id, bundle.access_token, bundle.expires_at);
      this._pool_access_token = bundle.access_token;
    }
    const dir = path.dirname(this.token_cache_file);
    fs.mkdirSync(dir, { recursive: true });
    const payload = {
      access_token: bundle.access_token,
      expires_at: bundle.expires_at,
      updated_at: Math.floor(Date.now() / 1000),
    };
    fs.writeFileSync(this.token_cache_file, jsonDumps(payload), "utf-8");
  }

  // ---- HTTP request core ----

  private async _requestBytes(
    url: string,
    options: RequestInit & { endpoint: string },
    _retry = 2,
  ): Promise<RawResponse> {
    const method = options.method ?? "GET";
    const endpoint = options.endpoint;
    const t0 = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout * 1000);
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const body = Buffer.from(await response.arrayBuffer());
      const elapsed = Date.now() - t0;
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      const final_url = response.url || url;
      logInfo("HTTP %s %s -> %s (%.0fms, %d bytes)", method, url, response.status, elapsed, body.length);

      if (!response.ok) {
        const bodyText = body.toString("utf-8");
        logError("HTTP %s %s -> %s (%.0fms) %s", method, url, response.status, elapsed, bodyText.slice(0, 200));
        if (_retry > 0 && isRetryable(response.status, bodyText)) {
          const waitS = Math.pow(1.5, 3 - _retry);
          logInfo("重试 %s (%.1fs 后)... 剩余 %d 次", endpoint, waitS, _retry - 1);
          await sleep(waitS * 1000);
          return this._requestBytes(url, options, _retry - 1);
        }
        throw new SellfoxTransportError(`HTTP ${response.status}: ${bodyText || "空响应"}`, {
          endpoint,
          code: response.status,
          hint: hintForBusinessError(response.status, bodyText, endpoint),
        });
      }

      return { body, headers, final_url };
    } catch (err) {
      const elapsed = Date.now() - t0;
      if (err instanceof SellfoxTransportError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      logError("HTTP %s %s -> 网络错误 (%.0fms) %s", method, url, elapsed, msg);
      if (_retry > 0) {
        const waitS = Math.pow(1.5, 3 - _retry);
        logInfo("重试 %s (%.1fs 后)... 剩余 %d 次", endpoint, waitS, _retry - 1);
        await sleep(waitS * 1000);
        return this._requestBytes(url, options, _retry - 1);
      }
      throw new SellfoxTransportError(`网络请求失败: ${msg}`, {
        endpoint,
        hint: hintForBusinessError(null, msg, endpoint),
      });
    }
  }

  private async _request(
    url: string,
    options: RequestInit & { endpoint: string },
  ): Promise<Record<string, unknown>> {
    const raw = await this._requestBytes(url, options);
    const text = raw.body.toString("utf-8");
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch (err) {
      throw new SellfoxTransportError(`响应不是合法 JSON: ${text.slice(0, 200)}`, {
        endpoint: options.endpoint,
      });
    }
  }

  private _ensureSuccess(payload: Record<string, unknown>, endpoint: string): void {
    const code = payload["code"];
    if (!SUCCESS_CODES.has(code)) {
      const message = String(payload["message"] ?? payload["msg"] ?? "未知错误");
      throw new SellfoxRequestError(message, {
        endpoint,
        code,
        hint: hintForBusinessError(code, message, endpoint),
        details: { payload },
      });
    }
  }

  // ---- Auth ----

  async fetchAccessToken(): Promise<TokenBundle> {
    const endpoint = "/api/oauth/v2/token.json";
    logInfo("获取 access_token (client_id=%s...)", this.client_id ? this.client_id.slice(0, 8) : "?");
    const params = new URLSearchParams({
      client_id: this.client_id,
      client_secret: this.client_secret,
      grant_type: "client_credentials",
    });
    const payload = await this._request(`${this.base_url}${endpoint}?${params.toString()}`, {
      method: "GET",
      endpoint,
    });
    this._ensureSuccess(payload, endpoint);
    const data = (payload["data"] ?? {}) as Record<string, unknown>;
    const access_token = String(data["access_token"] ?? "");
    const expires_in_ms = Number(data["expires_in"] ?? 0);
    if (!access_token || !expires_in_ms) {
      throw new SellfoxRequestError("Token 响应缺少字段", { endpoint, details: { payload } });
    }
    const expires_in_seconds = Math.max(Math.floor(expires_in_ms / 1000), 1);
    const bundle = makeTokenBundle(
      access_token,
      Math.floor(Date.now() / 1000) + Math.max(expires_in_seconds - 120, 60),
    );
    await this._writeTokenCache(bundle);
    logInfo("access_token 获取成功, 有效期 %ds", expires_in_seconds);
    return bundle;
  }

  async ensureAccessToken(): Promise<TokenBundle> {
    const cached = await this.getCachedToken();
    if (cached && isTokenValid(cached)) return cached;
    return this.fetchAccessToken();
  }

  // ---- Sign query builder ----

  private async _buildSignQuery(
    path_: string,
    queryParams?: Record<string, unknown> | null,
  ): Promise<Record<string, string>> {
    await this._refreshPoolCredential();
    const tokenBundle = await this.ensureAccessToken();
    const signParams = buildSignParams(tokenBundle.access_token, this.client_id, path_);
    const sign = generateSign(signParams, this.client_secret);
    const result: Record<string, string> = {
      access_token: tokenBundle.access_token,
      client_id: this.client_id,
      timestamp: signParams["timestamp"]!,
      nonce: signParams["nonce"]!,
      sign,
    };
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        result[key] = stringifySignValue(value);
      }
    }
    return result;
  }

  // ---- Public methods ----

  async postJSON(
    rawPath: string,
    jsonBody?: Record<string, unknown> | null,
    queryParams?: Record<string, unknown> | null,
    extraHeaders?: Record<string, string> | null,
  ): Promise<Record<string, unknown>> {
    const normalizedPath = `/${rawPath.replace(/^\//, "")}`;
    const body = { ...(jsonBody ?? {}) };
    logDebug("POST %s body: %s", normalizedPath, jsonDumps(body));
    const signQuery = await this._buildSignQuery(normalizedPath, queryParams);
    const query = new URLSearchParams(signQuery).toString();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (extraHeaders) {
      Object.assign(headers, extraHeaders);
    }
    const payload = await this._request(`${this.base_url}${normalizedPath}?${query}`, {
      method: "POST",
      headers,
      body: jsonDumps(body),
      endpoint: normalizedPath,
    });
    this._ensureSuccess(payload, normalizedPath);
    logDebug("POST %s response code=%s", normalizedPath, String(payload["code"] ?? ""));
    return payload;
  }

  async getJSON(
    rawPath: string,
    queryParams?: Record<string, unknown> | null,
  ): Promise<Record<string, unknown>> {
    const normalizedPath = `/${rawPath.replace(/^\//, "")}`;
    const params = { ...(queryParams ?? {}) };
    logDebug("GET %s params: %s", normalizedPath, jsonDumps(params));
    const signQuery = await this._buildSignQuery(normalizedPath, params);
    const query = new URLSearchParams(signQuery).toString();
    const payload = await this._request(`${this.base_url}${normalizedPath}?${query}`, {
      method: "GET",
      endpoint: normalizedPath,
    });
    this._ensureSuccess(payload, normalizedPath);
    return payload;
  }

  async pagedPost(
    path: string,
    body: Record<string, unknown>,
    opts?: {
      page_size?: number;
      data_path?: string;
      total_path?: string | null;
      next_token_path?: string | null;
      pagination_mode?: string;
      max_pages?: number;
      extra_headers?: Record<string, string> | null;
    },
  ): Promise<Record<string, unknown>[]> {
    const result = await this.pagedPostDetailed(path, body, opts);
    return result.rows;
  }

  async pagedPostDetailed(
    path_: string,
    body: Record<string, unknown>,
    opts?: {
      page_size?: number;
      data_path?: string;
      total_path?: string | null;
      next_token_path?: string | null;
      pagination_mode?: string;
      max_pages?: number;
      extra_headers?: Record<string, string> | null;
    },
  ): Promise<PagedRows> {
    const page_size = opts?.page_size ?? 100;
    const data_path = opts?.data_path ?? "data.rows";
    const total_path = opts?.total_path ?? "data.totalSize";
    const next_token_path = opts?.next_token_path ?? null;
    const pagination_mode = opts?.pagination_mode ?? "page";
    const max_pages = opts?.max_pages ?? 0;
    const extra_headers = opts?.extra_headers ?? null;

    const results: Record<string, unknown>[] = [];
    let page_count = 0;
    let total: number | null = null;

    if (pagination_mode === "next_token" && next_token_path) {
      let next_token: string | null = null;
      while (true) {
        page_count++;
        const pageBody = { ...body, pageSize: page_size };
        if (next_token) (pageBody as Record<string, unknown>)["nextToken"] = next_token;
        const payload = await this.postJSON(path_, pageBody, undefined, extra_headers);
        const data = extractPathValue(payload, data_path);
        if (!Array.isArray(data)) {
          throw new SellfoxRequestError(`${path_} 返回 ${data_path} 不是数组`, {
            endpoint: path_,
            details: { payload },
          });
        }
        results.push(...(data as Record<string, unknown>[]));
        const totalRaw = extractPathValue(payload, total_path);
        if (totalRaw != null && totalRaw !== "") total = Number(totalRaw);
        logInfo("分页 %s page=%d rows=%d total=%s", path_, page_count, data.length, total);
        const newNextToken = extractPathValue(payload, next_token_path);
        if (!newNextToken || String(newNextToken) === String(next_token ?? "")) {
          next_token = String(newNextToken ?? "") || null;
          break;
        }
        if (max_pages > 0 && page_count >= max_pages) break;
        next_token = String(newNextToken);
      }
      return { rows: results, page_count, total, next_token };
    }

    let pageNo = 1;
    while (true) {
      page_count++;
      const pageBody = { ...body, pageNo: String(pageNo), pageSize: String(page_size) };
      const payload = await this.postJSON(path_, pageBody, undefined, extra_headers);
      const data = extractPathValue(payload, data_path);
      if (!Array.isArray(data)) {
        throw new SellfoxRequestError(`${path_} 返回 ${data_path} 不是数组`, {
          endpoint: path_,
          details: { payload },
        });
      }
      results.push(...(data as Record<string, unknown>[]));
      const totalRaw = extractPathValue(payload, total_path);
      if (totalRaw != null && totalRaw !== "") total = Number(totalRaw);
      logInfo("分页 %s page=%d rows=%d total=%s", path_, pageNo, data.length, total);
      if (!data.length || (total != null && results.length >= total)) break;
      if (max_pages > 0 && page_count >= max_pages) break;
      pageNo++;
    }
    return { rows: results, page_count, total, next_token: null };
  }

  // ---- File download ----

  async downloadFile(url: string, extraHeaders?: Record<string, string> | null): Promise<DownloadedFile> {
    const raw = await this._requestBytes(url, {
      method: "GET",
      headers: extraHeaders ?? {},
      endpoint: url,
    });
    return this._parseDownloadResponse(url, raw);
  }

  private _parseDownloadResponse(url: string, raw: RawResponse): DownloadedFile {
    let body = raw.body;
    const headers = raw.headers;
    const warnings: string[] = [];
    const content_type = headers["Content-Type"] ?? headers["content-type"] ?? null;
    const content_encoding = headers["Content-Encoding"] ?? headers["content-encoding"] ?? null;
    let filename: string | null = null;
    const disposition = headers["Content-Disposition"] ?? headers["content-disposition"] ?? "";
    const filenameMatch = disposition.match(/filename=("[^"]*"|[^\s;]+)/);
    if (filenameMatch) {
      filename = filenameMatch[1]!.replace(/^"|"$/g, "");
    }

    let parsed_format: string | null = null;
    let data: unknown = null;
    let lowerUrl = raw.final_url.toLowerCase();
    const lowerFilename = (filename ?? "").toLowerCase();

    // Handle gzip
    const isGzip =
      content_encoding === "gzip" || lowerUrl.endsWith(".gz") || lowerFilename.endsWith(".gz");
    if (isGzip) {
      body = zlib.gunzipSync(body);
      parsed_format = "gzip";
      if (filename && filename.toLowerCase().endsWith(".gz")) {
        filename = filename.slice(0, -3);
      }
      if (lowerUrl.endsWith(".gz")) {
        lowerUrl = lowerUrl.slice(0, -3);
      }
    }

    // Handle zip
    const isZip =
      lowerUrl.endsWith(".zip") ||
      lowerFilename.endsWith(".zip") ||
      (body.length >= 4 && body[0] === 0x50 && body[1] === 0x4b && body[2] === 0x03 && body[3] === 0x04);

    if (isZip) {
      const files: { name: string; format: string | null; data: unknown }[] = [];
      // Use a lightweight sync unzip — iterate over zip entries
      const zipData = parseZipSync(body);
      for (const entry of zipData) {
        const [memberFormat, memberData] = this._parseTableOrText(entry.name, entry.data);
        files.push({ name: entry.name, format: memberFormat, data: memberData });
      }
      parsed_format = "zip";
      data = files;
    } else if (content_type && content_type.toLowerCase().includes("json")) {
      data = JSON.parse(body.toString("utf-8"));
      parsed_format = "json";
    } else {
      let parseName = filename ?? raw.final_url;
      if (String(parseName).toLowerCase().endsWith(".gz")) {
        parseName = String(parseName).slice(0, -3);
      }
      const [memberFormat, memberData] = this._parseTableOrText(String(parseName), body);
      parsed_format = parsed_format ?? memberFormat;
      if (memberFormat === null) {
        warnings.push("未识别下载文件格式，按文本返回。");
      }
      data = memberData;
    }

    return {
      url,
      final_url: raw.final_url,
      filename,
      content_type,
      content_encoding,
      size: raw.body.length,
      parsed_format,
      data,
      warnings,
    };
  }

  private _parseTableOrText(name: string, body: Buffer): [string | null, unknown] {
    const lowerName = (name ?? "").toLowerCase();
    const text = body.toString("utf-8");
    if (lowerName.endsWith(".json")) {
      return ["json", JSON.parse(text)];
    }
    if (lowerName.endsWith(".csv")) {
      return ["csv", parseCSV(text, ",")];
    }
    if (lowerName.endsWith(".tsv") || (text.includes("\t") && text.includes("\n"))) {
      return ["tsv", parseCSV(text, "\t")];
    }
    return [null, text];
  }
}

// ---- Utility: sleep ----

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- CSV parser (stdlib-only, no external deps) ----

function parseCSV(text: string, delimiter: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const headers = parseCSVLine(lines[0]!, delimiter);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]!, delimiter);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]!] = values[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

// ---- Lightweight sync ZIP parser (no external deps) ----

interface ZipEntry {
  name: string;
  data: Buffer;
}

function parseZipSync(buf: Buffer): ZipEntry[] {
  // Find EOCD record
  let eocdOffset = buf.length - 22;
  while (eocdOffset >= 0) {
    if (
      buf[eocdOffset] === 0x50 &&
      buf[eocdOffset + 1] === 0x4b &&
      buf[eocdOffset + 2] === 0x05 &&
      buf[eocdOffset + 3] === 0x06
    ) {
      break;
    }
    eocdOffset--;
  }
  if (eocdOffset < 0) {
    // Can't find EOCD, try to decompress as a single gzip
    try {
      const decompressed = zlib.gunzipSync(buf);
      return [{ name: "data", data: decompressed }];
    } catch {
      return [{ name: "data", data: buf }];
    }
  }

  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let offset = centralDirOffset;

  while (offset < eocdOffset) {
    const signature = buf.readUInt32LE(offset);
    if (signature !== 0x02014b50) break;

    const compressionMethod = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const fileNameLength = buf.readUInt16LE(offset + 28);
    const extraFieldLength = buf.readUInt16LE(offset + 30);
    const fileCommentLength = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);

    const name = buf.toString("utf-8", offset + 46, offset + 46 + fileNameLength);

    // Read local file header
    const localSig = buf.readUInt32LE(localHeaderOffset);
    if (localSig !== 0x04034b50) {
      offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
      continue;
    }

    const localFileNameLength = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;

    let fileData: Buffer;
    if (compressionMethod === 0) {
      fileData = buf.subarray(dataStart, dataStart + compressedSize);
    } else if (compressionMethod === 8) {
      fileData = zlib.inflateRawSync(buf.subarray(dataStart, dataStart + compressedSize));
    } else {
      fileData = buf.subarray(dataStart, dataStart + compressedSize);
    }

    entries.push({ name, data: fileData });
    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return entries;
}
