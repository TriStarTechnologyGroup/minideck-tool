import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import { requireApiAdmin } from "@/lib/api";
import { sweepStaleAlerts } from "@/lib/sweep";

// GET /api/cron/sweep — backstop for milestone alerts the live beacon path never
// delivered (HubSpot down at beacon time + no later beacon). Scheduled hourly via
// vercel.json. Auth: Vercel Cron's `Authorization: Bearer <CRON_SECRET>` header, or
// an admin session for a manual run. Returns a {scanned, sent, failed, skipped} summary.
export async function GET(req: NextRequest) {
  const secret = serverEnv.CRON_SECRET;
  const authed = Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!authed) {
    const guard = await requireApiAdmin();
    if (guard.error) return guard.error;
  }

  const result = await sweepStaleAlerts(createAdminClient(), { now: new Date().toISOString() });
  return NextResponse.json(result);
}
