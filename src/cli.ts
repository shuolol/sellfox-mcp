#!/usr/bin/env node
// ============================================================
// Sellfox CLI — command-line interface for Sellfox OpenAPI
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SellfoxOpenAPIService, type SellfoxResult } from "./services.js";
import { ALL_ENDPOINT_SPECS, ENDPOINT_SPECS_BY_NAME } from "./endpoint-specs.js";
import { CredentialPool } from "./credential-pool.js";
import { loadEnvFile, setupLogging } from "./client.js";
import { initSchema } from "./db.js";
import type { ToolArg } from "./types.js";

// ---- Types ----

interface CliCommand {
  description: string;
  args: ToolArg[];
  handler: (svc: SellfoxOpenAPIService, args: Record<string, unknown>) => Promise<SellfoxResult>;
}

// ---- Arg parser ----

function parseCliArgs(raw: string[]): { args: Record<string, unknown>; flags: Set<string> } {
  const args: Record<string, unknown> = {};
  const flags = new Set<string>();

  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i]!;
    if (!arg.startsWith("--")) continue;

    const rest = arg.slice(2);
    if (rest.includes("=")) {
      const eq = rest.indexOf("=");
      const key = rest.slice(0, eq);
      const value = rest.slice(eq + 1);
      accumulateArg(args, key, value);
    } else if (rest.startsWith("no-")) {
      args[rest.slice(3)] = false;
    } else if (i + 1 < raw.length && !raw[i + 1]!.startsWith("--")) {
      accumulateArg(args, rest, raw[i + 1]!);
      i++;
    } else {
      flags.add(rest);
      args[rest] = true;
    }
  }

  return { args, flags };
}

function accumulateArg(target: Record<string, unknown>, key: string, value: string): void {
  if (key in target) {
    const existing = target[key];
    if (Array.isArray(existing)) {
      (existing as string[]).push(value);
    } else {
      target[key] = [existing as string, value];
    }
  } else {
    target[key] = value;
  }
}

