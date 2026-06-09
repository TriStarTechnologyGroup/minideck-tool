import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";
import { getMergedStatsForTokens, type FullStats } from "@/lib/link-stats";

// GET /api/campaigns/[id]/stats — batched engagement for every account link in the
// campaign (one grouped Plausible query for the campaign's deck site). Cached ~60s.
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
  const { data: campaign } = await admin.from("campaigns").select("deck:decks(plausible_site_id)").eq("id", id).single();
  const siteId = (campaign?.deck as { plausible_site_id?: string } | null)?.plausible_site_id;
  if (!siteId) return NextResponse.json({ error: "Campaign or deck not found" }, { status: 404 });

  // Tokens of all account links in this campaign. Resolve via account ids in two
  // steps: `links` and `accounts` have two FKs between them (links.account_id and
  // accounts.link_id), so an `accounts!inner` embed is ambiguous and returns nothing.
  const { data: accts } = await admin.from("accounts").select("id").eq("campaign_id", id);
  const acctIds = (accts ?? []).map((a: { id: string }) => a.id);
  const { data: links } = acctIds.length
    ? await admin.from("links").select("token").in("account_id", acctIds)
    : { data: [] as { token: string }[] };
  const tokens = (links ?? []).map((l: { token: string }) => l.token);

  const stats = await getMergedStatsForTokens(siteId, tokens);
  const at = Date.now();
  cache.set(id, { at, stats });
  return NextResponse.json({ stats, refreshedAt: new Date(at).toISOString(), cached: false });
}
