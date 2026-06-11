import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// POST /api/prospecting/opportunities/[id]/tma — reviewer feedback on the matched TMAs.
//   confirm / reject — verdict on a skill-suggested TMA (keyed by TA#)
//   add              — add a catalog TMA the skill missed
//   clear            — remove the feedback row (back to neutral / un-add)
// Stored in opportunity_tma_feedback (survives re-ingest) and read back by the skill.
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), ta_number: z.string().trim().min(1), sku: z.string().trim().nullish(), label: z.string().trim().nullish() }),
  z.object({ action: z.literal("reject"), ta_number: z.string().trim().min(1), sku: z.string().trim().nullish(), label: z.string().trim().nullish() }),
  z.object({ action: z.literal("add"), ta_number: z.string().trim().min(1), sku: z.string().trim().nullish(), label: z.string().trim().min(1) }),
  z.object({ action: z.literal("clear"), ta_number: z.string().trim().min(1) }),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  const { id } = await params;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  const d = parsed.data;
  const admin = createAdminClient();

  if (d.action === "clear") {
    const { error } = await admin.from("opportunity_tma_feedback").delete().eq("opportunity_id", id).eq("ta_number", d.ta_number);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    const verdict = d.action === "add" ? "added" : d.action === "confirm" ? "confirmed" : "rejected";
    const row = { opportunity_id: id, ta_number: d.ta_number, sku: d.sku ?? null, label: d.label ?? null, verdict, added_by: guard.profile.id, updated_at: new Date().toISOString() };
    // Manual upsert on (opportunity_id, ta_number): toggle the verdict in place.
    const { data: ex } = await admin.from("opportunity_tma_feedback").select("id").eq("opportunity_id", id).eq("ta_number", d.ta_number).maybeSingle();
    if (ex?.id) {
      const { error } = await admin.from("opportunity_tma_feedback").update(row).eq("id", ex.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    } else {
      const { error } = await admin.from("opportunity_tma_feedback").insert(row);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: `opportunity.tma.${d.action}`, targetType: "opportunity", target: id, detail: { ta_number: d.ta_number } });
  return NextResponse.json({ ok: true });
}