function splitArray(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function coerceArg(value: unknown, arg: ToolArg): unknown {
  if (value == null) return undefined;

  switch (arg.arg_type) {
    case "array_string": {
      const arr = Array.isArray(value) ? value.flatMap((v) => splitArray(String(v))) : splitArray(String(value));
      return arr.length > 0 ? arr : undefined;
    }
    case "array_integer": {
      const arr = Array.isArray(value) ? value.flatMap((v) => splitArray(String(v))) : splitArray(String(value));
      const nums = arr.map(Number).filter((n) => !isNaN(n));
      return nums.length > 0 ? nums : undefined;
    }
    case "integer":
      return Number(value);
    case "boolean":
      if (value === "true" || value === true) return true;
      if (value === "false" || value === false) return false;
      return Boolean(value);
    default:
      return String(value);
  }
}

// ---- Command registry ----

function buildCommands(): Map<string, CliCommand> {
  const commands = new Map<string, CliCommand>();

  // -- Hand-written commands --

  commands.set("health-check", {
    description: "健康检查 — 检查环境变量、token 状态和基础连通性。",
    args: [],
    handler: async (svc) => svc.healthCheck(),
  });

  commands.set("smoke-check", {
    description: "烟测检查 — 对赛狐 API 做最小烟测：在线产品→订单→销售→评价。",
    args: [],
    handler: async (svc) => svc.smokeCheck(),
  });

  commands.set("seller-lists", {
    description: "店铺列表 — 查询亚马逊已授权店铺列表。",
    args: [],
    handler: async (svc) => svc.sellerLists(),
  });

  commands.set("online-products", {
    description: "在线产品 — 获取在线产品信息（Listing/SKU维度）。",
    args: [
      { name: "shopIds", arg_type: "array_string", required: false, description: "店铺ID列表", default: null, enum: null },
      { name: "searchType", arg_type: "string", required: false, description: "搜索类型: asin, sellerSku, title", default: null, enum: ["asin", "sellerSku", "title"] },
      { name: "searchContent", arg_type: "string", required: false, description: "搜索内容", default: null, enum: null },
      { name: "dateType", arg_type: "string", required: false, description: "日期类型: updateDateTime, createDateTime", default: null, enum: ["updateDateTime", "createDateTime"] },
      { name: "dateStart", arg_type: "string", required: false, description: "开始时间 yyyy-MM-dd", default: null, enum: null },
      { name: "dateEnd", arg_type: "string", required: false, description: "结束时间 yyyy-MM-dd", default: null, enum: null },
    ],
    handler: async (svc, args) =>
      svc.onlineProducts({
        shop_ids: asArray(args["shopIds"]) ?? null,
        search_type: strOrNull(args["searchType"]),
        search_content: strOrNull(args["searchContent"]),
        date_type: strOrNull(args["dateType"]),
        date_start: strOrNull(args["dateStart"]),
        date_end: strOrNull(args["dateEnd"]),
      }),
  });

  commands.set("store-sales", {
    description: "产品销量 — 获取产品销量数据，支持按 ASIN/MSKU/SKU 维度汇总。",
    args: [
      { name: "startDate", arg_type: "string", required: true, description: "开始时间 yyyy-MM-dd", default: null, enum: null },
      { name: "endDate", arg_type: "string", required: true, description: "结束时间 yyyy-MM-dd", default: null, enum: null },
      { name: "groupType", arg_type: "string", required: false, description: "统计维度: asin, parentAsin, msku, sku", default: null, enum: ["asin", "parentAsin", "msku", "sku"] },
      { name: "saleType", arg_type: "string", required: false, description: "数据类型: productNum, orderNum, salePrice", default: null, enum: ["productNum", "orderNum", "salePrice"] },
      { name: "shopIds", arg_type: "array_string", required: false, description: "店铺ID列表", default: null, enum: null },
      { name: "searchType", arg_type: "string", required: false, description: "搜索类型", default: null, enum: ["asin", "parentAsin", "msku", "sku"] },
      { name: "searchContents", arg_type: "array_string", required: false, description: "搜索内容列表", default: null, enum: null },
      { name: "statTimeType", arg_type: "integer", required: false, description: "统计周期: 1=日, 2=周, 4=月", default: null, enum: ["1", "2", "4"] },
      { name: "currency", arg_type: "string", required: false, description: "币种", default: null, enum: null },
    ],
    handler: async (svc, args) =>
      svc.storeSales({
        start_date: String(args["startDate"] ?? ""),
        end_date: String(args["endDate"] ?? ""),
        group_type: strOr(args["groupType"], "asin"),
        sale_type: strOr(args["saleType"], "productNum"),
        shop_ids: asArray(args["shopIds"]) ?? null,
        search_type: strOrNull(args["searchType"]),
        search_content: asArray(args["searchContents"]) ?? null,
        stat_time_type: intOr(args["statTimeType"], 1),
        currency: strOrNull(args["currency"]),
      }),
  });

  commands.set("orders", {
    description: "订单列表 — 查询订单，支持按时间、店铺、状态、发货方式等筛选。",
    args: [
      { name: "shopIds", arg_type: "array_string", required: false, description: "店铺ID列表", default: null, enum: null },
      { name: "dateType", arg_type: "string", required: false, description: "日期类型: updateDateTime, createDateTime, purchase", default: null, enum: ["updateDateTime", "createDateTime", "purchase"] },
      { name: "dateStart", arg_type: "string", required: false, description: "开始时间 yyyy-MM-dd HH:mm:ss", default: null, enum: null },
      { name: "dateEnd", arg_type: "string", required: false, description: "结束时间 yyyy-MM-dd HH:mm:ss", default: null, enum: null },
      { name: "orderStatus", arg_type: "string", required: false, description: "订单状态", default: null, enum: ["PendingAvailability", "Pending", "Unshipped", "PartiallyShipped", "Shipped", "InvoiceUnconfirmed", "Canceled", "Unfulfillable"] },
      { name: "fulfillment", arg_type: "string", required: false, description: "发货方式: AFN, MFN", default: null, enum: ["AFN", "MFN"] },
      { name: "searchType", arg_type: "string", required: false, description: "搜索类型: amazonOrderId, buyerEmail", default: null, enum: ["amazonOrderId", "buyerEmail"] },
      { name: "searchContent", arg_type: "string", required: false, description: "搜索内容", default: null, enum: null },
      { name: "currency", arg_type: "string", required: false, description: "币种", default: null, enum: null },
    ],
    handler: async (svc, args) =>
      svc.orders({
        shop_ids: asArray(args["shopIds"]) ?? null,
        date_type: strOr(args["dateType"], "purchase"),
        date_start: strOrNull(args["dateStart"]),
        date_end: strOrNull(args["dateEnd"]),
        order_status: strOrNull(args["orderStatus"]),
        fulfillment: strOrNull(args["fulfillment"]),
        search_type: strOrNull(args["searchType"]),
        search_content: strOrNull(args["searchContent"]),
        currency: strOrNull(args["currency"]),
      }),
  });

  commands.set("ad-report-create", {
    description: "创建广告报告 — 创建赛狐广告下载任务，返回 taskId。",
    args: [
      { name: "shopIds", arg_type: "array_string", required: true, description: "店铺ID列表", default: null, enum: null },
      { name: "adTypeCode", arg_type: "string", required: true, description: "广告类型: sp, sb, sd", default: null, enum: ["sp", "sb", "sd"] },
      { name: "reportTypeCode", arg_type: "string", required: true, description: "报告类型", default: null, enum: ["adCampaignReport", "adGroupReport", "adProductReport", "adSpaceReport", "adTargeringReport", "adSearchTermReport", "adPurchasedItemReport", "amazonBusinessReport", "adCampaignMatchedTargetReport", "sdTargetListReport"] },
      { name: "timeUnit", arg_type: "string", required: true, description: "时间单位: daily, summary", default: null, enum: ["daily", "summary"] },
      { name: "reportStartDate", arg_type: "string", required: true, description: "报告开始日期 yyyy-MM-dd", default: null, enum: null },
      { name: "reportEndDate", arg_type: "string", required: true, description: "报告结束日期 yyyy-MM-dd", default: null, enum: null },
    ],
    handler: async (svc, args) =>
      svc.adReportCreate({
        shop_ids: asArray(args["shopIds"]) ?? [],
        ad_type_code: String(args["adTypeCode"] ?? ""),
        report_type_code: String(args["reportTypeCode"] ?? ""),
        time_unit: String(args["timeUnit"] ?? ""),
        report_start_date: String(args["reportStartDate"] ?? ""),
        report_end_date: String(args["reportEndDate"] ?? ""),
      }),
  });

  commands.set("ad-report-query", {
    description: "查询广告报告进度 — 轮询广告报告下载进度。",
    args: [
      { name: "taskId", arg_type: "string", required: true, description: "任务ID", default: null, enum: null },
    ],
    handler: async (svc, args) => svc.adReportQuery(String(args["taskId"] ?? "")),
  });

  commands.set("ad-report-download", {
    description: "下载广告报告 — 下载并解析广告报告文件。",
    args: [
      { name: "url", arg_type: "string", required: true, description: "下载链接", default: null, enum: null },
    ],
    handler: async (svc, args) => svc.adReportDownload(String(args["url"] ?? "")),
  });

  commands.set("install-skill", {
    description: "安装 sellfox skill 到智能体（Claude Code / Codex / OpenClaw），让 AI 直接调用 sellfox CLI。",
    args: [
      { name: "target", arg_type: "string", required: false, description: "目标智能体: claude-code, codex, openclaw, all", default: null, enum: ["claude-code", "codex", "openclaw", "all"] },
      { name: "scope", arg_type: "string", required: false, description: "安装范围: user (全局) 或 project (当前项目)", default: null, enum: ["user", "project"] },
    ],
    handler: async () => ({ ok: true, data: null, meta: {}, warnings: [] }),
  });

  // -- Endpoint spec commands (60+) --

  for (const spec of ALL_ENDPOINT_SPECS) {
    commands.set(spec.tool_name, {
      description: spec.description,
      args: [...spec.args],
      handler: async (svc, args) => svc.runEndpointSpec(spec.tool_name, args),
    });
  }

  return commands;
}

// ---- Helpers ----

function strOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  return String(value);
}

