// ============================================================
// Sellfox error hierarchy — mirrors errors.py
// ============================================================

export function hintForBusinessError(
  code: unknown,
  message: string,
  endpoint?: string | null,
): string | null {
  const text = (message ?? "").trim();
  const endpointText = (endpoint ?? "").trim();
  const codeText = String(code ?? "").trim();
  const combined = `${codeText} ${text} ${endpointText}`.toLowerCase();

  if (combined.includes("403") || text.includes("授权失效") || text.includes("权限")) {
    return "请检查赛狐开放平台授权有效期、接口权限范围，以及调用 IP 是否在白名单内。";
  }
  if (combined.includes("sign") || text.includes("签名")) {
    return "请检查 sign 生成规则(HMAC-SHA256)、请求参数排序和 client_secret 是否正确。";
  }
  if (combined.includes("timeout") || text.includes("超时")) {
    return "请稍后重试，并确认当前网络是否能访问 openapi.sellfox.com。";
  }
  if (combined.includes("network") || text.includes("网络")) {
    return "请检查当前机器网络、DNS 和 HTTPS 访问能力。";
  }
  return null;
}

export class SellfoxClientError extends Error {
  readonly endpoint: string | null;
  readonly code: unknown;
  readonly hint: string | null;
  readonly details: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      endpoint?: string | null;
      code?: unknown;
      hint?: string | null;
      details?: Record<string, unknown>;
    },
  ) {
    const parts: string[] = [];
    if (options?.endpoint) parts.push(options.endpoint);
    if (options?.code != null && options.code !== "") parts.push(`code=${options.code}`);
    parts.push(message);
    if (options?.hint) parts.push(`hint=${options.hint}`);
    super(parts.join(" | "));
    this.name = "SellfoxClientError";
    this.endpoint = options?.endpoint ?? null;
    this.code = options?.code ?? null;
    this.hint = options?.hint ?? null;
    this.details = options?.details ?? {};
  }

  toDict(): Record<string, unknown> {
    const payload: Record<string, unknown> = { message: this.message };
    if (this.endpoint) payload["endpoint"] = this.endpoint;
    if (this.code != null && this.code !== "") payload["code"] = this.code;
    if (this.hint) payload["hint"] = this.hint;
    if (Object.keys(this.details).length > 0) payload["details"] = this.details;
    return payload;
  }
}

export class SellfoxConfigError extends SellfoxClientError {
  constructor(message: string, options?: { endpoint?: string | null; details?: Record<string, unknown> }) {
    super(message, options);
    this.name = "SellfoxConfigError";
  }
}

export class SellfoxTransportError extends SellfoxClientError {
  constructor(
    message: string,
    options?: { endpoint?: string | null; code?: unknown; hint?: string | null; details?: Record<string, unknown> },
  ) {
    super(message, options);
    this.name = "SellfoxTransportError";
  }
}

export class SellfoxSignError extends SellfoxClientError {
  constructor(message: string, options?: { endpoint?: string | null; details?: Record<string, unknown> }) {
    super(message, options);
    this.name = "SellfoxSignError";
  }
}

export class SellfoxRequestError extends SellfoxClientError {
  constructor(
    message: string,
    options?: { endpoint?: string | null; code?: unknown; hint?: string | null; details?: Record<string, unknown> },
  ) {
    super(message, options);
    this.name = "SellfoxRequestError";
  }
}
