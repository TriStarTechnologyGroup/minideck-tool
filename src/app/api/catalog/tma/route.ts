import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAdmin } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// POST /api/catalog/tma — create / update / delete a TMA catalog SKU (admin only).
const num = z.number().int().nullish();
const fields = z.object({
  sku: z.string().trim().nullish(),
  ta_number: z.string().trim().nullish(),
  name: z.string().trim().min(1),
  short_description: z.string().trim().nullish(),
  description: z.string().nullish(),
  categories: z.string().trim().nullish(),
  primary_categories: z.string().trim().nullish(),
  donor_samples_each: num,
  approx_cores: num,
  approx_donors: num,
  core_size: z.string().trim().nullish(),
  markers: z.string().trim().nullish(),
  suitable_for: z.string().trim().nullish(),
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
    const { error } = await admin.from("tma_catalog").insert(d.data);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (d.action === "update") {
    const { error } = await admin.from("tma_catalog").update(d.data).eq("id", d.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    const { error } = await admin.from("tma_catalog").delete().eq("id", d.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: `tma.${d.action}`, targetType: "tma_catalog", target: "id" in d ? d.id : undefined });
  return NextResponse.json({ ok: true });
}