function strOr(value: unknown, fallback: string): string {
  const s = strOrNull(value);
  return s ?? fallback;
}

function intOr(value: unknown, fallback: number): number {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return isNaN(n) ? fallback : n;
}

function asArray(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const s = String(value).trim();
  if (!s) return undefined;
  return s.split(",").map((v) => v.trim()).filter(Boolean);
}

// ---- Output ----

function printJson(data: unknown, pretty: boolean): void {
  process.stdout.write(JSON.stringify(data, null, pretty ? 2 : undefined) + "\n");
}

// ---- Help ----

function showHelp(commands: Map<string, CliCommand>, commandName?: string): void {
  if (commandName && commands.has(commandName)) {
    showCommandHelp(commandName, commands.get(commandName)!);
    return;
  }

  const lines: string[] = [];
  lines.push("sellfox <command> [options]");
  lines.push("");
  lines.push("Commands:");
  lines.push("");

  // Group by category
  const builtin = ["health-check", "smoke-check", "seller-lists", "online-products", "store-sales", "orders", "ad-report-create", "ad-report-query", "ad-report-download", "install-skill"];
  const grouped: [string, string[]][] = [
    ["内置命令", builtin],
    ["销售 (Sales)", []],
    ["订单 (Orders)", []],
    ["广告-小时报告", []],
    ["广告-基础数据", []],
    ["广告-其他报告", []],
    ["数据 (Data)", []],
    ["FBA", []],
    ["仓库 (Warehouse)", []],
    ["财务 (Finance)", []],
    ["客服 (Customer Service)", []],
  ];

  const groupMap = new Map(grouped.map(([k]) => [k, []] as [string, string[]]));
  const categoryNames: Record<string, string> = {
    sales: "销售 (Sales)",
    orders: "订单 (Orders)",
    ad_report: "广告-小时报告",
    ad_base: "广告-基础数据",
    data: "数据 (Data)",
    fba: "FBA",
    warehouse: "仓库 (Warehouse)",
    finance: "财务 (Finance)",
    customer_service: "客服 (Customer Service)",
  };

  for (const [name, cmd] of commands) {
    if (builtin.includes(name)) continue;
    // Try to find category from endpoint spec
    const spec = ENDPOINT_SPECS_BY_NAME[name];
    const catLabel = spec ? (categoryNames[spec.category] ?? "其他") : "其他";
    const arr = groupMap.get(catLabel);
    if (arr) arr.push(name);
  }

  // Output grouped
  for (const [group, cmdNames] of grouped) {
    const names = group === "内置命令" ? builtin : (groupMap.get(group) ?? []);
    if (names.length === 0) continue;
    lines.push(`  ${group}:`);
    for (const name of names) {
      const cmd = commands.get(name);
      if (cmd) {
        const desc = cmd.description.length > 60 ? cmd.description.slice(0, 57) + "..." : cmd.description;
        lines.push(`    ${name.padEnd(42)} ${desc}`);
      }
    }
    lines.push("");
  }

  lines.push("Options:");
  lines.push("  --pretty    格式化 JSON 输出");
  lines.push("  --help      显示帮助信息（可用 --help <command> 查看命令详情）");
  lines.push("");
  lines.push("环境变量:");
  lines.push("  SELLFOX_CLIENT_ID, SELLFOX_CLIENT_SECRET  赛狐 API 凭证");
  lines.push("  SELLFOX_BASE_URL                          赛狐 API 地址（默认 https://openapi.sellfox.com）");
  lines.push("  SELLFOX_TOKEN_CACHE_FILE                  Token 缓存文件路径");
  lines.push("  DATABASE_URL / PGHOST                     PostgreSQL 连接（凭证池模式）");

  process.stderr.write(lines.join("\n") + "\n");
}

