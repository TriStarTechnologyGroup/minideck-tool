// Shared, pure UI helpers for the prospecting pages (no server-only imports).

/** 1 / 2 / 3 from a fit-tier label like "Tier 1 — strong fit"; 9 if unknown. */
export function tierRank(tier: string | null): number {
  if (!tier) return 9;
  if (tier.startsWith("Tier 1")) return 1;
  if (tier.startsWith("Tier 2")) return 2;
  if (tier.startsWith("Tier 3")) return 3;
  return 9;
}

/** Tailwind chip classes by tier (mirrors the leads page's hot/warm/light scale). */
export function tierChip(tier: string | null): string {
  const r = tierRank(tier);
  if (r === 1) return "bg-primary text-white";
  if (r === 2) return "bg-surface-blue-soft text-link";
  return "bg-surface-muted text-nav";
}

export const isProprietary = (p: string | null) => !!p && p.toLowerCase().startsWith("proprietary");
