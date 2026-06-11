import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProspectingAccess } from "@/lib/api";
import { ingestProspecting, prospectingPayload } from "@/lib/prospecting";

// POST /api/prospecting/ingest — the bridge the Claude prospecting skill calls to log a
// run's output (companies + drug programs + scored opportunities). Auth: bearer
// PROSPECTING_INGEST_SECRET (for the headless skill) or an admin session (manual).
// Returns the per-table insert/upsert counts.
export async function POST(req: NextRequest) {
  const denied = await requireProspectingAccess(req);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = prospectingPayload.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 422 });
  }

  try {
    const counts = await ingestProspecting(createAdminClient(), parsed.data);
    return NextResponse.json({ ok: true, counts });
  } catch (err) {
    console.error("[prospecting/ingest] failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Ingest failed" }, { status: 500 });
  }
}
