#!/usr/bin/env node
// ============================================================
// Sellfox MCP HTTP entrypoint — mirrors http_server.py
// ============================================================

import * as http from "node:http";
import { SellfoxMCPApplication, SERVER_NAME, SERVER_VERSION } from "./mcp-server.js";
import { loadEnvFile, setupLogging } from "./client.js";
import { loadBearerAuthConfig, authSummary, authenticateHeader } from "./auth.js";
import type { AuthMatch, BearerAuthConfig } from "./types.js";
import { handleAdminApi, handleKeyAdminApi, ADMIN_HTML } from "./admin-page.js";
import { resolveShopIdsForCall } from "./shop-permission.js";
import { ALL_ENDPOINT_SPECS, ENDPOINT_SPECS_BY_NAME } from "./endpoint-specs.js";
import { SellfoxClientError } from "./errors.js";

// ---- Helpers ----

function jsonDumps(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function nowText(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function sendJSON(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = Buffer.from(jsonDumps(payload), "utf-8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(body.length),
  });
  res.end(body);
}

async function readBody(req: http.IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      if (chunks.length === 0) resolve(null);
      else resolve(Buffer.concat(chunks));
    });
  });
}

function toolResult(payload: Record<string, unknown>, isError = false) {
  return {
    content: [{ type: "text" as const, text: jsonDumps(payload) }],
    structuredContent: payload,
    isError,
  };
}

function toolErrorPayload(exc: unknown): Record<string, unknown> {
  if (exc instanceof SellfoxClientError) {
    return {
      ok: false,
      error: exc.toDict(),
      meta: { endpoint: exc.endpoint ?? "unknown", page_count: 0, request_ts: nowText() },
      warnings: [exc.message],
    };
  }
  const msg = exc instanceof Error ? exc.message : String(exc);
  return {
    ok: false,
    error: { message: msg },
    meta: { endpoint: "unknown", page_count: 0, request_ts: nowText() },
    warnings: [msg],
  };
}

// ---- Tool registry helpers ----