function showCommandHelp(name: string, cmd: CliCommand): void {
  const lines: string[] = [];
  lines.push(`sellfox ${name}`);
  lines.push("");
  lines.push(`  ${cmd.description}`);
  lines.push("");

  if (cmd.args.length > 0) {
    lines.push("参数:");
    for (const arg of cmd.args) {
      const req = arg.required ? " (必需)" : "";
      const choices = arg.enum ? ` [${arg.enum.join(", ")}]` : "";
      lines.push(`  --${arg.name}${req}  ${arg.description}${choices}`);
    }
    lines.push("");
  } else {
    lines.push("  无参数");
    lines.push("");
  }

  lines.push("示例:");
  if (cmd.args.length > 0) {
    const exampleArgs = cmd.args
      .filter((a) => a.required)
      .map((a) => `--${a.name} <${a.arg_type === "array_string" ? "v1,v2" : "value"}>`)
      .join(" ");
    lines.push(`  sellfox ${name} ${exampleArgs} --pretty`);
  } else {
    lines.push(`  sellfox ${name} --pretty`);
  }

  process.stderr.write(lines.join("\n") + "\n");
}

// ---- Skill installer ----

const SKILL_CONTENT = `---
name: sellfox
description: Query Amazon seller data via Sellfox OpenAPI CLI. Use when the user asks about store sales, orders, ads, profits, inventory, reviews, or any Amazon seller metrics. Covers 70+ data endpoints across sales, advertising, finance, FBA, and customer service.
---

# Sellfox CLI Skill

You have access to the \`sellfox\` CLI tool. It queries Amazon seller data through the Sellfox OpenAPI. Use it to answer user questions about their Amazon business.

## How to run commands

Run \`sellfox\` commands via Bash. All output is JSON to stdout, logs go to stderr.

\`\`\`bash
sellfox <command> [--key value ...] [--pretty]
\`\`\`

## Command reference

### Built-in (always available)

| Command | What it does | Args |
|---------|-------------|------|
| \`health-check\` | Check connectivity & credentials | none |
| \`smoke-check\` | Quick full-stack test | none |
| \`seller-lists\` | List all authorized Amazon shops | none |
| \`online-products\` | List online products | \`--shopIds\`, \`--searchType\`, \`--searchContent\`, \`--dateType\`, \`--dateStart\`, \`--dateEnd\` |
| \`store-sales\` | Product sales data | \`--startDate\` (required), \`--endDate\` (required), \`--groupType\`, \`--saleType\`, \`--shopIds\`, \`--statTimeType\`, \`--currency\` |
| \`orders\` | Order list with filters | \`--shopIds\`, \`--dateType\`, \`--dateStart\`, \`--dateEnd\`, \`--orderStatus\`, \`--fulfillment\`, \`--searchType\`, \`--searchContent\`, \`--currency\` |
| \`ad-report-create\` | Create ad download task | \`--shopIds\` (required), \`--adTypeCode\` (sp/sb/sd), \`--reportTypeCode\` (required), \`--timeUnit\` (daily/summary), \`--reportStartDate\` (required), \`--reportEndDate\` (required) |
| \`ad-report-query\` | Check ad report progress | \`--taskId\` (required) |
| \`ad-report-download\` | Download & parse ad report | \`--url\` (required) |

### Sales data

| Command | What it does |
|---------|-------------|
| \`sellfox_online_products_v2\` | Online products V2 |
| \`sellfox_fba_return_report\` | FBA return report |
| \`sellfox_fbm_return_report\` | FBM return report |

### Advertising (35+ commands)

**Hourly reports:** \`sellfox_ads_sp_campaign_hourly\`, \`sellfox_ads_sp_ad_group_hourly\`, \`sellfox_ads_sp_product_hourly\`, \`sellfox_ads_sp_target_hourly\`, \`sellfox_ads_sp_placement_hourly\`, \`sellfox_ads_sb_campaign_hourly\`, \`sellfox_ads_sb_ad_group_hourly\`, \`sellfox_ads_sb_target_hourly\`, \`sellfox_ads_sb_placement_hourly\`, \`sellfox_ads_sd_campaign_hourly\`, \`sellfox_ads_sd_ad_group_hourly\`, \`sellfox_ads_sd_product_hourly\`, \`sellfox_ads_sd_target_hourly\`

**Ad base data:** \`sellfox_ads_portfolios\`, \`sellfox_ads_sp_campaigns\`, \`sellfox_ads_sp_ad_groups\`, \`sellfox_ads_sp_product_ads\`, \`sellfox_ads_sp_keywords\`, \`sellfox_ads_sp_targets\`, \`sellfox_ads_sp_negative_keywords\`, \`sellfox_ads_sp_negative_products\`, \`sellfox_ads_sb_campaigns\`, \`sellfox_ads_sb_ad_groups\`, \`sellfox_ads_sb_creatives\`, \`sellfox_ads_sb_keywords\`, \`sellfox_ads_sb_targets\`, \`sellfox_ads_sb_negative_keywords\`, \`sellfox_ads_sb_negative_products\`, \`sellfox_ads_sd_campaigns\`, \`sellfox_ads_sd_ad_groups\`, \`sellfox_ads_sd_product_ads\`, \`sellfox_ads_sd_creatives\`, \`sellfox_ads_sd_targets\`, \`sellfox_ads_sd_negative_products\`

All ad base commands accept: \`--shopIds\` (required), \`--state\` (enabled/paused/archived)
All hourly commands accept: \`--shopIds\` (required), \`--reportDate\` (required, yyyy-MM-dd)

### Finance & Profit

\`sellfox_product_sales\`, \`sellfox_product_analysis\`, \`sellfox_shop_performance\`, \`sellfox_profit_product\`, \`sellfox_profit_shop\`, \`sellfox_settlement_profit_asin\`, \`sellfox_settlement_profit_shop\`, \`sellfox_profit_report_asin\`, \`sellfox_profit_report_shop\`, \`sellfox_settlement_summary\`, \`sellfox_settlement_detail\`, \`sellfox_cost_batch_inbound\`, \`sellfox_cost_batch_outbound\`

### Inventory & FBA

\`sellfox_warehouse_stock\`, \`sellfox_fba_stock\`, \`sellfox_stock_flow\`, \`sellfox_fba_shipment_list\`, \`sellfox_fba_shipment_batch_list\`, \`sellfox_fba_shipment_batch_detail\`

### Reviews

\`sellfox_reviews\` — accepts \`--shopIdList\`, \`--startDate\`/\`--endDate\`, \`--starList\` (1,2,3,4,5), \`--marketplaceIdList\`, \`--searchType\`, \`--searchValue\`

## Parameter patterns

\`\`\`
--key value           String
--key 1,2,3           Array (comma-delimited)
--startDate 2026-06-01   Date range start
--endDate 2026-06-07     Date range end
--shopIds 123,456     Shop ID list
--pretty              Pretty-print JSON output
\`\`\`

## Workflow

1. Identify which data the user needs
2. Pick the right \`sellfox\` command from above
3. Run via Bash with \`--pretty\`
4. Parse JSON output, check \`ok\` field, read \`data\`
5. Answer in plain language
6. If you need shop IDs first, run \`sellfox seller-lists --pretty\`

## Tips

- Always add \`--pretty\` for readable output
- If unsure about shop IDs, run \`seller-lists\` first
- Ad reports: \`ad-report-create\` → \`ad-report-query\` → \`ad-report-download\`
- Dates: \`yyyy-MM-dd\` for most, \`yyyy-MM-dd HH:mm:ss\` for orders
- Run \`sellfox --help\` to see all commands
- Run \`sellfox --help <command>\` for per-command help
`;

