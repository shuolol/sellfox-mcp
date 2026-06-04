// ============================================================
// Shop-level permission interceptor — mirrors shop_permission.py
// ============================================================

import type { ApiKeyManager } from "./api-key-manager.js";

export const SHOP_PARAM_NAMES = [
  "shopIds",
  "shopIdList",
  "shop_id",
  "shopId",
  "sellerId",
];

export async function resolveShopIdsForCall(
  apiKeyMgr: ApiKeyManager,
  keyValue: string,
  toolArgs: Record<string, unknown>,
  toolInputSchema?: Record<string, unknown> | null,
): Promise<{ allowed: boolean; error_message?: string; modified_args?: Record<string, unknown> }> {
  const authorizedShopIds = await apiKeyMgr.getAuthorizedShopIds(keyValue);

  // Admin keys bypass all shop restrictions
  if (await apiKeyMgr.isAdmin(keyValue)) {
    return { allowed: true };
  }

  // Find the shop-related param from the tool args
  let shopParamName: string | null = null;
  let shopIdsFromArgs: string[] | null = null;

  for (const name of SHOP_PARAM_NAMES) {
    if (name in toolArgs) {
      shopParamName = name;
      const value = toolArgs[name];
      if (Array.isArray(value)) {
        shopIdsFromArgs = value.map(String);
      } else if (typeof value === "string" && value.trim()) {
        shopIdsFromArgs = [value.trim()];
      }
      break;
    }
  }

  // Check if the tool schema has shop-related properties
  if (!shopParamName && toolInputSchema) {
    const properties = (toolInputSchema as Record<string, unknown>)["properties"] as Record<string, unknown> | undefined;
    if (properties) {
      for (const name of SHOP_PARAM_NAMES) {
        if (name in properties) {
          shopParamName = name;
          break;
        }
      }
    }
  }

  if (!shopParamName) {
    // No shop-related param in this tool — allow through
    return { allowed: true };
  }

  if (!shopIdsFromArgs || shopIdsFromArgs.length === 0) {
    // No shop IDs provided — auto-inject all authorized shops
    const allShops = await apiKeyMgr.getAuthorizedShops(keyValue);
    if (allShops.length === 0) {
      return {
        allowed: false,
        error_message: `密钥未授权任何店铺，无法自动填充 ${shopParamName}`,
      };
    }
    const injected = allShops.map((s) => s.shop_id);
    return {
      allowed: true,
      modified_args: { ...toolArgs, [shopParamName]: injected },
    };
  }

  // Verify all requested shops are authorized
  const unauthorized = shopIdsFromArgs.filter((id) => !authorizedShopIds.has(id));
  if (unauthorized.length > 0) {
    return {
      allowed: false,
      error_message: `无权访问以下店铺: ${unauthorized.join(", ")}`,
    };
  }

  return { allowed: true };
}