function buildToolList(): { name: string; description: string; inputSchema: Record<string, unknown> }[] {
  const tools: { name: string; description: string; inputSchema: Record<string, unknown> }[] = [];

  // Hand-written tools
  tools.push({ name: "sellfox_health_check", description: "检查赛狐环境变量、token 状态和基础连通性，不拉业务数据。", inputSchema: { type: "object", properties: {}, additionalProperties: false } });
  tools.push({ name: "sellfox_smoke_check", description: "对赛狐 API 做最小烟测：在线产品 → 订单 → 销售数据 → 评价。", inputSchema: { type: "object", properties: {}, additionalProperties: false } });
  tools.push({ name: "sellfox_online_products", description: "获取在线产品信息（Listing/SKU维度），支持按店铺、ASIN、SKU搜索。", inputSchema: buildJSONSchema({
    shopIds: { type: "array", items: { type: "string" } },
    searchType: { type: "string", enum: ["asin", "sellerSku", "title"] },
    searchContent: { type: "string" },
    dateType: { type: "string", enum: ["updateDateTime", "createDateTime"] },
    dateStart: { type: "string" }, dateEnd: { type: "string" },
  }, []) });
  tools.push({ name: "sellfox_store_sales", description: "获取产品销量数据，支持按 ASIN/MSKU/SKU 维度汇总。", inputSchema: buildJSONSchema({
    startDate: { type: "string" }, endDate: { type: "string" },
    groupType: { type: "string", enum: ["asin", "parentAsin", "msku", "sku"] },
    saleType: { type: "string", enum: ["productNum", "orderNum", "salePrice"] },
    shopIds: { type: "array", items: { type: "string" } },
    searchType: { type: "string", enum: ["asin", "parentAsin", "msku", "sku"] },
    searchContents: { type: "array", items: { type: "string" } },
    statTimeType: { type: "integer", description: "1=日, 2=周, 4=月" },
    currency: { type: "string" },
  }, ["startDate", "endDate"]) });
  tools.push({ name: "sellfox_orders", description: "订单列表查询，支持按时间、店铺、状态、发货方式等筛选。", inputSchema: buildJSONSchema({
    shopIds: { type: "array", items: { type: "string" } },
    dateType: { type: "string", enum: ["updateDateTime", "createDateTime", "purchase"] },
    dateStart: { type: "string" }, dateEnd: { type: "string" },
    orderStatus: { type: "string", enum: ["PendingAvailability", "Pending", "Unshipped", "PartiallyShipped", "Shipped", "InvoiceUnconfirmed", "Canceled", "Unfulfillable"] },
    fulfillment: { type: "string", enum: ["AFN", "MFN"] },
    searchType: { type: "string", enum: ["amazonOrderId", "buyerEmail"] },
    searchContent: { type: "string" }, currency: { type: "string" },
  }, []) });
  tools.push({ name: "sellfox_ad_report_create", description: "创建赛狐广告下载任务（天维度报告）。", inputSchema: buildJSONSchema({
    shopIds: { type: "array", items: { type: "string" } },
    adTypeCode: { type: "string", enum: ["sp", "sb", "sd"] },
    reportTypeCode: { type: "string", enum: ["adCampaignReport", "adGroupReport", "adProductReport", "adSpaceReport", "adTargeringReport", "adSearchTermReport", "adPurchasedItemReport", "amazonBusinessReport", "adCampaignMatchedTargetReport", "sdTargetListReport"] },
    timeUnit: { type: "string", enum: ["daily", "summary"] },
    reportStartDate: { type: "string" }, reportEndDate: { type: "string" },
  }, ["shopIds", "adTypeCode", "reportTypeCode", "timeUnit", "reportStartDate", "reportEndDate"]) });
  tools.push({ name: "sellfox_ad_report_query", description: "查询广告报告下载进度。", inputSchema: buildJSONSchema({ taskId: { type: "string" } }, ["taskId"]) });
  tools.push({ name: "sellfox_ad_report_download", description: "下载并解析广告报告文件。", inputSchema: buildJSONSchema({ url: { type: "string" } }, ["url"]) });
  tools.push({ name: "sellfox_seller_lists", description: "查询亚马逊已授权店铺列表。", inputSchema: { type: "object", properties: {}, additionalProperties: false } });

  // Endpoint spec tools
  for (const spec of ALL_ENDPOINT_SPECS) {
    const props: Record<string, unknown> = {};
    const required: string[] = [];
    for (const arg of spec.args) {
      const prop: Record<string, unknown> = {};
      if (arg.arg_type === "integer") prop["type"] = "integer";
      else if (arg.arg_type === "boolean") prop["type"] = "boolean";
      else if (arg.arg_type === "array_string") { prop["type"] = "array"; prop["items"] = { type: "string" }; }
      else if (arg.arg_type === "array_integer") { prop["type"] = "array"; prop["items"] = { type: "integer" }; }
      else { prop["type"] = "string"; if (arg.enum) prop["enum"] = arg.enum; }
      if (arg.description) prop["description"] = arg.description;
      props[arg.name] = prop;
      if (arg.required) required.push(arg.name);
    }
    const schema: Record<string, unknown> = { type: "object", properties: props, additionalProperties: false };
    if (required.length > 0) schema["required"] = required;
    tools.push({ name: spec.tool_name, description: spec.description, inputSchema: schema });
  }

  return tools;
}

function buildJSONSchema(properties: Record<string, unknown>, required: string[]): Record<string, unknown> {
  const schema: Record<string, unknown> = { type: "object", properties, additionalProperties: false };
  if (required.length > 0) schema["required"] = required;
  return schema;
}

const TOOL_LIST = buildToolList();

function toolsList() {
  return TOOL_LIST;
}

// ---- Tool execution ----

