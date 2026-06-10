import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAdmin } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// POST /api/catalog/capabilities — create / update / delete a capability (admin only).
const fields = z.object({
  capability_id: z.string().trim().nullish(),
  name: z.string().trim().min(1),
  category: z.string().trim().nullish(),
  description: z.string().trim().nullish(),
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
    const { error } = await admin.from("capabilities").insert(d.data);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (d.action === "update") {
    const { error } = await admin.from("capabilities").update(d.data).eq("id", d.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    const { error } = await admin.from("capabilities").delete().eq("id", d.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: `capability.${d.action}`, targetType: "capability", target: "id" in d ? d.id : undefined });
  return NextResponse.json({ ok: true });
}
