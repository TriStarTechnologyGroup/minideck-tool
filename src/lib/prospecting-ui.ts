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

/** CSS var for the tier-colored accent rail on opportunity cards. */
export function railVar(tier: string | null): string {
  const r = tierRank(tier);
  return r === 1 ? "var(--color-primary)" : r === 2 ? "var(--color-link)" : "var(--color-line-strong)";
}

/** "TA1621 [PD-L1] | TA2660 [PD-L1]" → chips; a summary sentence → a note instead. */
export function parseTmas(s: string | null): { chips: { code: string; marker?: string }[]; note?: string } {
  if (!s) return { chips: [] };
  const parts = s.split("|").map((x) => x.trim()).filter(Boolean);
  if (parts.length <= 1 && !s.includes("[")) return { chips: [], note: s };
  const chips = parts.map((p) => {
    const m = p.match(/^(\S+)\s*\[([^\]]+)\]/);
    return m ? { code: m[1], marker: m[2] } : { code: p };
  });
  return { chips };
}

/**
 * Live reviewer nudge to the "Matching TMA SKU" score component. Starts from the skill's
 * awarded points; each rejected suggestion subtracts one match's worth, each added TMA adds
 * one, clamped to the component cap. One "match's worth" = base/suggested (or cap/4 when the
 * skill suggested none). Confirmations don't move the number (they protect against drift).
 * Returns the skill's base unchanged when there's no reject/add signal.
 */
export function tmaAdjustedPoints(
  { base, weightMax, suggested, rejected, added }: { base: number; weightMax: number; suggested: number; rejected: number; added: number },
): number {
  if (!rejected && !added) return base;
  const unit = suggested > 0 ? base / suggested : weightMax / 4;
  return Math.max(0, Math.min(weightMax, Math.round(base + (added - rejected) * unit)));
}

/** "R-05 Pre/Post-IO cohort, L-04 RNA-Seq" → [{code:"R-05", label:"Pre/Post-IO cohort"}, …]. */
export function parseCaps(s: string | null): { code?: string; label: string }[] {
  if (!s) return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean).map((p) => {
    const m = p.match(/^([A-Za-z]-\d+)\s+(.*)$/);
    return m ? { code: m[1], label: m[2] } : { label: p };
  });
}
