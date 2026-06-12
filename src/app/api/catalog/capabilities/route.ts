import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAdmin } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { syncCapabilityProduct, archiveCatalogProduct } from "@/lib/hubspot-catalog-sync";

const CAP_SELECT = "id, capability_id, name, category, description, specs, matching_signal, solid_liquid, data_sheet, active, position, hubspot_product_id";

// POST /api/catalog/capabilities — create / update / delete a capability (admin only).
// Mirrors to a HubSpot product on create/update (best-effort); archives it on delete.
const fields = z.object({
  capability_id: z.string().trim().nullish(),
  name: z.string().trim().min(1),
  category: z.string().trim().nullish(),
  description: z.string().trim().nullish(),
  specs: z.string().trim().nullish(),
  matching_signal: z.string().trim().nullish(),
  solid_liquid: z.string().trim().nullish(),
  data_sheet: z.string().trim().nullish(),
  active: z.boolean().optional(),
  position: z.number().int().optional(),
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

  let hubspotWarning: string | undefined;
  const syncProduct = async (id: string) => {
    const { data: row } = await admin.from("capabilities").select(CAP_SELECT).eq("id", id).single();
    if (row) try { await syncCapabilityProduct(admin, row); } catch (e) { hubspotWarning = `HubSpot product sync failed: ${e instanceof Error ? e.message : String(e)}`; }
  };

  if (d.action === "create") {
    const { data: row, error } = await admin.from("capabilities").insert(d.data).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await syncProduct(row.id);
  } else if (d.action === "update") {
    const { error } = await admin.from("capabilities").update(d.data).eq("id", d.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await syncProduct(d.id);
  } else {
    const { data: row } = await admin.from("capabilities").select("hubspot_product_id").eq("id", d.id).single();
    const { error } = await admin.from("capabilities").delete().eq("id", d.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await archiveCatalogProduct(row?.hubspot_product_id);
  }
  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: `capability.${d.action}`, targetType: "capability", target: "id" in d ? d.id : undefined });
  return NextResponse.json({ ok: true, ...(hubspotWarning ? { hubspotWarning } : {}) });
}
