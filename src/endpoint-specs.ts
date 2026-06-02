// ============================================================
// Endpoint & tool metadata — mirrors endpoint_specs.py
// ============================================================

import type { ToolArg, EndpointSpec, EndpointSpecInit } from "./types.js";

export function makeEndpointSpec(init: EndpointSpecInit): EndpointSpec {
  const args = init.args ?? [];
  const defaults: Record<string, unknown> = {};
  if (init.body_defaults) Object.assign(defaults, init.body_defaults);
  const headers: Record<string, string> = {};
  if (init.extra_headers) Object.assign(headers, init.extra_headers);

  return {
    tool_name: init.tool_name,
    description: init.description,
    endpoint: init.endpoint,
    category: init.category,
    args,
    pagination_mode: init.pagination_mode ?? "page",
    page_size: init.page_size ?? 100,
    data_path: init.data_path ?? "data.rows",
    total_path: init.total_path ?? "data.totalSize",
    next_token_path: init.next_token_path ?? null,
    docs_path: init.docs_path ?? "",
    defaults,
    headers,
    auto_profile: init.auto_profile ?? false,
    profile_type: init.profile_type ?? "seller",
    result_kind: init.result_kind ?? "rows",
    stable: init.stable ?? true,
    search_field: init.search_field ?? null,
  };
}

// ---- Arg helpers ----

function s(name: string, opts?: { required?: boolean; default?: unknown; description?: string; enum?: string[] }): ToolArg {
  return {
    name,
    arg_type: "string",
    required: opts?.required ?? false,
    default: opts?.default ?? null,
    description: opts?.description ?? "",
    enum: opts?.enum ?? null,
  };
}

function i(name: string, opts?: { required?: boolean; default?: unknown; description?: string; enum?: string[] }): ToolArg {
  return {
    name,
    arg_type: "integer",
    required: opts?.required ?? false,
    default: opts?.default ?? null,
    description: opts?.description ?? "",
    enum: opts?.enum ?? null,
  };
}

function b(name: string, opts?: { required?: boolean; default?: unknown; description?: string }): ToolArg {
  return {
    name,
    arg_type: "boolean",
    required: opts?.required ?? false,
    default: opts?.default ?? null,
    description: opts?.description ?? "",
    enum: null,
  };
}

function as(name: string, opts?: { required?: boolean; default?: unknown; description?: string; enum?: string[] }): ToolArg {
  return {
    name,
    arg_type: "array_string",
    required: opts?.required ?? false,
    default: opts?.default ?? null,
    description: opts?.description ?? "",
    enum: opts?.enum ?? null,
  };
}

// ---- Shared arg presets ----

const SHOP_DATE_ARGS: ToolArg[] = [
  as("shopIdList", { description: "店铺ID列表" }),
  s("startDate", { required: true, description: "开始时间 yyyy-MM-dd" }),
  s("endDate", { required: true, description: "结束时间 yyyy-MM-dd" }),
];

const AD_HOURLY_ARGS: ToolArg[] = [
  as("shopIds", { required: true, description: "店铺ID列表" }),
  s("reportDate", { required: true, description: "报告日期 yyyy-MM-dd" }),
];

const AD_BASE_ARGS: ToolArg[] = [
  as("shopIds", { required: true, description: "店铺ID列表" }),
  s("state", { description: "状态过滤", enum: ["enabled", "paused", "archived"] }),
];

const PROFIT_ARGS: ToolArg[] = [
  as("shopIdList", { description: "店铺ID列表" }),
  s("startDate", { required: true, description: "开始时间 yyyy-MM-dd" }),
  s("endDate", { required: true, description: "结束时间 yyyy-MM-dd" }),
  s("currency", { description: "币种" }),
];

// ---- All endpoint specs ----