interface AgentTarget {
  name: string;
  label: string;
  userDir: string;
  projectDir: string;
  detected: boolean;
}

function detectAgents(cwd: string): AgentTarget[] {
  const home = os.homedir();
  const agents: AgentTarget[] = [
    {
      name: "claude-code",
      label: "Claude Code",
      userDir: path.join(home, ".claude", "skills"),
      projectDir: path.join(cwd, ".claude", "skills"),
      detected: false,
    },
    {
      name: "codex",
      label: "Codex (OpenAI)",
      userDir: path.join(home, ".codex", "skills"),
      projectDir: path.join(cwd, ".codex", "skills"),
      detected: false,
    },
    {
      name: "openclaw",
      label: "OpenClaw",
      userDir: path.join(home, ".openclaw", "skills"),
      projectDir: path.join(cwd, ".openclaw", "skills"),
      detected: false,
    },
  ];

  // Detect: user dir exists, or the agent CLI is installed
  for (const a of agents) {
    a.detected = fs.existsSync(a.userDir);
  }
  // Also check known CLI names
  if (!agents[0]!.detected) agents[0]!.detected = which("claude") !== null;
  if (!agents[1]!.detected) agents[1]!.detected = which("codex") !== null || fs.existsSync(path.join(home, ".codex"));
  if (!agents[2]!.detected) agents[2]!.detected = which("openclaw") !== null || fs.existsSync(path.join(home, ".openclaw"));

  return agents;
}

