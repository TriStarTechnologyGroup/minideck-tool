import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import { requireApiAdmin } from "@/lib/api";
import { classifyMissingCompanyTypes, syncCompaniesToHubspot } from "@/lib/company-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/companies/sync — admin or Bearer CRON_SECRET. Body: { mode }.
//   mode "classify"        → Claude-classify companies still 'Needs Type Defined' (also accepts { limit }).
//   mode "hubspot-dryrun"  → dedup report: match counts + the names that WOULD be created. Writes nothing.
//   mode "hubspot-sync"    → enrich app + push type to HubSpot for matches. Creates new HubSpot
//                            companies ONLY when { createMissing: true } is also passed.
export async function POST(req: NextRequest) {
  const secret = serverEnv.CRON_SECRET;
  const authed = Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!authed) { const g = await requireApiAdmin(); if (g.error) return g.error; }

  const body = await req.json().catch(() => ({}));
  const mode = body?.mode as string | undefined;
  const admin = createAdminClient();
  try {
    if (mode === "classify") {
      return NextResponse.json({ ok: true, mode, ...(await classifyMissingCompanyTypes(admin, { limit: body?.limit })) });
    }
    if (mode === "hubspot-dryrun") {
      return NextResponse.json({ ok: true, mode, report: await syncCompaniesToHubspot(admin, { dryRun: true }) });
    }
    if (mode === "hubspot-sync") {
      return NextResponse.json({ ok: true, mode, report: await syncCompaniesToHubspot(admin, { dryRun: false, createMissing: body?.createMissing === true }) });
    }
    return NextResponse.json({ error: "Unknown mode. Use 'classify' | 'hubspot-dryrun' | 'hubspot-sync'." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "sync failed" }, { status: 500 });
  }
}
