import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";
import { getMergedStats, type FullStats } from "@/lib/link-stats";

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; stats: FullStats }>();

// GET /api/links/[token]/stats — merged Plausible counts + engaged time (cached ~60s).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  const { token } = await params;

  const cached = cache.get(token);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json({ stats: cached.stats, refreshedAt: new Date(cached.at).toISOString(), cached: true });
  }

  const admin = createAdminClient();
  const { data: link } = await admin
    .from("links")
    .select("token, deck:decks(plausible_site_id)")
    .eq("token", token)
    .single();
  const siteId = (link?.deck as { plausible_site_id?: string } | null)?.plausible_site_id;
  if (!siteId) return NextResponse.json({ error: "Link or deck not found" }, { status: 404 });

  const stats = await getMergedStats(siteId, token);
  const at = Date.now();
  cache.set(token, { at, stats });
  return NextResponse.json({ stats, refreshedAt: new Date(at).toISOString(), cached: false });
}
