import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProspectingAccess } from "@/lib/api";

// POST /api/prospecting/opportunities/merge  { keep_id, remove_id }
// Fold a duplicate into the keeper: move reviewer feedback (if the keeper has none) and any
// reviewer-added capabilities from `remove` onto `keep`, then delete `remove`. For cleaning
// up dupes that predate the (company_id, asset_key) constraint without losing human input.
// Auth: bearer PROSPECTING_INGEST_SECRET or an admin session.
const input = z.object({ keep_id: z.string().uuid(), remove_id: z.string().uuid() });

export async function POST(req: NextRequest) {
  const denied = await requireProspectingAccess(req);
  if (denied) return denied;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide keep_id and remove_id (uuids)" }, { status: 400 });
  const { keep_id, remove_id } = parsed.data;
  if (keep_id === remove_id) return NextResponse.json({ error: "keep_id and remove_id are the same" }, { status: 400 });

  const admin = createAdminClient();
  const { data: rows, error: qe } = await admin.from("opportunities").select("id").in("id", [keep_id, remove_id]);
  if (qe) return NextResponse.json({ error: qe.message }, { status: 400 });
  const found = new Set((rows ?? []).map((r) => r.id));
  if (!found.has(keep_id) || !found.has(remove_id)) return NextResponse.json({ error: "Both opportunities must exist" }, { status: 404 });

  // Move reviewer feedback onto the keeper only if the keeper has none (feedback is unique
  // per opportunity); otherwise the keeper's feedback wins and remove's is dropped with it.
  let movedFeedback = false;
  const { data: keepFb } = await admin.from("opportunity_feedback").select("opportunity_id").eq("opportunity_id", keep_id).maybeSingle();
  if (!keepFb) {
    const { data: remFb } = await admin.from("opportunity_feedback").select("opportunity_id").eq("opportunity_id", remove_id).maybeSingle();
    if (remFb) {
      const { error } = await admin.from("opportunity_feedback").update({ opportunity_id: keep_id }).eq("opportunity_id", remove_id);
      if (error) return NextResponse.json({ error: `move feedback: ${error.message}` }, { status: 400 });
      movedFeedback = true;
    }
  }

  // Move reviewer-added capabilities (skill-suggested ones are regenerated per run, so leave them).
  const { data: movedCaps, error: ce } = await admin
    .from("opportunity_capabilities").update({ opportunity_id: keep_id })
    .eq("opportunity_id", remove_id).neq("source", "suggested").select("id");
  if (ce) return NextResponse.json({ error: `move capabilities: ${ce.message}` }, { status: 400 });

  const { error: de } = await admin.from("opportunities").delete().eq("id", remove_id); // remaining children cascade
  if (de) return NextResponse.json({ error: `delete remove: ${de.message}` }, { status: 400 });

  return NextResponse.json({ ok: true, keep_id, removed: remove_id, moved_feedback: movedFeedback, moved_capabilities: movedCaps?.length ?? 0 });
}
