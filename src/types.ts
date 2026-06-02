// ============================================================
// Shared TypeScript interfaces — mirrors Python dataclasses
// ============================================================

export interface TokenBundle {
  access_token: string;
  expires_at: number;
}

export interface PagedRows {
  rows: Record<string, unknown>[];
  page_count: number;
  total: number | null;
  next_token: string | null;
}

export interface DownloadedFile {
  url: string;
  final_url: string;
  filename: string | null;
  content_type: string | null;
  content_encoding: string | null;
  size: number;
  parsed_format: string | null;
  data: unknown;
  warnings: string[];
}

export interface RawResponse {
  body: Buffer;
  headers: Record<string, string>;
  final_url: string;
}

export interface SellfoxResult {
  ok: boolean;
  data: unknown;
  meta: Record<string, unknown>;
  warnings: string[];
}

// ---- Auth types ----

export interface AuthTokenRecord {
  token_id: string;
  token: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
}

export interface AuthMatch {
  mode: string;
  token_id: string;
  description: string;
}

export interface BearerAuthConfig {
  bootstrap_token: string | null;
  tokens_file: string | null;
  records: readonly AuthTokenRecord[];
}

export interface TokensFilePayload {
  version: number;
  tokens: {
    id: string;
    description: string;
    token: string;
    status: string;
    created_at: string;
    updated_at: string;
    revoked_at: string | null;
  }[];
}

// ---- Endpoint spec types ----

export interface ToolArg {
  name: string;
  arg_type: "string" | "integer" | "boolean" | "array_string" | "array_integer";
  required: boolean;
  description: string;
  default: unknown;
  enum: string[] | null;
}

export interface EndpointSpec {
  tool_name: string;
  description: string;
  endpoint: string;
  category: string;
  args: readonly ToolArg[];
  pagination_mode: "page" | "next_token" | "none";
  page_size: number;
  data_path: string;
  total_path: string | null;
  next_token_path: string | null;
  docs_path: string;
  defaults: Record<string, unknown>;
  headers: Record<string, string>;
  auto_profile: boolean;
  profile_type: string;
  result_kind: "rows" | "object";
  stable: boolean;
  search_field: string | null;
}

export interface EndpointSpecInit {
  tool_name: string;
  description: string;
  endpoint: string;
  category: string;
  args?: ToolArg[];
  pagination_mode?: "page" | "next_token" | "none";
  page_size?: number;
  data_path?: string;
  total_path?: string | null;
  next_token_path?: string | null;
  docs_path?: string;
  body_defaults?: Record<string, unknown>;
  extra_headers?: Record<string, string>;
  auto_profile?: boolean;
  profile_type?: string;
  result_kind?: "rows" | "object";
  stable?: boolean;
  search_field?: string | null;
}

// ---- MCP / Tool types ----

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Record<string, unknown>;
}

export interface JSONRPCRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: Record<string, unknown>;
  };
}

export interface MCPToolResult {
  content: { type: "text"; text: string }[];
  structuredContent: Record<string, unknown>;
  isError?: boolean;
}

// ---- Credential pool types ----

export interface CredentialRecord {
  id: number;
  client_id: string;
  client_secret: string;
  description: string;
  enabled: boolean;
  last_used_at: string | null;
  access_token: string | null;
  token_expires_at: number | null;
  created_at: string;
}

// ---- Shop types ----

export interface ShopInfo {
  shopId: string;
  shopName: string;
  marketplaceId: string;
  region: string;
  sellerId: string;
  adStatus: string;
  status: string;
}

export interface ApiKeyRecord {
  id: number;
  seq: number;
  name: string;
  key_value: string;
  memo: string;
  is_admin: number;
  created_at: string;
}

export interface ShopPermission {
  shop_id: string;
  shop_name: string;
}
