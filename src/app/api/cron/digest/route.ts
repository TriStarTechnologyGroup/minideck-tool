import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import { requireApiAdmin } from "@/lib/api";
import { composeDigest } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/cron/digest — compose + store the weekly digest (and run the guardrail evals). Pushes the
// text to DIGEST_WEBHOOK_URL when set. Scheduled weekly via vercel.json. Auth: Vercel Cron's
// `Authorization: Bearer <CRON_SECRET>`, or an admin session for a manual run.
export async function GET(req: NextRequest) {
  const secret = serverEnv.CRON_SECRET;
  const authed = Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!authed) {
    const guard = await requireApiAdmin();
    if (guard.error) return guard.error;
  }

  const admin = createAdminClient();
  const { payload, text } = await composeDigest(admin);
  await admin.from("digests").insert({ payload, text });

  let pushed = false;
  if (serverEnv.DIGEST_WEBHOOK_URL) {
    try {
      const r = await fetch(serverEnv.DIGEST_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      pushed = r.ok;
    } catch { /* webhook delivery is best-effort */ }
  }
  return NextResponse.json({ ok: true, pushed, hotLeads: payload.hot_leads.length, guardrails: payload.guardrails.length, tier1: payload.tier1 });
}
