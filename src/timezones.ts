// ============================================================
// Marketplace timezone helpers — mirrors timezones.py
// ============================================================

export const MARKETPLACE_TIMEZONES: Record<string, string> = {
  US: "America/Los_Angeles",
  CA: "America/Toronto",
  MX: "America/Mexico_City",
  UK: "Europe/London",
  DE: "Europe/Berlin",
  FR: "Europe/Paris",
  IT: "Europe/Rome",
  ES: "Europe/Madrid",
  JP: "Asia/Tokyo",
  AU: "Australia/Sydney",
  AE: "Asia/Dubai",
  SG: "Asia/Singapore",
  BR: "America/Sao_Paulo",
  SE: "Europe/Stockholm",
  PL: "Europe/Warsaw",
  TR: "Europe/Istanbul",
  BE: "Europe/Brussels",
  SA: "Asia/Riyadh",
  NL: "Europe/Amsterdam",
  IN: "Asia/Kolkata",
};

export function getTimezoneName(marketplaceCode?: string | null): string {
  if (!marketplaceCode) return "UTC";
  return MARKETPLACE_TIMEZONES[marketplaceCode.toUpperCase()] ?? "UTC";
}