function which(cmd: string): string | null {
  const paths = (process.env["PATH"] ?? "").split(path.delimiter);
  const ext = process.platform === "win32" ? ".cmd" : "";
  for (const p of paths) {
    const full = path.join(p, cmd + ext);
    try {
      if (fs.statSync(full).isFile()) return full;
    } catch { /* skip */ }
  }
  return null;
}

function installSkill(targetDir: string): void {
  fs.mkdirSync(targetDir, { recursive: true });
  const filePath = path.join(targetDir, "sellfox.md");
  fs.writeFileSync(filePath, SKILL_CONTENT, "utf-8");
}

async function runInstallSkill(args: Record<string, unknown>, flags: Set<string>): Promise<void> {
  const cwd = process.cwd();
  const agents = detectAgents(cwd);

  let target = strOrNull(args["target"])?.toLowerCase() ?? null;
  const scope = strOr(args["scope"], "user");

  // --all flag
  if (flags.has("all")) target = "all";

  // Interactive selection if no target given
  if (!target) {
    process.stderr.write("\n请选择要安装 skill 的智能体：\n\n");
    const options = [
      { key: "1", name: "claude-code", label: "Claude Code" },
      { key: "2", name: "codex", label: "Codex (OpenAI)" },
      { key: "3", name: "openclaw", label: "OpenClaw" },
      { key: "a", name: "all", label: "全部安装" },
    ];

    for (const opt of options) {
      const agent = agents.find((a) => a.name === opt.name);
      const status = agent?.detected ? " [已检测到]" : "";
      process.stderr.write(`  ${opt.key}. ${opt.label}${status}\n`);
    }
    process.stderr.write("\n输入序号 (1/2/3/a): ");

    // Read a single line from stdin
    const choice = await readLine();
    const selected = options.find((o) => o.key === choice.trim());
    if (!selected) {
      process.stderr.write("无效选择。\n");
      process.exit(1);
    }
    target = selected.name;
  }

  if (scope !== "user" && scope !== "project") {
    process.stderr.write("--scope 必须是 user 或 project\n");
    process.exit(1);
  }

  const targets = target === "all"
    ? agents
    : agents.filter((a) => a.name === target);

  if (targets.length === 0) {
    process.stderr.write(`未知智能体: ${target}\n`);
    process.stderr.write("可选: claude-code, codex, openclaw, all\n");
    process.exit(1);
  }

  for (const a of targets) {
    const dir = scope === "user" ? a.userDir : a.projectDir;
    installSkill(dir);
    process.stderr.write(`已安装到 ${a.label} (${scope}): ${path.join(dir, "sellfox.md")}\n`);
  }

  process.stderr.write("\n安装完成！重启智能体或开启新对话即可使用 sellfox skill。\n");
}

