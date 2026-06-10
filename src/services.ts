// ============================================================
// Business-oriented service layer — mirrors services.py
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";
import { SellfoxOpenAPIClient, DEFAULT_TOKEN_CACHE, loadEnvFile, extractPathValue } from "./client.js";
import { ALL_ENDPOINT_SPECS, ENDPOINT_SPECS_BY_NAME } from "./endpoint-specs.js";
import type { EndpointSpec } from "./types.js";
import { SellfoxClientError, SellfoxConfigError } from "./errors.js";
import type { CredentialPool } from "./credential-pool.js";
import { getTimezoneName } from "./timezones.js";

function nowText(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function listifyStrings(values: unknown): string[] {
  if (values == null || values === "") return [];
  if (Array.isArray(values)) return values.map(String);
  return [String(values)];
}

const REGION_CODE_MAP: Record<string, string> = {
  US: "na", CA: "na", MX: "na", BR: "na",
  ES: "eu", UK: "eu", FR: "eu", BE: "eu",
  NL: "eu", DE: "eu", IT: "eu", SE: "eu",
  ZA: "eu", PL: "eu", EG: "eu", TR: "eu",
  SA: "eu", AE: "eu", IN: "eu",
  SG: "fe", AU: "fe", JP: "fe",
};

function parseISODate(value: string): Date {
  return new Date(value + "T00:00:00");
}

function isoDayRange(startDate: string, endDate: string): string[] {
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  const days: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    days.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

export interface SellfoxResult {
  ok: boolean;
  data: unknown;
  meta: Record<string, unknown>;
  warnings: string[];
}

function makeResult(opts: {
  data: unknown;
  endpoint: string;
  page_count?: number;
  warnings?: string[];
  extra_meta?: Record<string, unknown>;
  ok?: boolean;
}): SellfoxResult {
  const meta: Record<string, unknown> = {
    endpoint: opts.endpoint,
    page_count: opts.page_count ?? 1,
    request_ts: nowText(),
  };
  if (opts.extra_meta) Object.assign(meta, opts.extra_meta);
  return {
    ok: opts.ok ?? true,
    data: opts.data,
    meta,
    warnings: opts.warnings ?? [],
  };
}

export class SellfoxOpenAPIService {
  private _client: SellfoxOpenAPIClient | null;
  private _pool: CredentialPool | null;

  constructor(options?: { client?: SellfoxOpenAPIClient; credential_pool?: CredentialPool | null }) {
    this._client = options?.client ?? null;
    this._pool = options?.credential_pool ?? null;
  }

  get client(): SellfoxOpenAPIClient {
    if (!this._client) {
      this._client = new SellfoxOpenAPIClient(this._pool ? { credential_pool: this._pool } : {});
    }
    return this._client;
  }

  // ---- Health check ----

  async healthCheck(): Promise<SellfoxResult> {
    loadEnvFile();
    const envStatus = {
      SELLFOX_CLIENT_ID: Boolean((process.env["SELLFOX_CLIENT_ID"] ?? "").trim()),
      SELLFOX_CLIENT_SECRET: Boolean((process.env["SELLFOX_CLIENT_SECRET"] ?? "").trim()),
      SELLFOX_TOKEN_CACHE_FILE: Boolean((process.env["SELLFOX_TOKEN_CACHE_FILE"] ?? "").trim()),
      SELLFOX_MCP_BEARER_TOKEN: Boolean((process.env["SELLFOX_MCP_BEARER_TOKEN"] ?? "").trim()),
    };
    const cachePath = (process.env["SELLFOX_TOKEN_CACHE_FILE"] ?? "").trim()
      ? path.resolve(process.env["SELLFOX_TOKEN_CACHE_FILE"]!.trim())
      : DEFAULT_TOKEN_CACHE;
    const cachedExists = fs.existsSync(cachePath);
    const data: Record<string, unknown> = {
      env: envStatus,
      token_cache: { path: cachePath, exists: cachedExists },
      connectivity: { auth_ok: false, message: "未执行" },
    };
    const warnings: string[] = [];
    let ok = envStatus["SELLFOX_CLIENT_ID"] && envStatus["SELLFOX_CLIENT_SECRET"];

    // Health check is synchronous — token check is read-only from cache
    if (ok) {
      const cached = await this.client.getCachedToken();
      if (cached) {
        data["token_cache"] = { ...(data["token_cache"] as Record<string, unknown>), expires_at: cached.expires_at };
      }
      data["connectivity"] = {
        auth_ok: true,
        message: "token cache check (sync)",
      };
    } else {
      warnings.push("缺少赛狐 Client ID 或 Client Secret，无法完成鉴权连通性检查。");
    }

    return makeResult({ data, endpoint: "/api/oauth/v2/token.json", warnings, extra_meta: { mode: "health_check" }, ok });
  }

  // ---- Seller lists (sync wrapper — fetches via paged post) ----
  // Note: Python version is synchronous because urllib is sync.
  // Node fetch is async, so these become async methods.

  async sellerLists(): Promise<SellfoxResult> {
    const endpoint = "/api/shop/pageList.json";
    const page = await this.client.pagedPostDetailed(endpoint, {});
    const shops: Record<string, unknown>[] = [];
    for (const row of page.rows) {
      const shopId = String(row["id"] ?? "");
      if (!shopId) continue;
      shops.push({
        shopId: shopId,
        shopName: String(row["name"] ?? ""),
        marketplaceId: String(row["marketplaceId"] ?? ""),
        region: String(row["region"] ?? ""),
        sellerId: String(row["sellerId"] ?? ""),
        adStatus: String(row["adStatus"] ?? ""),
        status: String(row["status"] ?? ""),
      });
    }
    return makeResult({ data: shops, endpoint, page_count: page.page_count });
  }

  async storeSales(opts: {
    start_date: string;
    end_date: string;
    group_type?: string;
    sale_type?: string;
    shop_ids?: string[] | null;
    search_type?: string | null;
    search_content?: string[] | null;
    stat_time_type?: number;
    currency?: string | null;
  }): Promise<SellfoxResult> {
    const endpoint = "/api/productSale/page.json";
    const body: Record<string, unknown> = {
      type: opts.sale_type ?? "productNum",
      groupType: opts.group_type ?? "asin",
      startDate: opts.start_date,
      endDate: opts.end_date,
      statTimeType: opts.stat_time_type ?? 1,
    };
    if (opts.shop_ids) body["shopIdList"] = opts.shop_ids;
    if (opts.search_type && opts.search_content) {
      body["searchType"] = opts.search_type;
      body["searchContentList"] = opts.search_content;
    }
    if (opts.currency) body["currency"] = opts.currency;
    const page = await this.client.pagedPostDetailed(endpoint, body);
    return makeResult({ data: page.rows, endpoint, page_count: page.page_count });
  }

  async orders(opts: {
    shop_ids?: string[] | null;
    date_type?: string;
    date_start?: string | null;
    date_end?: string | null;
    order_status?: string | null;
    fulfillment?: string | null;
    search_type?: string | null;
    search_content?: string | null;
    currency?: string | null;
  }): Promise<SellfoxResult> {
    const endpoint = "/api/order/pageList.json";
    const body: Record<string, unknown> = { dateType: opts.date_type ?? "purchase" };
    if (opts.shop_ids) body["shopIdList"] = opts.shop_ids;
    if (opts.date_start) body["dateStart"] = opts.date_start;
    if (opts.date_end) body["dateEnd"] = opts.date_end;
    if (opts.order_status) body["orderStatus"] = opts.order_status;
    if (opts.fulfillment) body["fulfillment"] = opts.fulfillment;
    if (opts.search_type) body["searchType"] = opts.search_type;
    if (opts.search_content) body["searchContent"] = opts.search_content;
    if (opts.currency) body["currency"] = opts.currency;
    const page = await this.client.pagedPostDetailed(endpoint, body);
    return makeResult({ data: page.rows, endpoint, page_count: page.page_count });
  }

  async onlineProducts(opts: {
    shop_ids?: string[] | null;
    search_type?: string | null;
    search_content?: string | null;
    date_type?: string | null;
    date_start?: string | null;
    date_end?: string | null;
  }): Promise<SellfoxResult> {
    const endpoint = "/api/order/api/product/pageList.json";
    const body: Record<string, unknown> = {};
    if (opts.shop_ids) body["shopIdList"] = opts.shop_ids;
    if (opts.search_type) body["searchType"] = opts.search_type;
    if (opts.search_content) body["searchContent"] = opts.search_content;
    if (opts.date_type) body["dateType"] = opts.date_type;
    if (opts.date_start) body["dateStart"] = opts.date_start;
    if (opts.date_end) body["dateEnd"] = opts.date_end;
    const page = await this.client.pagedPostDetailed(endpoint, body);
    return makeResult({ data: page.rows, endpoint, page_count: page.page_count });
  }

  private _buildSpecBody(spec: EndpointSpec, args: Record<string, unknown>, injectArgs?: Record<string, unknown>): Record<string, unknown> {
    const body: Record<string, unknown> = { ...spec.defaults };
    for (const arg of spec.args) {
      let value: unknown = undefined;
      if (injectArgs && arg.name in injectArgs) {
        value = injectArgs[arg.name];
      } else {
        value = args[arg.name] ?? arg.default;
      }
      if (value == null || value === "") continue;
      if (arg.arg_type === "array_string" || arg.arg_type === "array_integer") {
        body[arg.name] = listifyStrings(value);
      } else if (arg.arg_type === "integer") {
        body[arg.name] = Number(value);
      } else if (arg.arg_type === "boolean") {
        body[arg.name] = Boolean(value);
      } else {
        body[arg.name] = value;
      }
    }
    return body;
  }

  async runEndpointSpec(toolName: string, args: Record<string, unknown>, injectArgs?: Record<string, unknown>): Promise<SellfoxResult> {
    const spec = ENDPOINT_SPECS_BY_NAME[toolName];
    if (!spec) throw new SellfoxConfigError(`未知 endpoint spec: ${toolName}`);
    const body = this._buildSpecBody(spec, args, injectArgs);

    if (spec.result_kind === "object" || spec.pagination_mode === "none") {
      const payload = await this.client.postJSON(spec.endpoint, body, undefined, spec.headers);
      const data = extractPathValue(payload, spec.data_path);
      return makeResult({ data, endpoint: spec.endpoint, extra_meta: { docs_path: spec.docs_path } });
    }

    const page = await this.client.pagedPostDetailed(spec.endpoint, body, {
      page_size: spec.page_size,
      data_path: spec.data_path,
      total_path: spec.total_path,
      next_token_path: spec.next_token_path,
      pagination_mode: spec.pagination_mode,
      extra_headers: spec.headers,
      max_pages: 5, // <--- 加上这行，强制最多只拉取 5 页
    });
    return makeResult({
      data: page.rows,
      endpoint: spec.endpoint,
      page_count: page.page_count,
      extra_meta: { docs_path: spec.docs_path },
    });
  }

  async adReportCreate(opts: {
    shop_ids: string[];
    ad_type_code: string;
    report_type_code: string;
    time_unit: string;
    report_start_date: string;
    report_end_date: string;
  }): Promise<SellfoxResult> {
    const endpoint = "/api/cpc/download/createTask.json";
    const body = {
      shopIds: opts.shop_ids,
      adTypeCode: opts.ad_type_code,
      reportTypeCode: opts.report_type_code,
      timeUnit: opts.time_unit,
      reportStartDate: opts.report_start_date,
      reportEndDate: opts.report_end_date,
    };
    const payload = await this.client.postJSON(endpoint, body);
    return makeResult({ data: payload["data"] ?? {}, endpoint });
  }

  async adReportQuery(taskId: string): Promise<SellfoxResult> {
    const endpoint = "/api/cpc/download/queryProgress.json";
    const payload = await this.client.postJSON(endpoint, { taskId });
    return makeResult({ data: payload["data"] ?? {}, endpoint });
  }

  async adReportDownload(url: string): Promise<SellfoxResult> {
    const downloaded = await this.client.downloadFile(url);
    return makeResult({
      data: {
        url: downloaded.url,
        final_url: downloaded.final_url,
        filename: downloaded.filename,
        content_type: downloaded.content_type,
        size: downloaded.size,
        parsed_format: downloaded.parsed_format,
        data: downloaded.data,
        warnings: downloaded.warnings,
      },
      endpoint: "ad_report_download",
      warnings: downloaded.warnings,
    });
  }

  async smokeCheck(): Promise<SellfoxResult> {
    const warnings: string[] = [];
    const health = await this.healthCheck();
    if (!health.ok) throw new SellfoxClientError("health_check 未通过，中止烟测", { endpoint: "smoke_check" });

    const today = new Date().toISOString().slice(0, 10);
    const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    let productsOk = true;
    let productsData: Record<string, unknown>[] = [];
    try {
      const page = await this.client.pagedPostDetailed("/api/order/api/product/pageList.json", {}, { max_pages: 1 });
      productsData = page.rows;
    } catch (err) {
      warnings.push(`在线产品查询失败: ${err instanceof Error ? err.message : String(err)}`);
      productsOk = false;
    }

    let ordersOk = true;
    let ordersData: Record<string, unknown>[] = [];
    try {
      const page = await this.client.pagedPostDetailed(
        "/api/order/pageList.json",
        { dateType: "purchase", dateStart: `${lastWeek} 00:00:00`, dateEnd: `${today} 23:59:59` },
        { max_pages: 1 },
      );
      ordersData = page.rows;
    } catch (err) {
      warnings.push(`订单查询失败: ${err instanceof Error ? err.message : String(err)}`);
      ordersOk = false;
    }

    let salesOk = true;
    let salesData: Record<string, unknown>[] = [];
    try {
      const page = await this.client.pagedPostDetailed(
        "/api/productSale/page.json",
        { type: "productNum", groupType: "asin", startDate: lastWeek, endDate: today },
        { max_pages: 1 },
      );
      salesData = page.rows;
    } catch (err) {
      warnings.push(`销量查询失败: ${err instanceof Error ? err.message : String(err)}`);
      salesOk = false;
    }

    let reviewsOk = true;
    try {
      const result = await this.runEndpointSpec("sellfox_reviews", {
        startDate: lastWeek,
        endDate: today,
        pageSize: 5,
      });
      reviewsOk = result.ok;
    } catch (err) {
      warnings.push(`评价查询失败: ${err instanceof Error ? err.message : String(err)}`);
      reviewsOk = false;
    }

    return makeResult({
      data: {
        online_products_ok: productsOk,
        orders_ok: ordersOk,
        product_sales_ok: salesOk,
        reviews_ok: reviewsOk,
        sample_counts: {
          online_products: productsData.length,
          orders: ordersData.length,
          product_sales: salesData.length,
        },
      },
      endpoint: "smoke_check",
      warnings,
    });
  }
}
