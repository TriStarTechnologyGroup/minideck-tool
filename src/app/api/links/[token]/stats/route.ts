import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";
import { isPlausibleConfigured, getLinkStats, type LinkStats } from "@/lib/plausible";

// Cache only the Plausible part (rate limits); engagement comes fresh from our DB.
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; stats: LinkStats }>();

// GET /api/links/[token]/stats
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  const { token } = await params;

  const admin = createAdminClient();

  // Resolve the link's deck → plausible_site_id.
  const { data: link } = await admin
    .from("links")
    .select("token, deck:decks(plausible_site_id)")
    .eq("token", token)
    .single();
  const siteId = (link?.deck as { plausible_site_id?: string } | null)?.plausible_site_id;
  if (!siteId) return NextResponse.json({ error: "Link or deck not found" }, { status: 404 });

  // Engaged-time from our collector (always fresh).
  const { data: eng } = await admin
    .from("link_engagement")
    .select("deck_seconds, artifact_seconds, per_slide")
    .eq("token", token)
    .maybeSingle();
  const engagement = {
    timeSeconds: eng?.deck_seconds ?? 0,
    artifactSeconds: eng?.artifact_seconds ?? 0,
    perSlideSeconds: (eng?.per_slide as Record<string, number>) ?? {},
  };

  // Plausible counts (cached ~60s). If Plausible isn't configured, return engagement only.
  let plausible: LinkStats | null = null;
  if (isPlausibleConfigured()) {
    const cached = cache.get(token);
    if (cached && Date.now() - cached.at < TTL_MS) {
      plausible = cached.stats;
    } else {
      try {
        plausible = await getLinkStats(siteId, token);
        cache.set(token, { at: Date.now(), stats: plausible });
      } catch {
        plausible = null;
      }
    }
  }

  const base: LinkStats =
    plausible ?? {
      opened: engagement.timeSeconds > 0,
      views: 0,
      lastSeen: null,
      furthestSlide: 0,
      slides: [],
      artifactViews: engagement.artifactSeconds > 0 ? 1 : 0,
    };

  return NextResponse.json({
    stats: { ...base, ...engagement },
    refreshedAt: new Date().toISOString(),
  });
}
