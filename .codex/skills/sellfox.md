---
name: sellfox
description: Query Amazon seller data via Sellfox OpenAPI CLI. Use when the user asks about store sales, orders, ads, profits, inventory, reviews, or any Amazon seller metrics. Covers 70+ data endpoints across sales, advertising, finance, FBA, and customer service.
---

# Sellfox CLI Skill

You have access to the `sellfox` CLI tool. It queries Amazon seller data through the Sellfox OpenAPI. Use it to answer user questions about their Amazon business.

## How to run commands

Run `sellfox` commands via Bash. All output is JSON to stdout, logs go to stderr.

```bash
sellfox <command> [--key value ...] [--pretty]
```

## Command reference

### Built-in (always available)

| Command | What it does | Args |
|---------|-------------|------|
| `health-check` | Check connectivity & credentials | none |
| `smoke-check` | Quick full-stack test | none |
| `seller-lists` | List all authorized Amazon shops | none |
| `online-products` | List online products | `--shopIds`, `--searchType`, `--searchContent`, `--dateType`, `--dateStart`, `--dateEnd` |
| `store-sales` | Product sales data | `--startDate` (required), `--endDate` (required), `--groupType`, `--saleType`, `--shopIds`, `--statTimeType`, `--currency` |
| `orders` | Order list with filters | `--shopIds`, `--dateType`, `--dateStart`, `--dateEnd`, `--orderStatus`, `--fulfillment`, `--searchType`, `--searchContent`, `--currency` |
| `ad-report-create` | Create ad download task | `--shopIds` (required), `--adTypeCode` (sp/sb/sd), `--reportTypeCode` (required), `--timeUnit` (daily/summary), `--reportStartDate` (required), `--reportEndDate` (required) |
| `ad-report-query` | Check ad report progress | `--taskId` (required) |
| `ad-report-download` | Download & parse ad report | `--url` (required) |

### Sales data

| Command | What it does |
|---------|-------------|
| `sellfox_online_products_v2` | Online products V2 |
| `sellfox_fba_return_report` | FBA return report |
| `sellfox_fbm_return_report` | FBM return report |

### Advertising (35+ commands)

**Hourly reports:** `sellfox_ads_sp_campaign_hourly`, `sellfox_ads_sp_ad_group_hourly`, `sellfox_ads_sp_product_hourly`, `sellfox_ads_sp_target_hourly`, `sellfox_ads_sp_placement_hourly`, `sellfox_ads_sb_campaign_hourly`, `sellfox_ads_sb_ad_group_hourly`, `sellfox_ads_sb_target_hourly`, `sellfox_ads_sb_placement_hourly`, `sellfox_ads_sd_campaign_hourly`, `sellfox_ads_sd_ad_group_hourly`, `sellfox_ads_sd_product_hourly`, `sellfox_ads_sd_target_hourly`

**Ad base data:** `sellfox_ads_portfolios`, `sellfox_ads_sp_campaigns`, `sellfox_ads_sp_ad_groups`, `sellfox_ads_sp_product_ads`, `sellfox_ads_sp_keywords`, `sellfox_ads_sp_targets`, `sellfox_ads_sp_negative_keywords`, `sellfox_ads_sp_negative_products`, `sellfox_ads_sb_campaigns`, `sellfox_ads_sb_ad_groups`, `sellfox_ads_sb_creatives`, `sellfox_ads_sb_keywords`, `sellfox_ads_sb_targets`, `sellfox_ads_sb_negative_keywords`, `sellfox_ads_sb_negative_products`, `sellfox_ads_sd_campaigns`, `sellfox_ads_sd_ad_groups`, `sellfox_ads_sd_product_ads`, `sellfox_ads_sd_creatives`, `sellfox_ads_sd_targets`, `sellfox_ads_sd_negative_products`

All ad base commands accept: `--shopIds` (required), `--state` (enabled/paused/archived)
All hourly commands accept: `--shopIds` (required), `--reportDate` (required, yyyy-MM-dd)

### Finance & Profit

`sellfox_product_sales`, `sellfox_product_analysis`, `sellfox_shop_performance`, `sellfox_profit_product`, `sellfox_profit_shop`, `sellfox_settlement_profit_asin`, `sellfox_settlement_profit_shop`, `sellfox_profit_report_asin`, `sellfox_profit_report_shop`, `sellfox_settlement_summary`, `sellfox_settlement_detail`, `sellfox_cost_batch_inbound`, `sellfox_cost_batch_outbound`

### Inventory & FBA

`sellfox_warehouse_stock`, `sellfox_fba_stock`, `sellfox_stock_flow`, `sellfox_fba_shipment_list`, `sellfox_fba_shipment_batch_list`, `sellfox_fba_shipment_batch_detail`

### Reviews

`sellfox_reviews` — accepts `--shopIdList`, `--startDate`/`--endDate`, `--starList` (1,2,3,4,5), `--marketplaceIdList`, `--searchType`, `--searchValue`

## Parameter patterns

```
--key value           String
--key 1,2,3           Array (comma-delimited)
--startDate 2026-06-01   Date range start
--endDate 2026-06-07     Date range end
--shopIds 123,456     Shop ID list
--pretty              Pretty-print JSON output
```

## Workflow

1. Identify which data the user needs
2. Pick the right `sellfox` command from above
3. Run via Bash with `--pretty`
4. Parse JSON output, check `ok` field, read `data`
5. Answer in plain language
6. If you need shop IDs first, run `sellfox seller-lists --pretty`

## Tips

- Always add `--pretty` for readable output
- If unsure about shop IDs, run `seller-lists` first
- Ad reports: `ad-report-create` → `ad-report-query` → `ad-report-download`
- Dates: `yyyy-MM-dd` for most, `yyyy-MM-dd HH:mm:ss` for orders
- Run `sellfox --help` to see all commands
- Run `sellfox --help <command>` for per-command help
