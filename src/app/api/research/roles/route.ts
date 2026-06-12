import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAdmin } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// POST /api/research/roles — create / update / delete an ICP decision-maker role (admin).
const fields = z.object({
  function: z.string().trim().min(1),
  title_keywords: z.string().trim().nullish(),
  seniority_floor: z.string().trim().nullish(),
  priority: z.number().int().optional(),
  active: z.boolean().optional(),
});
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), data: fields }),
  z.object({ action: z.literal("update"), id: z.string().min(1), data: fields }),
  z.object({ action: z.literal("delete"), id: z.string().min(1) }),
]);

export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  const d = parsed.data;
  const admin = createAdminClient();

  if (d.action === "create") {
    const { error } = await admin.from("target_roles").insert(d.data);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (d.action === "update") {
    const { error } = await admin.from("target_roles").update({ ...d.data, updated_at: new Date().toISOString() }).eq("id", d.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    const { error } = await admin.from("target_roles").delete().eq("id", d.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: `target_role.${d.action}`, targetType: "target_role", target: "id" in d ? d.id : undefined });
  return NextResponse.json({ ok: true });
}