function listifyStrings(value: unknown): string[] {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

function requiredText(args: Record<string, unknown>, key: string): string {
  const value = String(args[key] ?? "").trim();
  if (!value) throw new Error(`缺少必要参数: ${key}`);
  return value;
}

function optionalInt(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (value == null || value === "") return undefined;
  return Number(value);
}

async function callTool(app: SellfoxMCPApplication, name: string, args: Record<string, unknown>, apiKey?: string): Promise<Record<string, unknown>> {
  const svc = app.service;

  switch (name) {
    case "sellfox_health_check":
      return toolResult(svc.healthCheck() as unknown as Record<string, unknown>);
    case "sellfox_smoke_check":
      return toolResult((await svc.smokeCheck()) as unknown as Record<string, unknown>);
    case "sellfox_online_products":
      return toolResult((await svc.onlineProducts({
        shop_ids: listifyStrings(args["shopIds"]) as string[] | null,
        search_type: String(args["searchType"] ?? "").trim() || null,
        search_content: String(args["searchContent"] ?? "").trim() || null,
        date_type: String(args["dateType"] ?? "").trim() || null,
        date_start: String(args["dateStart"] ?? "").trim() || null,
        date_end: String(args["dateEnd"] ?? "").trim() || null,
      })) as unknown as Record<string, unknown>);
    case "sellfox_store_sales":
      return toolResult((await svc.storeSales({
        start_date: requiredText(args, "startDate"),
        end_date: requiredText(args, "endDate"),
        group_type: String(args["groupType"] ?? "asin").trim(),
        sale_type: String(args["saleType"] ?? "productNum").trim(),
        shop_ids: listifyStrings(args["shopIds"]) as string[] | null,
        search_type: String(args["searchType"] ?? "").trim() || null,
        search_content: listifyStrings(args["searchContents"]) as string[] | null,
        stat_time_type: optionalInt(args, "statTimeType") ?? 1,
        currency: String(args["currency"] ?? "").trim() || null,
      })) as unknown as Record<string, unknown>);
    case "sellfox_orders":
      return toolResult((await svc.orders({
        shop_ids: listifyStrings(args["shopIds"]) as string[] | null,
        date_type: String(args["dateType"] ?? "purchase").trim(),
        date_start: String(args["dateStart"] ?? "").trim() || null,
        date_end: String(args["dateEnd"] ?? "").trim() || null,
        order_status: String(args["orderStatus"] ?? "").trim() || null,
        fulfillment: String(args["fulfillment"] ?? "").trim() || null,
        search_type: String(args["searchType"] ?? "").trim() || null,
        search_content: String(args["searchContent"] ?? "").trim() || null,
        currency: String(args["currency"] ?? "").trim() || null,
      })) as unknown as Record<string, unknown>);
    case "sellfox_ad_report_create":
      return toolResult((await svc.adReportCreate({
        shop_ids: listifyStrings(args["shopIds"]) as string[],
        ad_type_code: requiredText(args, "adTypeCode"),
        report_type_code: requiredText(args, "reportTypeCode"),
        time_unit: requiredText(args, "timeUnit"),
        report_start_date: requiredText(args, "reportStartDate"),
        report_end_date: requiredText(args, "reportEndDate"),
      })) as unknown as Record<string, unknown>);
    case "sellfox_ad_report_query":
      return toolResult((await svc.adReportQuery(requiredText(args, "taskId"))) as unknown as Record<string, unknown>);
    case "sellfox_ad_report_download":
      return toolResult((await svc.adReportDownload(requiredText(args, "url"))) as unknown as Record<string, unknown>);
    case "sellfox_seller_lists": {
      const result = await svc.sellerLists();
      if (apiKey && app.apiKeyMgr && !(await app.apiKeyMgr.isAdmin(apiKey))) {
        const allowedIds = await app.apiKeyMgr.getAuthorizedShopIds(apiKey);
        const data = result.data as Record<string, unknown>[] | undefined;
        if (data) {
          result.data = data.filter((shop) => allowedIds.has(String(shop["shopId"] ?? "")));
        }
      }
      return toolResult(result as unknown as Record<string, unknown>);
    }
    default: {
      const spec = ENDPOINT_SPECS_BY_NAME[name];
      if (spec) {
        try {
          const result = await svc.runEndpointSpec(name, args);
          return toolResult(result as unknown as Record<string, unknown>);
        } catch (err) {
          return toolResult(toolErrorPayload(err), true);
        }
      }
      return toolResult(toolErrorPayload(new Error(`未知工具: ${name}`)), true);
    }
  }
}

// ---- Main ----

async function main(): Promise<void> {
  loadEnvFile();
  setupLogging();

  const host = process.env["SELLFOX_MCP_HOST"] ?? "127.0.0.1";
  const port = parseInt(process.env["SELLFOX_MCP_PORT"] ?? "8099", 10);
  const bearerToken = process.env["SELLFOX_MCP_BEARER_TOKEN"] ?? "";
  const tokensFile = process.env["SELLFOX_MCP_TOKENS_FILE"] ?? "";

  const app = await SellfoxMCPApplication.create();
  const auth = loadBearerAuthConfig({ bootstrap_token: bearerToken, tokens_file: tokensFile });

  const server = http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res, app, auth);
    } catch (err) {
      if (!res.headersSent) sendJSON(res, 500, { error: "internal_error", message: String(err) });
    }
  });

  server.listen(port, host, () => {
    const display = host === "" || host === "0.0.0.0" ? "localhost" : host;
    const base = `http://${display}:${port}`;
    console.log(`\n========================================================`);
    console.log(`  Sellfox MCP HTTP Gateway 已启动`);
    console.log(`========================================================`);
    console.log(`  后台管理:  ${base}/admin`);
    console.log(`  MCP 端点:  ${base}/mcp`);
    console.log(`  健康检查:  ${base}/healthz`);
    console.log(`  鉴权模式:  ${JSON.stringify(authSummary(auth))}`);
    console.log(`========================================================\n`);
  });
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  app: SellfoxMCPApplication,
  auth: BearerAuthConfig,
): Promise<void> {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers["host"] ?? "localhost"}`);
  const path = url.pathname;

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse body
  const body = await readBody(req);

  // Health check
  if (method === "GET" && path === "/healthz") {
    sendJSON(res, 200, { ok: true, server: SERVER_NAME, version: SERVER_VERSION, auth: authSummary(auth) });
    return;
  }

  // Auth
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers[key] = Array.isArray(value) ? value[0] ?? "" : value;
    else headers[key] = "";
  }
  let authorization = headers["authorization"] ?? "";
  let rawKey = "";
  if (!authorization) {
    const paramKey = url.searchParams.get("key") ?? url.searchParams.get("token");
    if (paramKey) { authorization = `Bearer ${paramKey}`; rawKey = paramKey; }
  }
  if (authorization.startsWith("Bearer ")) {
    rawKey = authorization.slice("Bearer ".length).trim();
  }
  if (!rawKey) {
    rawKey = url.searchParams.get("key") ?? url.searchParams.get("token") ?? "";
  }

  let match: AuthMatch | null = authenticateHeader(auth, authorization);
  if (!match && app.apiKeyMgr && rawKey) {
    if (await app.apiKeyMgr.keyExists(rawKey)) {
      match = { mode: "api_key", token_id: rawKey.slice(0, 12), description: "api_key" };
    }
  }
  if (!match) {
    sendJSON(res, 401, { error: "missing_or_invalid_bearer", message: "需要 Authorization: Bearer <token> 或 ?key=<token>。" });
    return;
  }

  // Admin routes
  if (path === "/admin" && method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(ADMIN_HTML);
    return;
  }

  if (path.startsWith("/admin/api/credentials")) {
    if (!app.pool) { sendJSON(res, 503, { ok: false, error: "凭据池未启用" }); return; }
    const { status, payload } = await handleAdminApi(app.pool, method, path, body);
    sendJSON(res, status, payload);
    return;
  }

  if (path.startsWith("/admin/api/keys") || path === "/admin/api/shops") {
    if (!app.apiKeyMgr) { sendJSON(res, 503, { ok: false, error: "密钥管理未启用" }); return; }
    const { status, payload } = await handleKeyAdminApi(
      app.apiKeyMgr,
      { sellerLists: () => app.service.sellerLists().then((r) => ({ data: (r.data ?? []) as Record<string, unknown>[] })) },
      method, path, body,
    );
    sendJSON(res, status, payload);
    return;
  }

  // MCP routes
  if (path !== "/mcp") { sendJSON(res, 404, { error: "not_found" }); return; }

  if (method === "GET") {
    sendJSON(res, 200, {
      ok: true, protocolVersion: "2024-11-05",
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      capabilities: { tools: { listChanged: false } },
      auth: { mode: match.mode, token_id: match.token_id },
    });
    return;
  }

  if (method === "POST") {
    let request: Record<string, unknown>;
    try { request = JSON.parse(body ? body.toString("utf-8") : "{}") as Record<string, unknown>; }
    catch { sendJSON(res, 400, { error: "invalid_json" }); return; }

    // Shop permission enforcement
    if (app.apiKeyMgr && rawKey) {
      const isAdmin = await app.apiKeyMgr.isAdmin(rawKey);
      if (request["method"] === "tools/call") {
        const params = (request["params"] ?? {}) as Record<string, unknown>;
        const toolName = String(params["name"] ?? "");
        const toolArgs = { ...(params["arguments"] ?? {}) } as Record<string, unknown>;
        const toolEntry = TOOL_LIST.find((t) => t.name === toolName);
        const { allowed, error_message, modified_args } = await resolveShopIdsForCall(
          app.apiKeyMgr, rawKey, toolArgs, toolEntry?.inputSchema ?? null,
        );
        console.log("[shop-permission] tool=%s rawKey=%s admin=%s allowed=%s hasModified=%s error=%s",
          toolName, rawKey.slice(0, 16), isAdmin, allowed, Boolean(modified_args), error_message ?? "");
        if (!allowed) { sendJSON(res, 403, { error: "shop_permission_denied", message: error_message }); return; }
        if (modified_args) {
          request = { ...request, params: { ...params, arguments: modified_args } };
        }
      } else {
        console.log("[shop-permission] method=%s (not tools/call), rawKey=%s admin=%s",
          request["method"], rawKey.slice(0, 16), isAdmin);
      }
    } else {
      console.log("[shop-permission] SKIP apiKeyMgr=%s rawKey=%s",
        Boolean(app.apiKeyMgr), rawKey.slice(0, 16));
    }

    const jsonRpcResult = await handleMCPJsonRpc(app, request, rawKey);
    if (jsonRpcResult === null) { sendJSON(res, 202, { ok: true }); return; }
    sendJSON(res, 200, jsonRpcResult);
    return;
  }

  sendJSON(res, 405, { error: "method_not_allowed" });
}

async function handleMCPJsonRpc(
  app: SellfoxMCPApplication,
  request: Record<string, unknown>,
  apiKey?: string,
): Promise<Record<string, unknown> | null> {
  const method = request["method"];
  const id = request["id"] ?? null;
  const params = (request["params"] ?? {}) as Record<string, unknown>;

  function result(id: unknown, r: unknown): Record<string, unknown> {
    return { jsonrpc: "2.0", id, result: r };
  }
  function rpcError(id: unknown, code: number, message: string): Record<string, unknown> {
    return { jsonrpc: "2.0", id, error: { code, message } };
  }

  if (method === "notifications/initialized") return null;
  if (method === "initialize") {
    return result(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
  }
  if (method === "ping") return result(id, {});
  if (method === "tools/list") return result(id, { tools: toolsList() });
  if (method === "resources/list") return result(id, { resources: [] });
  if (method === "prompts/list") return result(id, { prompts: [] });

  if (method === "tools/call") {
    const toolName = String(params["name"] ?? "").trim();
    const toolArgs = (params["arguments"] ?? {}) as Record<string, unknown>;
    try {
      const toolOut = await callTool(app, toolName, toolArgs, apiKey);
      return result(id, toolOut);
    } catch (err) {
      return result(id, toolResult(toolErrorPayload(err), true));
    }
  }

  if (id === null || id === undefined) return null;
  return rpcError(id, -32601, `Method not found: ${method}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
