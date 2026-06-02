# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Stdio mode (for Claude Code MCP integration)
npm run dev:http     # HTTP gateway mode (admin console + MCP JSON-RPC)
npm run build        # TypeScript compilation to dist/
npm start            # Run compiled stdio server
npm start:http       # Run compiled HTTP gateway
```

All run commands require `--experimental-sqlite` (Node 22's `node:sqlite` is experimental). The package.json scripts already include this flag.

## Architecture

This is a migration of a Python MCP project that wraps the Sellfox (赛狐) Amazon seller OpenAPI. It runs as both a **stdio MCP server** (for Claude Code) and an **HTTP gateway** (for remote clients, with admin UI).

### Two entrypoints

- **`src/server.ts`** — Stdio entry. Instantiates `SellfoxMCPApplication`, connects via `StdioServerTransport`.
- **`src/http-server.ts`** — HTTP gateway entry. Native `node:http` server with CORS, Bearer token / API key auth, admin REST APIs, and MCP JSON-RPC at `/mcp`.

### Core layers (top to bottom)

| Layer | File | Role |
|---|---|---|
| Auth | `src/auth.ts` | Bearer token file CRUD, `crypto.timingSafeEqual`, bootstrap + multi-token |
| Permissions | `src/shop-permission.ts` | Shop-level access control for API keys |
| Admin | `src/admin-page.ts` | Inlined HTML admin console (~400 lines) + REST handlers for credentials and API keys |
| MCP Server | `src/mcp-server.ts` | `McpServer` from `@modelcontextprotocol/sdk`, 9 hand-written tools + 60+ auto-registered endpoint-spec tools with Zod schemas |
| HTTP Server | `src/http-server.ts` | Own tool registry (`TOOL_LIST`) and `callTool()` dispatch — does NOT use McpServer internals because `_registeredTools` is private |
| Services | `src/services.ts` | `SellfoxOpenAPIService` — lazy client init, health/smoke checks, seller lists, orders, sales, ad reports, endpoint spec runner |
| Client | `src/client.ts` | `SellfoxOpenAPIClient` — HMAC-SHA256 signing (`crypto.createHmac`), OAuth2 token with file/pool cache, `fetch`-based HTTP with retry, paginated requests (page-based + next-token), file download with gzip/ZIP/CSV parsing (zero deps) |
| Specs | `src/endpoint-specs.ts` | 60+ `EndpointSpec` definitions via `makeEndpointSpec()`, arg helpers (`s()`, `i()`, `b()`, `as()`), indexed in `ENDPOINT_SPECS_BY_NAME` |
| Pool | `src/credential-pool.ts` | SQLite-based credential rotation with LRU scheduling and per-credential token caching |
| Keys | `src/api-key-manager.ts` | SQLite-based API key storage with shop permission tables |

### Data flow

```
Claude Code / HTTP client
        │
        ▼
┌──────────────────┐
│  MCP Server/HTTP │  (McpServer + StdioServerTransport OR node:http)
└────────┬─────────┘
         │
    ┌────▼────┐
    │ Services │  (SellfoxOpenAPIService — business logic, result wrapping)
    └────┬────┘
         │
    ┌────▼────┐
    │  Client  │  (SellfoxOpenAPIClient — HMAC sign → fetch → parse)
    └────┬────┘
         │
    Sellfox OpenAPI
```

### Auth flows

1. **Stdio mode**: Credentials from `SELLFOX_CLIENT_ID` / `SELLFOX_CLIENT_SECRET` env vars or credential pool DB.
2. **HTTP mode**: Bearer token (bootstrap env var or `tokens.json` file) OR API key (`?key=` query param). Shop permissions enforced per API key on `tools/call`.

### Key patterns

- **ESM only** (`"type": "module"`), all imports use `.js` extensions (per `nodenext` module resolution).
- **Zod v4** schemas for MCP tool registration; `buildZodObject()` converts `EndpointSpec.args` to `z.ZodObject`.
- **No external HTTP/CSV/ZIP deps** — `fetch`, hand-written CSV parser, and a lightweight sync ZIP parser using `Buffer` + `zlib.inflateRawSync`.
- **Token caching**: File-based (single credential) or SQLite-backed (credential pool). Token validity checked with 60s lead margin.
- **Pagination**: Page-based uses `pageNo`/`pageSize` params; next-token mode uses `nextToken` field. Both stop on empty pages, total comparison, or `max_pages`.
- **`exactOptionalPropertyTypes`** is enabled — optional properties cannot accept `undefined`, only omission.
