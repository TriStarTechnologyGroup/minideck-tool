import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAdmin } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { classifyDecisionMaker, type TargetRole } from "@/lib/decision-maker";

export const dynamic = "force-dynamic";

const input = z.object({ dryRun: z.boolean().optional() });

// POST /api/contacts/classify-decision-makers — deterministically flag ICP decision-makers from each
// contact's title vs the active target_roles (keywords + seniority floor). Additive only: it sets
// is_decision_maker=true on new matches and backfills an empty function, but never UNSETS an existing
// flag (manual edits are preserved). dryRun returns a preview without writing. Admin only.
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;
  const dryRun = (input.safeParse(await req.json().catch(() => ({}))).data ?? {}).dryRun ?? false;
  const admin = createAdminClient();

  const [{ data: roleRows }, { data: contacts }] = await Promise.all([
    admin.from("target_roles").select("function, title_keywords, seniority_floor, priority, active").eq("active", true),
    admin.from("contacts").select("id, full_name, position, function, seniority, is_decision_maker").limit(5000),
  ]);
  const roles = (roleRows ?? []) as TargetRole[];
  if (!roles.length) return NextResponse.json({ error: "No active target roles defined — set ICP roles first." }, { status: 400 });

  const newlyFlagged: { id: string; name: string }[] = [];
  const fillByFn = new Map<string, string[]>(); // function → contact ids to backfill
  let alreadyDM = 0;
  for (const c of contacts ?? []) {
    if (c.is_decision_maker) alreadyDM++;
    const r = classifyDecisionMaker({ position: c.position as string, function: c.function as string, seniority: c.seniority as string }, roles);
    if (!r.is) continue;
    if (!c.is_decision_maker) newlyFlagged.push({ id: c.id as string, name: (c.full_name as string) ?? "(unnamed)" });
    if (r.fn && !c.function) { const a = fillByFn.get(r.fn) ?? []; a.push(c.id as string); fillByFn.set(r.fn, a); }
  }
  const functionsFilled = [...fillByFn.values()].reduce((s, a) => s + a.length, 0);

  if (dryRun) {
    return NextResponse.json({ dryRun: true, scanned: (contacts ?? []).length, alreadyDM, wouldFlag: newlyFlagged.length, functionsToFill: functionsFilled, sample: newlyFlagged.slice(0, 25).map((x) => x.name) });
  }

  if (newlyFlagged.length) {
    const { error } = await admin.from("contacts").update({ is_decision_maker: true }).in("id", newlyFlagged.map((x) => x.id));
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  for (const [fn, ids] of fillByFn) {
    await admin.from("contacts").update({ function: fn }).in("id", ids);
  }
  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: "contact.classify_decision_makers", targetType: "contact", detail: { flagged: newlyFlagged.length, functionsFilled } });
  return NextResponse.json({ ok: true, scanned: (contacts ?? []).length, alreadyDM, flagged: newlyFlagged.length, functionsFilled });
}