export const ALL_ENDPOINT_SPECS: EndpointSpec[] = [
  // ========== 销售 (Sales) ==========
  makeEndpointSpec({
    tool_name: "sellfox_online_products_v2",
    description: "获取在线产品信息V2。",
    endpoint: "/api/order/api/product/v2/pageList.json",
    category: "sales",
    args: [
      as("shopIdList", { description: "店铺ID列表" }),
      s("searchType", { description: "搜索类型", enum: ["sku", "parentAsin", "msku", "title", "fnsku", "commodityName", "asin"] }),
      s("searchContent", { description: "搜索内容" }),
    ],
  }),
  makeEndpointSpec({
    tool_name: "sellfox_fba_return_report",
    description: "FBA退货报告查询。",
    endpoint: "/api/order/api/report/fbaReturn/pageList.json",
    category: "sales",
    args: [
      ...SHOP_DATE_ARGS,
      s("searchType", { description: "搜索类型", enum: ["orderId", "asin", "msku", "title", "sku", "commodityName", "remark", "licensePlateNumber", "fnsku"] }),
      s("searchContent", { description: "搜索内容" }),
      s("status", { description: "退货状态", enum: ["Unit returned to inventory", "Reimbursed", "Repackaged Successfully", "IMMEDIATE_DISPOSAL"] }),
    ],
  }),
  makeEndpointSpec({
    tool_name: "sellfox_fbm_return_report",
    description: "FBM退货报告查询。",
    endpoint: "/api/order/api/report/fbm/return/order/pageList.json",
    category: "sales",
    args: [
      ...SHOP_DATE_ARGS,
      s("searchType", { description: "搜索类型", enum: ["orderId", "amazonRmaId", "trackingId", "asin", "msku", "sku", "commodityName", "remark"] }),
      s("searchContent", { description: "搜索内容" }),
      s("status", { description: "退货状态", enum: ["AuthorizationRequried", "Approved", "PendingApproval", "PendingActions", "Completed", "Closed", "WithA-to-ZGuranteeClaim"] }),
    ],
  }),

  // ========== 订单 (Orders) ==========
  makeEndpointSpec({
    tool_name: "sellfox_fbm_orders",
    description: "FBM订单列表。",
    endpoint: "/api/packageShip/getPackagePage.json",
    category: "orders",
    args: [
      ...SHOP_DATE_ARGS,
      s("orderStatus", { description: "订单状态", enum: ["Pending", "Unshipped", "Shipped", "Canceled"] }),
      s("searchType", { description: "搜索类型", enum: ["amazonOrderId", "buyerEmail", "asin", "sku"] }),
      s("searchContent", { description: "搜索内容" }),
    ],
  }),

  // ========== 广告-小时维度报告 (Ad Hourly Reports) ==========
  makeEndpointSpec({ tool_name: "sellfox_ads_sp_campaign_hourly", description: "小时报告-SP广告活动报告。", endpoint: "/api/cpc/hourData/spCampaign.json", category: "ad_report", args: AD_HOURLY_ARGS, page_size: 200 }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sp_ad_group_hourly", description: "小时报告-SP广告组报告。", endpoint: "/api/cpc/hourData/spGroup.json", category: "ad_report", args: AD_HOURLY_ARGS, page_size: 200 }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sp_product_hourly", description: "小时报告-SP广告产品报告。", endpoint: "/api/cpc/hourData/spAdProduct.json", category: "ad_report", args: AD_HOURLY_ARGS, page_size: 200 }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sp_target_hourly", description: "小时报告-SP投放报告。", endpoint: "/api/cpc/hourData/spTarget.json", category: "ad_report", args: AD_HOURLY_ARGS, page_size: 200 }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sp_placement_hourly", description: "小时报告-SP广告位报告。", endpoint: "/api/cpc/hourData/spPlacement.json", category: "ad_report", args: AD_HOURLY_ARGS, page_size: 200 }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sb_campaign_hourly", description: "小时报告-SB广告活动报告。", endpoint: "/api/cpc/hourData/sbCampaign.json", category: "ad_report", args: AD_HOURLY_ARGS, page_size: 200 }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sb_ad_group_hourly", description: "小时报告-SB广告组报告。", endpoint: "/api/cpc/hourData/sbGroup.json", category: "ad_report", args: AD_HOURLY_ARGS, page_size: 200 }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sb_target_hourly", description: "小时报告-SB投放报告。", endpoint: "/api/cpc/hourData/sbTarget.json", category: "ad_report", args: AD_HOURLY_ARGS, page_size: 200 }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sb_placement_hourly", description: "小时报告-SB广告位报告。", endpoint: "/api/cpc/hourData/sbPlacement.json", category: "ad_report", args: AD_HOURLY_ARGS, page_size: 200 }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sd_campaign_hourly", description: "小时报告-SD广告活动报告。", endpoint: "/api/cpc/hourData/sdCampaign.json", category: "ad_report", args: AD_HOURLY_ARGS, page_size: 200 }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sd_ad_group_hourly", description: "小时报告-SD广告组报告。", endpoint: "/api/cpc/hourData/sdGroup.json", category: "ad_report", args: AD_HOURLY_ARGS, page_size: 200 }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sd_product_hourly", description: "小时报告-SD广告产品报告。", endpoint: "/api/cpc/hourData/sdAdProduct.json", category: "ad_report", args: AD_HOURLY_ARGS, page_size: 200 }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sd_target_hourly", description: "小时报告-SD投放报告。", endpoint: "/api/cpc/hourData/sdTarget.json", category: "ad_report", args: AD_HOURLY_ARGS, page_size: 200 }),

  // ========== 广告-基础数据 (Ad Base Data) ==========
  makeEndpointSpec({ tool_name: "sellfox_ads_portfolios", description: "广告组合列表。", endpoint: "/api/cpc/manageData/portfolio.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sp_campaigns", description: "SP广告活动基础数据。", endpoint: "/api/cpc/manageData/spCampaign.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sp_ad_groups", description: "SP广告组基础数据。", endpoint: "/api/cpc/manageData/spGroup.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sp_product_ads", description: "SP广告产品基础数据。", endpoint: "/api/cpc/manageData/spAdProduct.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sp_keywords", description: "SP关键词投放基础数据。", endpoint: "/api/cpc/manageData/spKeyword.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sp_targets", description: "SP商品投放基础数据。", endpoint: "/api/cpc/manageData/spTarget.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sp_negative_keywords", description: "SP否定关键词基础数据。", endpoint: "/api/cpc/manageData/spNeKeyword.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sp_negative_products", description: "SP否定商品基础数据。", endpoint: "/api/cpc/manageData/spNeTarget.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sb_campaigns", description: "SB广告活动基础数据。", endpoint: "/api/cpc/manageData/sbCampaign.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sb_ad_groups", description: "SB广告组基础数据。", endpoint: "/api/cpc/manageData/sbGroup.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sb_creatives", description: "SB广告产品(创意)基础数据。", endpoint: "/api/cpc/manageData/sbAdProduct.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sb_keywords", description: "SB关键词投放基础数据。", endpoint: "/api/cpc/manageData/sbKeyword.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sb_targets", description: "SB商品投放基础数据。", endpoint: "/api/cpc/manageData/sbTarget.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sb_negative_keywords", description: "SB否定关键词基础数据。", endpoint: "/api/cpc/manageData/sbNeKeyword.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sb_negative_products", description: "SB否定商品基础数据。", endpoint: "/api/cpc/manageData/sbNeTarget.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sd_campaigns", description: "SD广告活动基础数据。", endpoint: "/api/cpc/manageData/sdCampaign.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sd_ad_groups", description: "SD广告组基础数据。", endpoint: "/api/cpc/manageData/sdGroup.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sd_product_ads", description: "SD广告产品基础数据。", endpoint: "/api/cpc/manageData/sdAdProduct.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sd_creatives", description: "SD广告创意基础数据。", endpoint: "/api/cpc/manageData/sdCreative.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sd_targets", description: "SD商品投放基础数据。", endpoint: "/api/cpc/manageData/sdTarget.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),
  makeEndpointSpec({ tool_name: "sellfox_ads_sd_negative_products", description: "SD否定商品基础数据。", endpoint: "/api/cpc/manageData/sdNeTarget.json", category: "ad_base", args: AD_BASE_ARGS, auto_profile: true }),

  // ========== 广告-其他报告 ==========
  makeEndpointSpec({
    tool_name: "sellfox_ads_aba_search_term",
    description: "ABA搜索词报告。",
    endpoint: "/api/cpc/searchTerms/pageList.json",
    category: "ad_report",
    args: [
      s("country", { required: true, description: "国家代码" }),
      s("dataStartTime", { required: true, description: "数据开始时间" }),
    ],
  }),

  // ========== 数据 (Data) ==========
  makeEndpointSpec({
    tool_name: "sellfox_product_sales",
    description: "获取产品销量数据，支持按 ASIN/父ASIN/MSKU/SKU 维度汇总。",
    endpoint: "/api/productSale/page.json",
    category: "data",
    args: [
      s("type", { required: true, description: "数据类型", enum: ["productNum", "orderNum", "salePrice"] }),
      s("groupType", { required: true, description: "统计维度", enum: ["asin", "parentAsin", "msku", "sku"] }),
      as("shopIdList", { description: "店铺ID列表" }),
      s("startDate", { required: true, description: "开始时间 yyyy-MM-dd" }),
      s("endDate", { required: true, description: "结束时间 yyyy-MM-dd" }),
      s("searchType", { description: "搜索类型", enum: ["asin", "parentAsin", "msku", "sku"] }),
      as("searchContentList", { description: "搜索内容列表" }),
      i("statTimeType", { description: "统计周期: 1=日, 2=周, 4=月", enum: ["1", "2", "4"] }),
      s("currency", { description: "币种" }),
      s("fulfillmentChannel", { description: "发货方式: FBA, FBM" }),
    ],
    search_field: "groupType",
  }),
  makeEndpointSpec({
    tool_name: "sellfox_product_analysis",
    description: "获取产品分析数据（新），含浏览、会话、广告和销量指标。",
    endpoint: "/api/productAnalyze/new/pageList.json",
    category: "data",
    args: [
      ...SHOP_DATE_ARGS,
      s("searchField", { description: "搜索字段", enum: ["asin", "parentAsin", "msku"] }),
      as("searchValue", { description: "搜索值列表" }),
      s("currency", { description: "币种" }),
      s("summaryField", { description: "汇总字段" }),
    ],
    search_field: "searchField",
  }),
  makeEndpointSpec({
    tool_name: "sellfox_shop_performance",
    description: "店铺表现按天查询。",
    endpoint: "/api/stats/getShopDataByDay.json",
    category: "data",
    args: [...SHOP_DATE_ARGS, s("currency", { description: "币种" })],
  }),
  makeEndpointSpec({
    tool_name: "sellfox_profit_product",
    description: "销售利润数据(产品维度)。",
    endpoint: "/api/sale/profit/product/pageList.json",
    category: "data",
    args: PROFIT_ARGS,
    search_field: "asin",
  }),
  makeEndpointSpec({
    tool_name: "sellfox_profit_shop",
    description: "销售利润数据(店铺维度)。",
    endpoint: "/api/sale/profit/shop/pageList.json",
    category: "data",
    args: PROFIT_ARGS,
  }),

  // ========== FBA ==========
  makeEndpointSpec({
    tool_name: "sellfox_fba_shipment_list",
    description: "获取FBA发货单列表。",
    endpoint: "/api/fba/shippingOrder/pageList.json",
    category: "fba",
    args: [
      as("shopIdList", { description: "店铺ID列表" }),
      s("startDate", { description: "开始时间 yyyy-MM-dd" }),
      s("endDate", { description: "结束时间 yyyy-MM-dd" }),
      s("status", { description: "状态", enum: ["working", "shipped", "checked", "received", "closed", "deleted"] }),
    ],
  }),
  makeEndpointSpec({
    tool_name: "sellfox_fba_shipment_batch_list",
    description: "获取FBA发货批次列表。",
    endpoint: "/api/fba/deliveryPlan/pageList.json",
    category: "fba",
    args: [as("shopIdList", { description: "店铺ID列表" })],
  }),
  makeEndpointSpec({
    tool_name: "sellfox_fba_shipment_batch_detail",
    description: "获取FBA发货批次详情。",
    endpoint: "/api/fba/deliveryPlan/detail.json",
    category: "fba",
    args: [s("batchId", { required: true, description: "批次ID" })],
    pagination_mode: "none",
    result_kind: "object",
  }),

  // ========== 仓库 (Warehouse) ==========
  makeEndpointSpec({
    tool_name: "sellfox_warehouse_stock",
    description: "查询库存明细。",
    endpoint: "/api/warehouseManage/warehouseItemList.json",
    category: "warehouse",
    args: [
      as("shopIdList", { description: "店铺ID列表" }),
      s("searchType", { description: "搜索类型", enum: ["sku", "asin", "fnsku", "sellerSku"] }),
      s("searchContent", { description: "搜索内容" }),
    ],
  }),
  makeEndpointSpec({
    tool_name: "sellfox_fba_stock",
    description: "查询FBA库存明细。",
    endpoint: "/api/inventoryManage/fba/pageList.json",
    category: "warehouse",
    args: [
      as("shopIdList", { description: "店铺ID列表" }),
      s("searchType", { description: "搜索类型", enum: ["sku", "fnsku", "asin"] }),
      as("searchContent", { description: "搜索内容" }),
    ],
  }),
  makeEndpointSpec({
    tool_name: "sellfox_stock_flow",
    description: "获取库存流水。",
    endpoint: "/api/warehouseInOut/inOutRecords.json",
    category: "warehouse",
    args: [
      ...SHOP_DATE_ARGS,
      s("searchType", { description: "搜索类型", enum: ["sku", "asin", "fnsku"] }),
      s("searchContent", { description: "搜索内容" }),
    ],
  }),

  // ========== 财务 (Finance) ==========
  makeEndpointSpec({
    tool_name: "sellfox_cost_batch_inbound",
    description: "获取批次入库成本数据。",
    endpoint: "/api/financial/batchCost/getInboundPageList.json",
    category: "finance",
    args: [
      ...SHOP_DATE_ARGS,
      s("searchType", { description: "搜索类型", enum: ["asin", "msku", "sku", "fnsku"] }),
      s("searchContent", { description: "搜索内容" }),
    ],
  }),
  makeEndpointSpec({
    tool_name: "sellfox_cost_batch_outbound",
    description: "获取批次出库成本数据。",
    endpoint: "/api/financial/batchCost/getOutboundPageList.json",
    category: "finance",
    args: [
      ...SHOP_DATE_ARGS,
      s("searchType", { description: "搜索类型", enum: ["asin", "msku", "sku", "fnsku"] }),
      s("searchContent", { description: "搜索内容" }),
    ],
  }),
  makeEndpointSpec({
    tool_name: "sellfox_settlement_profit_asin",
    description: "结算利润-ASIN维度(V2)。",
    endpoint: "/api/financial/v2/dailyProfit/asin.json",
    category: "finance",
    args: [...PROFIT_ARGS, b("monthlyQuery", { description: "是否按月查询" })],
    search_field: "asin",
  }),
  makeEndpointSpec({
    tool_name: "sellfox_settlement_profit_shop",
    description: "结算利润-店铺维度(V2)。",
    endpoint: "/api/financial/v2/dailyProfit/shop.json",
    category: "finance",
    args: [...PROFIT_ARGS, b("monthlyQuery", { description: "是否按月查询" })],
  }),
  makeEndpointSpec({
    tool_name: "sellfox_profit_report_asin",
    description: "利润报表-ASIN维度(V2)。",
    endpoint: "/api/financial/v2/monthProfit/asin.json",
    category: "finance",
    args: [...PROFIT_ARGS, b("monthlyQuery", { description: "是否按月查询" })],
    search_field: "asin",
  }),
  makeEndpointSpec({
    tool_name: "sellfox_profit_report_shop",
    description: "利润报表-店铺维度(V2)。",
    endpoint: "/api/financial/v2/monthProfit/shop.json",
    category: "finance",
    args: [...PROFIT_ARGS, b("monthlyQuery", { description: "是否按月查询" })],
  }),
  makeEndpointSpec({
    tool_name: "sellfox_settlement_summary",
    description: "结算汇总-分页查询(V2)。",
    endpoint: "/api/financial/v2/settlementSummary/groupPage.json",
    category: "finance",
    args: SHOP_DATE_ARGS,
  }),
  makeEndpointSpec({
    tool_name: "sellfox_settlement_detail",
    description: "查询结算明细(V2)。",
    endpoint: "/api/financial/v2/settlementSummary/detailPage.json",
    category: "finance",
    args: SHOP_DATE_ARGS,
  }),

  // ========== 客服 (Customer Service) ==========
  makeEndpointSpec({
    tool_name: "sellfox_reviews",
    description: "获取评价明细列表。",
    endpoint: "/api/review/pageDetailList.json",
    category: "customer_service",
    args: [
      ...SHOP_DATE_ARGS,
      as("marketplaceIdList", { description: "站点ID列表" }),
      as("starList", { description: "星级过滤", enum: ["1", "2", "3", "4", "5"] }),
      s("imageAndVideo", { description: "图片视频评论过滤: 0=全部, 1=图片或视频评论", enum: ["0", "1"] }),
      s("dateType", { description: "日期类型", enum: ["reviewDate", "updateTime"] }),
      as("matchStateList", { description: "匹配状态", enum: ["1", "2", "3"] }),
      s("searchType", { description: "搜索类型", enum: ["asin", "parentAsin", "remark", "buyer", "amazonOrderId", "reviewID"] }),
      s("searchValue", { description: "搜索内容" }),
      as("reviewerTypeList", { description: "买家标识: 0=直评, 1=VP, 2=VN", enum: ["0", "1", "2"] }),
      as("statusList", { description: "处理状态: 0=待处理, 1=处理中, 2=已处理", enum: ["0", "1", "2"] }),
      as("reviewStatusList", { description: "评论状态: 0=无变动, 1=已更新, 2=已删除, 3=新增", enum: ["0", "1", "2", "3"] }),
    ],
  }),
];

export const ENDPOINT_SPECS_BY_NAME: Record<string, EndpointSpec> = {};
for (const spec of ALL_ENDPOINT_SPECS) {
  ENDPOINT_SPECS_BY_NAME[spec.tool_name] = spec;
}
