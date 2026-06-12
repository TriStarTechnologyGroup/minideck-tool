import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProspectingAccess } from "@/lib/api";

// GET /api/prospecting/inbound-queue — inbound-drafted opportunities still awaiting scoring
// (shell created on sync, no score_components yet). The opportunity-finder skill pulls this,
// scores each (fit tier, score_components, capabilities) using the seed context, and posts
// back via /api/prospecting/ingest with the SAME asset_key (refresh) to fill the shell.
// Auth: bearer PROSPECTING_INGEST_SECRET or admin.
export async function GET(req: NextRequest) {
  const denied = await requireProspectingAccess(req);
  if (denied) return denied;
  const admin = createAdminClient();

  const { data: inqs, error } = await admin
    .from("inbound_inquiries")
    .select("id, opportunity_id, source, classification, prospect_eligible, company_name, company_domain, subject, message, requested_products")
    .not("opportunity_id", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const oppIds = [...new Set((inqs ?? []).map((i) => i.opportunity_id as string))];
  if (!oppIds.length) return NextResponse.json({ count: 0, queue: [] });

  const [{ data: opps }, { data: comps }] = await Promise.all([
    admin.from("opportunities").select("id, asset_name, asset_key, fit_score, company_id").in("id", oppIds),
    admin.from("opportunity_score_components").select("opportunity_id").in("opportunity_id", oppIds),
  ]);
  const oppById = new Map((opps ?? []).map((o) => [o.id as string, o]));
  const scored = new Set((comps ?? []).map((c) => c.opportunity_id as string));

  const queue = (inqs ?? [])
    .filter((i) => i.opportunity_id && !scored.has(i.opportunity_id as string))
    .map((i) => {
      const o = oppById.get(i.opportunity_id as string);
      return {
        inquiry_id: i.id, opportunity_id: i.opportunity_id, source: i.source,
        classification: i.classification, prospect_eligible: i.prospect_eligible,
        company_name: i.company_name, company_domain: i.company_domain,
        asset_name: o?.asset_name ?? null, asset_key: o?.asset_key ?? null,
        subject: i.subject, message: i.message, requested_products: i.requested_products ?? [],
      };
    });

  return NextResponse.json({ count: queue.length, queue });
}
