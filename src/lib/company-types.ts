// Canonical company classification. Drives the /companies directory, the type filter on the
// companies + prospecting tables, and the HubSpot company-type property sync.
export const COMPANY_TYPES = [
  "Pharma",
  "Biotech",
  "Early Stage Startup",
  "Academia",
  "Non-Profit",
  "Other",
  "Needs Type Defined",
] as const;

export type CompanyType = (typeof COMPANY_TYPES)[number];

export const NEEDS_TYPE: CompanyType = "Needs Type Defined";

// Default filter on both the companies and prospecting tables — TriStar's core industry segments.
export const DEFAULT_TYPE_FILTER: CompanyType[] = ["Pharma", "Biotech"];

export function isCompanyType(v: unknown): v is CompanyType {
  return typeof v === "string" && (COMPANY_TYPES as readonly string[]).includes(v);
}

// Short chip styling per type (Tailwind utility classes used across tables).
export const TYPE_CHIP: Record<CompanyType, string> = {
  Pharma: "bg-primary text-white",
  Biotech: "bg-surface-blue-soft text-link",
  "Early Stage Startup": "bg-emerald-50 text-emerald-700",
  Academia: "bg-amber-50 text-amber-700",
  "Non-Profit": "bg-purple-50 text-purple-700",
  Other: "bg-surface-muted text-nav",
  "Needs Type Defined": "bg-surface-muted text-ink-muted/70",
};
