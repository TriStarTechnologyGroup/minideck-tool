import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import { requireApiAdmin } from "@/lib/api";
import { syncContactsToHubspot } from "@/lib/contact-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/contacts/sync-hubspot — admin or Bearer CRON_SECRET. Body: { mode }.
//   "dryrun" → match counts + would-create names (writes nothing).
//   "sync"   → adopt ids + enrich app + push fields to HubSpot. Creates new HubSpot contacts ONLY
//              with { createMissing: true }.
export async function POST(req: NextRequest) {
  const secret = serverEnv.CRON_SECRET;
  const authed = Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!authed) { const g = await requireApiAdmin(); if (g.error) return g.error; }

  const body = await req.json().catch(() => ({}));
  const mode = body?.mode as string | undefined;
  const admin = createAdminClient();
  try {
    if (mode === "dryrun") return NextResponse.json({ ok: true, mode, report: await syncContactsToHubspot(admin, { dryRun: true }) });
    if (mode === "sync") return NextResponse.json({ ok: true, mode, report: await syncContactsToHubspot(admin, { dryRun: false, createMissing: body?.createMissing === true }) });
    return NextResponse.json({ error: "Unknown mode. Use 'dryrun' | 'sync'." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "sync failed" }, { status: 500 });
  }
}
