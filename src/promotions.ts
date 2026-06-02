// ============================================================
// Promotion normalization helpers — mirrors promotions.py
// ============================================================

export interface PromotionWindow {
  promotion_id: string;
  label: string;
  start_at: string; // "YYYY-MM-DD HH:MM:SS"
  end_at: string;
  category_text: string;
  promotion_type_text: string;
}

function parseDate(value: string): Date {
  const d = new Date(value + "T00:00:00");
  if (isNaN(d.getTime())) throw new Error(`无法解析日期: ${value}`);
  return d;
}

function parseDatetime(value: string): Date {
  // Try "YYYY-MM-DD HH:MM:SS" then "YYYY-MM-DD HH:MM"
  const d1 = new Date(value.replace(" ", "T"));
  if (!isNaN(d1.getTime())) return d1;
  const d2 = new Date(value.replace(" ", "T") + ":00");
  if (!isNaN(d2.getTime())) return d2;
  throw new Error(`无法解析时间: ${value}`);
}

function dateRange(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function safeInt(value: unknown, fallback = 0): number {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value ? 1 : 0;
  const n = Number(String(value).replace(",", ""));
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function pickCouponLabel(text: unknown): string {
  const t = normalizeText(text);
  if (["percent", "百分"].some((tok) => t.includes(tok))) return "coupon.percent_off";
  if (["amount", "金额", "money", "固定", "save", "$", "¥", "€", "£"].some((tok) => t.includes(tok))) {
    return "coupon.amount_off";
  }
  return "coupon.generic";
}

function pickManageLabel(promotionType: unknown): string {
  const mapping: Record<number, string> = {
    3: "manage.buy_one_get_one",
    4: "manage.purchase_discount",
    5: "manage.fixed_price",
    8: "manage.social_media",
  };
  return mapping[safeInt(promotionType)] ?? "manage.generic";
}

function pickDiscountLabel(customerTarget: unknown): string {
  const target = normalizeText(customerTarget).replace(/ /g, "_");
  if (target === "prime_exclusive") return "discount.prime_exclusive";
  if (target === "all_customers") return "discount.all_customers";
  return "discount.generic";
}

function pickDealLabel(promotionType: unknown): string {
  const mapping: Record<number, string> = {
    1: "deal.best_deal",
    2: "deal.lightning_deal",
  };
  return mapping[safeInt(promotionType)] ?? "deal.generic";
}

function classifyCouponActivity(row: Record<string, unknown>): string {
  for (const key of ["promotion_type_text", "coupon_type_text", "discount_type_text", "type_text"]) {
    const value = row[key];
    if (value) return pickCouponLabel(value);
  }
  return "coupon.generic";
}

export function classifyPromotion(
  promotion: Record<string, unknown>,
  secKillMap: Record<string, Record<string, unknown>>,
  manageMap: Record<string, Record<string, unknown>>,
  discountMap: Record<string, Record<string, unknown>>,
): string {
  const category = safeInt(promotion["category"]);
  const promotionId = String(promotion["promotion_id"] ?? promotion["promotionId"] ?? "");
  if (category === 1) return pickCouponLabel(promotion["promotion_type_text"]);
  if (category === 2) return pickDealLabel((secKillMap[promotionId] ?? {})["promotion_type"]);
  if (category === 3) return pickManageLabel((manageMap[promotionId] ?? {})["promotion_type"]);
  if (category === 4) return pickDiscountLabel((discountMap[promotionId] ?? {})["customer_target"]);
  return "promotion.unknown";
}

export function buildPromotionWindows(
  listingRecords: Record<string, unknown>[],
  secKillMap: Record<string, Record<string, unknown>>,
  manageMap: Record<string, Record<string, unknown>>,
  discountMap: Record<string, Record<string, unknown>>,
): {
  windowsByAsin: Record<string, PromotionWindow[]>;
  asinMeta: Record<string, Record<string, unknown>>;
} {
  const windowsByAsin: Record<string, PromotionWindow[]> = {};
  const asinMeta: Record<string, Record<string, unknown>> = {};

  for (const row of listingRecords) {
    const asin = String(row["asin"] ?? "");
    if (!asin) continue;
    if (!asinMeta[asin]) {
      asinMeta[asin] = {
        asin,
        seller_sku: String(row["seller_sku"] ?? ""),
        item_name: String(row["item_name"] ?? ""),
        store_name: String(row["store_name"] ?? ""),
        region_name: String(row["region_name"] ?? ""),
      };
    }
    const promotionList = (row["promotion_list"] as Record<string, unknown>[]) ?? [];
    for (const promotion of promotionList) {
      const promotionId = String(promotion["promotion_id"] ?? "");
      const startAt = parseDatetime(String(promotion["promotion_start_time"]));
      const endAt = parseDatetime(String(promotion["promotion_end_time"]));
      const window: PromotionWindow = {
        promotion_id: promotionId,
        label: classifyPromotion(promotion, secKillMap, manageMap, discountMap),
        start_at: startAt.toISOString().replace("T", " ").slice(0, 19),
        end_at: endAt.toISOString().replace("T", " ").slice(0, 19),
        category_text: String(promotion["category_text"] ?? ""),
        promotion_type_text: String(promotion["promotion_type_text"] ?? ""),
      };
      if (!windowsByAsin[asin]) windowsByAsin[asin] = [];
      windowsByAsin[asin]!.push(window);
    }
  }
  return { windowsByAsin, asinMeta };
}

export function promotionDatesByAsin(
  windowsByAsin: Record<string, PromotionWindow[]>,
): Record<string, Set<string>> {
  const output: Record<string, Set<string>> = {};
  for (const [asin, windows] of Object.entries(windowsByAsin)) {
    const dates = new Set<string>();
    for (const w of windows) {
      for (const day of dateRange(parseDate(w.start_at.slice(0, 10)), parseDate(w.end_at.slice(0, 10)))) {
        dates.add(day.toISOString().slice(0, 10));
      }
    }
    output[asin] = dates;
  }
  return output;
}

export function activePromotionsForTarget(
  windows: PromotionWindow[],
  targetDate: Date,
  currentSiteDatetime: Date,
  historicalMode: boolean,
): PromotionWindow[] {
  if (historicalMode) {
    return windows.filter((w) => {
      const d = parseDate(w.start_at.slice(0, 10));
      return d <= targetDate && targetDate <= parseDate(w.end_at.slice(0, 10));
    });
  }
  return windows.filter((w) => {
    const s = parseDatetime(w.start_at);
    const e = parseDatetime(w.end_at);
    return s <= currentSiteDatetime && currentSiteDatetime <= e;
  });
}

export function serializePromotionWindow(window: PromotionWindow): Record<string, unknown> {
  return {
    promotion_id: window.promotion_id,
    label: window.label,
    start_at: window.start_at,
    end_at: window.end_at,
    category_text: window.category_text,
    promotion_type_text: window.promotion_type_text,
  };
}
