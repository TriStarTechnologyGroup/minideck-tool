import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLinkStats, isPlausibleConfigured, type LinkStats } from "@/lib/plausible";

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
    } catch {
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
