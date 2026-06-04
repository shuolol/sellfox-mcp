// ============================================================
// MCP server using @modelcontextprotocol/sdk — mirrors mcp.py
// ============================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SellfoxOpenAPIService } from "./services.js";
import { ALL_ENDPOINT_SPECS } from "./endpoint-specs.js";
import type { EndpointSpec } from "./types.js";
import { SellfoxClientError } from "./errors.js";
import { ApiKeyManager } from "./api-key-manager.js";
import { CredentialPool } from "./credential-pool.js";
import { loadEnvFile, setupLogging } from "./client.js";
import { SHOP_PARAM_NAMES } from "./shop-permission.js";
import { initSchema, getPool } from "./db.js";

export const SERVER_NAME = "sellfox-openapi";
export const SERVER_VERSION = "0.1.0";

// ---- Helpers ----

function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function nowText(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function optionalInt(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (value == null || value === "") return undefined;
  return Number(value);
}

function requiredText(args: Record<string, unknown>, key: string): string {
  const value = String(args[key] ?? "").trim();
  if (!value) throw new Error(`缺少必要参数: ${key}`);
  return value;
}

function listifyStrings(value: unknown): string[] {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

function toolResult(payload: Record<string, unknown>, isError = false) {
  return {
    content: [{ type: "text" as const, text: jsonText(payload) }],
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

// ---- Pool / API Key Manager factory ----

async function createPoolFromEnv(): Promise<CredentialPool | null> {
  if (!process.env["DATABASE_URL"] && !process.env["PGHOST"]) return null;
  await initSchema();
  return new CredentialPool();
}

async function createApiKeyMgrFromEnv(): Promise<ApiKeyManager | null> {
  if (!process.env["DATABASE_URL"] && !process.env["PGHOST"]) return null;
  await initSchema();
  return new ApiKeyManager();
}

// ---- Zod schema builder from endpoint spec args ----

function argToZod(arg: { name: string; arg_type: string; required: boolean; description: string }): z.ZodType {
  let field: z.ZodType;
  switch (arg.arg_type) {
    case "integer":
      field = z.number().int();
      break;
    case "boolean":
      field = z.boolean();
      break;
    case "array_string":
      field = z.array(z.string());
      break;
    case "array_integer":
      field = z.array(z.number().int());
      break;
    default:
      field = z.string();
      break;
  }
  if (arg.description) field = field.describe(arg.description);
  if (!arg.required) field = field.optional();
  return field;
}

function buildZodObject(spec: EndpointSpec): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};
  for (const arg of spec.args) {
    shape[arg.name] = argToZod(arg);
  }
  return z.object(shape).strict();
}

// ---- Main application ----

export class SellfoxMCPApplication {
  readonly service: SellfoxOpenAPIService;
  readonly pool: CredentialPool | null;
  readonly apiKeyMgr: ApiKeyManager | null;
  readonly mcpServer: McpServer;
  /** All tools (both hand-written and endpoint specs) indexed by name */
  readonly toolDefs: Map<string, { description: string; inputSchema: Record<string, unknown>; handler: (args: Record<string, unknown>) => Promise<Record<string, unknown>> }> = new Map();

  constructor(
    service?: SellfoxOpenAPIService,
    pool?: CredentialPool | null,
    apiKeyMgr?: ApiKeyManager | null,
  ) {
    setupLogging();
    if (service) {
      this.service = service;
      this.pool = pool ?? null;
    } else {
      this.pool = pool ?? null;
      this.service = new SellfoxOpenAPIService(this.pool ? { credential_pool: this.pool } : {});
    }
    this.apiKeyMgr = apiKeyMgr ?? null;

    this.mcpServer = new McpServer({
      name: SERVER_NAME,
      version: SERVER_VERSION,
    });

    this._registerHandWrittenTools();
    this._registerEndpointSpecTools();
  }

  static async create(service?: SellfoxOpenAPIService): Promise<SellfoxMCPApplication> {
    setupLogging();
    const pool = await createPoolFromEnv();
    const apiKeyMgr = await createApiKeyMgrFromEnv();
    const svc = service ?? new SellfoxOpenAPIService(pool ? { credential_pool: pool } : {});
    return new SellfoxMCPApplication(svc, pool, apiKeyMgr);
  }

  private _registerHandWrittenTools(): void {
    const svc = this.service;

    // sellfox_health_check
    this.mcpServer.registerTool(
      "sellfox_health_check",
      {
        title: "健康检查",
        description: "检查赛狐环境变量、token 状态和基础连通性，不拉业务数据。",
        inputSchema: z.object({}).strict(),
      },
      async () => toolResult(svc.healthCheck() as unknown as Record<string, unknown>),
    );

    // sellfox_smoke_check
    this.mcpServer.registerTool(
      "sellfox_smoke_check",
      {
        title: "烟测检查",
        description: "对赛狐 API 做最小烟测：在线产品 → 订单 → 销售数据 → 评价。",
        inputSchema: z.object({}).strict(),
      },
      async () => {
        const result = await svc.smokeCheck();
        return toolResult(result as unknown as Record<string, unknown>);
      },
    );

    // sellfox_online_products
    const onlineProductsSchema = z.object({
      shopIds: z.array(z.string()).optional().describe("店铺ID列表"),
      searchType: z.enum(["asin", "sellerSku", "title"]).optional(),
      searchContent: z.string().optional(),
      dateType: z.enum(["updateDateTime", "createDateTime"]).optional(),
      dateStart: z.string().optional(),
      dateEnd: z.string().optional(),
    }).strict();

    this.mcpServer.registerTool(
      "sellfox_online_products",
      {
        title: "在线产品",
        description: "获取在线产品信息（Listing/SKU维度），支持按店铺、ASIN、SKU搜索。",
        inputSchema: onlineProductsSchema,
      },
      async (args) => {
        const result = await svc.onlineProducts({
          shop_ids: listifyStrings(args["shopIds"]) as string[] | null,
          search_type: String(args["searchType"] ?? "").trim() || null,
          search_content: String(args["searchContent"] ?? "").trim() || null,
          date_type: String(args["dateType"] ?? "").trim() || null,
          date_start: String(args["dateStart"] ?? "").trim() || null,
          date_end: String(args["dateEnd"] ?? "").trim() || null,
        });
        return toolResult(result as unknown as Record<string, unknown>);
      },
    );

    // sellfox_store_sales
    const storeSalesSchema = z.object({
      startDate: z.string().describe("开始时间 yyyy-MM-dd"),
      endDate: z.string().describe("结束时间 yyyy-MM-dd"),
      groupType: z.enum(["asin", "parentAsin", "msku", "sku"]).optional(),
      saleType: z.enum(["productNum", "orderNum", "salePrice"]).optional(),
      shopIds: z.array(z.string()).optional(),
      searchType: z.enum(["asin", "parentAsin", "msku", "sku"]).optional(),
      searchContents: z.array(z.string()).optional(),
      statTimeType: z.number().int().optional().describe("1=日, 2=周, 4=月"),
      currency: z.string().optional(),
    }).strict();

    this.mcpServer.registerTool(
      "sellfox_store_sales",
      {
        title: "产品销量",
        description: "获取产品销量数据，支持按 ASIN/MSKU/SKU 维度汇总。",
        inputSchema: storeSalesSchema,
      },
      async (args) => {
        const result = await svc.storeSales({
          start_date: requiredText(args, "startDate"),
          end_date: requiredText(args, "endDate"),
          group_type: String(args["groupType"] ?? "asin").trim(),
          sale_type: String(args["saleType"] ?? "productNum").trim(),
          shop_ids: listifyStrings(args["shopIds"]) as string[] | null,
          search_type: String(args["searchType"] ?? "").trim() || null,
          search_content: listifyStrings(args["searchContents"]) as string[] | null,
          stat_time_type: optionalInt(args, "statTimeType") ?? 1,
          currency: String(args["currency"] ?? "").trim() || null,
        });
        return toolResult(result as unknown as Record<string, unknown>);
      },
    );

    // sellfox_orders
    const ordersSchema = z.object({
      shopIds: z.array(z.string()).optional(),
      dateType: z.enum(["updateDateTime", "createDateTime", "purchase"]).optional(),
      dateStart: z.string().optional().describe("yyyy-MM-dd HH:mm:ss"),
      dateEnd: z.string().optional().describe("yyyy-MM-dd HH:mm:ss"),
      orderStatus: z.enum([
        "PendingAvailability", "Pending", "Unshipped", "PartiallyShipped",
        "Shipped", "InvoiceUnconfirmed", "Canceled", "Unfulfillable",
      ]).optional(),
      fulfillment: z.enum(["AFN", "MFN"]).optional(),
      searchType: z.enum(["amazonOrderId", "buyerEmail"]).optional(),
      searchContent: z.string().optional(),
      currency: z.string().optional(),
    }).strict();

    this.mcpServer.registerTool(
      "sellfox_orders",
      {
        title: "订单列表",
        description: "订单列表查询，支持按时间、店铺、状态、发货方式等筛选。",
        inputSchema: ordersSchema,
      },
      async (args) => {
        const result = await svc.orders({
          shop_ids: listifyStrings(args["shopIds"]) as string[] | null,
          date_type: String(args["dateType"] ?? "purchase").trim(),
          date_start: String(args["dateStart"] ?? "").trim() || null,
          date_end: String(args["dateEnd"] ?? "").trim() || null,
          order_status: String(args["orderStatus"] ?? "").trim() || null,
          fulfillment: String(args["fulfillment"] ?? "").trim() || null,
          search_type: String(args["searchType"] ?? "").trim() || null,
          search_content: String(args["searchContent"] ?? "").trim() || null,
          currency: String(args["currency"] ?? "").trim() || null,
        });
        return toolResult(result as unknown as Record<string, unknown>);
      },
    );

    // sellfox_ad_report_create
    const adReportCreateSchema = z.object({
      shopIds: z.array(z.string()),
      adTypeCode: z.enum(["sp", "sb", "sd"]),
      reportTypeCode: z.enum([
        "adCampaignReport", "adGroupReport", "adProductReport", "adSpaceReport",
        "adTargeringReport", "adSearchTermReport", "adPurchasedItemReport",
        "amazonBusinessReport", "adCampaignMatchedTargetReport", "sdTargetListReport",
      ]),
      timeUnit: z.enum(["daily", "summary"]),
      reportStartDate: z.string().describe("yyyy-MM-dd"),
      reportEndDate: z.string().describe("yyyy-MM-dd"),
    }).strict();

    this.mcpServer.registerTool(
      "sellfox_ad_report_create",
      {
        title: "创建广告报告",
        description: "创建赛狐广告下载任务（天维度报告）。返回 taskId，需配合 sellfox_ad_report_query 轮询进度。",
        inputSchema: adReportCreateSchema,
      },
      async (args) => {
        const result = await svc.adReportCreate({
          shop_ids: listifyStrings(args["shopIds"]) as string[],
          ad_type_code: requiredText(args, "adTypeCode"),
          report_type_code: requiredText(args, "reportTypeCode"),
          time_unit: requiredText(args, "timeUnit"),
          report_start_date: requiredText(args, "reportStartDate"),
          report_end_date: requiredText(args, "reportEndDate"),
        });
        return toolResult(result as unknown as Record<string, unknown>);
      },
    );

    // sellfox_ad_report_query
    this.mcpServer.registerTool(
      "sellfox_ad_report_query",
      {
        title: "查询广告报告进度",
        description: "查询广告报告下载进度。完成后可下载 CSV/JSON。",
        inputSchema: z.object({ taskId: z.string() }).strict(),
      },
      async (args) => {
        const result = await svc.adReportQuery(requiredText(args, "taskId"));
        return toolResult(result as unknown as Record<string, unknown>);
      },
    );

    // sellfox_ad_report_download
    this.mcpServer.registerTool(
      "sellfox_ad_report_download",
      {
        title: "下载广告报告",
        description: "下载并解析广告报告文件。输入 sellfox_ad_report_query 返回的下载链接。",
        inputSchema: z.object({ url: z.string() }).strict(),
      },
      async (args) => {
        const result = await svc.adReportDownload(requiredText(args, "url"));
        return toolResult(result as unknown as Record<string, unknown>);
      },
    );

    // sellfox_seller_lists
    this.mcpServer.registerTool(
      "sellfox_seller_lists",
      {
        title: "店铺列表",
        description: "查询亚马逊已授权店铺列表（sid/名称/站点/区域/状态）。",
        inputSchema: z.object({}).strict(),
      },
      async () => {
        const result = await svc.sellerLists();
        return toolResult(result as unknown as Record<string, unknown>);
      },
    );
  }

  private _registerEndpointSpecTools(): void {
    const svc = this.service;
    const apiKeyMgr = this.apiKeyMgr;

    // Pre-compute: which specs have shop-related params
    const specHasShopParam = new Map<string, string>();
    for (const spec of ALL_ENDPOINT_SPECS) {
      for (const arg of spec.args) {
        if (SHOP_PARAM_NAMES.includes(arg.name)) {
          specHasShopParam.set(spec.tool_name, arg.name);
          break;
        }
      }
    }

    // Lazily-populated shop ID cache for stdio mode (no per-request API key)
    let cachedShopIds: string[] | null = null;

    for (const spec of ALL_ENDPOINT_SPECS) {
      const zodSchema = buildZodObject(spec);

      this.mcpServer.registerTool(
        spec.tool_name,
        {
          title: spec.tool_name,
          description: spec.description,
          inputSchema: zodSchema,
        },
        async (args: Record<string, unknown>) => {
          try {
            const injectArgs: Record<string, unknown> = {};

            // Auto-inject shop IDs when apiKeyMgr is configured and user didn't provide them
            const shopParamName = specHasShopParam.get(spec.tool_name);
            if (shopParamName && apiKeyMgr) {
              const userShopIds = args[shopParamName];
              if (userShopIds == null || userShopIds === "" || (Array.isArray(userShopIds) && userShopIds.length === 0)) {
                // Try API key manager's cached shops first
                if (cachedShopIds === null) {
                  const cached = await apiKeyMgr.getCachedShops();
                  cachedShopIds = cached.length > 0 ? cached.map((s) => String(s["shop_id"] ?? "")).filter(Boolean) : [];
                }
                if (cachedShopIds.length > 0) {
                  injectArgs[shopParamName] = cachedShopIds;
                }
              }
            }

            const result = await svc.runEndpointSpec(spec.tool_name, args, Object.keys(injectArgs).length > 0 ? injectArgs : undefined);
            return toolResult(result as unknown as Record<string, unknown>);
          } catch (err) {
            return toolResult(toolErrorPayload(err), true);
          }
        },
      );
    }
  }

  // ---- Stdio transport ----

  async runStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);
  }
}

// ---- Standalone stdio entry ----

export async function runStdioServer(app?: SellfoxMCPApplication): Promise<void> {
  loadEnvFile();
  const application = app ?? (await SellfoxMCPApplication.create());
  await application.runStdio();
  // Keep the process alive (stdio transport keeps it open)
  await new Promise(() => {});
}
