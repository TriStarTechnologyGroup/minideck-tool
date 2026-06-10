import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// POST /api/prospecting/opportunities/[id]/capabilities — confirm a suggested capability,
// add one the reviewer deems relevant, or remove an added one.
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), capabilityRowId: z.string().min(1), confirmed: z.boolean() }),
  z.object({ action: z.literal("add"), label: z.string().trim().min(1), capability_id: z.string().trim().nullish() }),
  z.object({ action: z.literal("remove"), capabilityRowId: z.string().min(1) }),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  const { id } = await params;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  const d = parsed.data;
  const admin = createAdminClient();

  if (d.action === "confirm") {
    const { error } = await admin.from("opportunity_capabilities").update({ confirmed: d.confirmed }).eq("id", d.capabilityRowId).eq("opportunity_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (d.action === "add") {
    const { error } = await admin.from("opportunity_capabilities").insert({ opportunity_id: id, label: d.label, capability_id: d.capability_id ?? null, source: "added", confirmed: true, added_by: guard.profile.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    // Only reviewer-added rows can be removed (don't let users delete the skill's suggestions).
    const { error } = await admin.from("opportunity_capabilities").delete().eq("id", d.capabilityRowId).eq("opportunity_id", id).eq("source", "added");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: `opportunity.capability.${d.action}`, targetType: "opportunity", target: id });
  return NextResponse.json({ ok: true });
}
