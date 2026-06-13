import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProspectingAccess } from "@/lib/api";
import { PROSPECTABLE_COMPANY_TYPES } from "@/lib/guardrails";

// GET /api/prospecting/refresh-queue?days=30&limit=25 — VERIFIED + industry companies due for a
// prospecting refresh (last_prospected_at null or older than `days`). A scheduled run (Cowork /
// headless) pulls this, re-prospects each via the opportunity-finder skill, and posts back through
// /api/prospecting/ingest (which bumps last_prospected_at, dropping them from the queue).
// Cost-conscious: verified industry only, capped batch. Auth: Bearer PROSPECTING_INGEST_SECRET / admin.
export async function GET(req: NextRequest) {
  const denied = await requireProspectingAccess(req);
  if (denied) return denied;
  const admin = createAdminClient();

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days")) || 30));
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 25));
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();

  const { data, error } = await admin
    .from("companies")
    .select("id, name, domain, website, hubspot_id, type, last_prospected_at")
    .eq("verified", true)
    .in("type", PROSPECTABLE_COMPANY_TYPES as readonly string[] as string[])  // industry only (no academia/non-profit)
    .not("flagged_for_removal", "is", true)  // never prospect a company flagged for removal (keeps NULL + false)
    .or(`last_prospected_at.is.null,last_prospected_at.lt.${cutoff}`)
    .order("last_prospected_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const queue = (data ?? []).map((c) => ({
    company_id: c.id, name: c.name, domain: c.domain || c.website || null,
    hubspot_id: c.hubspot_id, type: c.type, last_prospected_at: c.last_prospected_at,
  }));
  return NextResponse.json({ count: queue.length, days, limit, queue });
}
