import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import { requireApiAdmin } from "@/lib/api";
import { runInboundSync } from "@/lib/inbound-sync";

// Poll HubSpot for new RFQ deals + contact-form submissions and upsert the inbox.
// Auth: Vercel Cron's Bearer CRON_SECRET, or an admin session ("Sync now"). GET (cron) + POST (UI).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  const secret = serverEnv.CRON_SECRET;
  const authed = Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!authed) {
    const guard = await requireApiAdmin();
    if (guard.error) return guard.error;
  }
  try {
    const result = await runInboundSync(createAdminClient());
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[inbound/sync] failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sync failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
