import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDeckLinkStats, getLinkStats, isPlausibleConfigured, type LinkStats } from "@/lib/plausible";

export type FullStats = LinkStats & {
  timeSeconds: number; // engaged time on the deck (collector)
  artifactSeconds: number; // engaged time on the artifact page
  perSlideSeconds: Record<string, number>;
  ctaClicks: Record<string, number>; // { cta_book_meeting: 1, ... }
};

/** Merge Plausible counts (event-level) with our engagement collector (true time). */
export async function getMergedStats(siteId: string, token: string): Promise<FullStats> {
  const admin = createAdminClient();
  const { data: eng } = await admin
    .from("link_engagement")
    .select("deck_seconds, artifact_seconds, per_slide, cta_clicks")
    .eq("token", token)
    .maybeSingle();
  const engagement = {
    timeSeconds: eng?.deck_seconds ?? 0,
    artifactSeconds: eng?.artifact_seconds ?? 0,
    perSlideSeconds: (eng?.per_slide as Record<string, number>) ?? {},
    ctaClicks: (eng?.cta_clicks as Record<string, number>) ?? {},
  };

  let plausible: LinkStats | null = null;
  if (isPlausibleConfigured()) {
    try {
      plausible = await getLinkStats(siteId, token);
    } catch (err) {
      console.error("[link-stats] Plausible query failed for token", token, err);
      plausible = null;
    }
  }

  const base: LinkStats = plausible ?? {
    opened: engagement.timeSeconds > 0,
    views: 0,
    lastSeen: null,
    furthestSlide: 0,
    slides: [],
    artifactViews: engagement.artifactSeconds > 0 ? 1 : 0,
  };

  return { ...base, ...engagement };
}

/**
 * Batched variant of getMergedStats for a whole deck: one link_engagement query
 * for all tokens + one grouped Plausible query set, merged per token. Replaces
 * the per-row fan-out (5 Plausible queries × N links) with a fixed ~5 queries.
 */
export async function getMergedStatsForTokens(
  siteId: string,
  tokens: string[],
): Promise<Record<string, FullStats>> {
  const out: Record<string, FullStats> = {};
  if (tokens.length === 0) return out;

  const admin = createAdminClient();
  const { data: engRows } = await admin
    .from("link_engagement")
    .select("token, deck_seconds, artifact_seconds, per_slide, cta_clicks")
    .in("token", tokens);
  const engMap = new Map<string, { deck_seconds?: number; artifact_seconds?: number; per_slide?: unknown; cta_clicks?: unknown }>();
  for (const e of engRows ?? []) engMap.set(e.token, e);

  let plausibleMap: Record<string, LinkStats> = {};
  if (isPlausibleConfigured()) {
    try {
      plausibleMap = await getDeckLinkStats(siteId, tokens);
    } catch (err) {
      console.error("[link-stats] batched Plausible query failed", err);
      plausibleMap = {};
    }
  }

  for (const token of tokens) {
    const eng = engMap.get(token);
    const engagement = {
      timeSeconds: eng?.deck_seconds ?? 0,
      artifactSeconds: eng?.artifact_seconds ?? 0,
      perSlideSeconds: (eng?.per_slide as Record<string, number>) ?? {},
      ctaClicks: (eng?.cta_clicks as Record<string, number>) ?? {},
    };
    const base: LinkStats = plausibleMap[token] ?? {
      opened: engagement.timeSeconds > 0,
      views: 0,
      lastSeen: null,
      furthestSlide: 0,
      slides: [],
      artifactViews: engagement.artifactSeconds > 0 ? 1 : 0,
    };
    out[token] = { ...base, ...engagement };
  }
  return out;
}
