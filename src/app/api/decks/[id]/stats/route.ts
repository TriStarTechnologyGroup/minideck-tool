import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";
import { getMergedStatsForTokens, type FullStats } from "@/lib/link-stats";

// GET /api/decks/[id]/stats — batched stats for ALL links in a deck (cached ~60s).
// One grouped Plausible query set + one engagement query, vs. the per-row fan-out.
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; stats: Record<string, FullStats> }>();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  const { id } = await params;

  const cached = cache.get(id);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json({ stats: cached.stats, refreshedAt: new Date(cached.at).toISOString(), cached: true });
  }

  const admin = createAdminClient();
  const { data: deck } = await admin.from("decks").select("plausible_site_id").eq("id", id).single();
  if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });

  const { data: links } = await admin.from("links").select("token").eq("deck_id", id);
  const tokens = (links ?? []).map((l: { token: string }) => l.token);

  const stats = await getMergedStatsForTokens((deck as { plausible_site_id: string }).plausible_site_id, tokens);
  const at = Date.now();
  cache.set(id, { at, stats });
  return NextResponse.json({ stats, refreshedAt: new Date(at).toISOString(), cached: false });
}