function readLine(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      const text = Buffer.concat(chunks).toString("utf-8");
      if (text.includes("\n")) {
        process.stdin.removeListener("data", onData);
        process.stdin.pause();
        resolve(text.split("\n")[0] ?? "");
      }
    };
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

// ---- Main ----

async function main(): Promise<void> {
  setupLogging();
  loadEnvFile();

  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0) {
    const commands = buildCommands();
    showHelp(commands);
    process.exit(0);
  }

  // Parse positional command (first non-flag arg)
  let commandName = "";
  const remaining: string[] = [];
  for (const a of rawArgs) {
    if (!commandName && !a.startsWith("--")) {
      commandName = a;
    } else {
      remaining.push(a);
    }
  }

  const { args, flags } = parseCliArgs(remaining);
  const pretty = flags.has("pretty") || flags.has("p");
  const helpFlag = flags.has("help") || flags.has("h");

  const commands = buildCommands();

  if (helpFlag) {
    showHelp(commands, commandName || undefined);
    process.exit(0);
  }

  if (!commandName) {
    showHelp(commands);
    process.exit(1);
  }

  // install-skill is a special command that doesn't need the API service
  if (commandName === "install-skill") {
    await runInstallSkill(args, flags);
    process.exit(0);
  }

  const cmd = commands.get(commandName);
  if (!cmd) {
    process.stderr.write(`未知命令: ${commandName}\n`);
    process.stderr.write(`使用 --help 查看可用命令列表。\n`);
    process.exit(1);
  }

  // Validate required args
  for (const argDef of cmd.args) {
    if (argDef.required && (args[argDef.name] == null || args[argDef.name] === "")) {
      process.stderr.write(`缺少必需参数: --${argDef.name}\n`);
      process.stderr.write(`使用 --help ${commandName} 查看命令详情。\n`);
      process.exit(1);
    }
  }

  // Coerce arg types
  const coerced: Record<string, unknown> = {};
  for (const argDef of cmd.args) {
    const raw = args[argDef.name];
    if (raw != null) {
      coerced[argDef.name] = coerceArg(raw, argDef);
    }
  }

  // Create service
  let pool: CredentialPool | null = null;
  if (process.env["DATABASE_URL"] || process.env["PGHOST"]) {
    await initSchema();
    pool = new CredentialPool();
  }
  const svc = new SellfoxOpenAPIService(pool ? { credential_pool: pool } : {});

  // Execute
  try {
    const result = await cmd.handler(svc, coerced);
    printJson(result, pretty);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    printJson({ ok: false, error: { message: msg } }, pretty);
    process.exit(1);
  }
}

main();
