import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAdmin } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { syncTmaProduct, archiveCatalogProduct } from "@/lib/hubspot-catalog-sync";

const TMA_SELECT = "id, sku, name, short_description, hubspot_product_id";

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
  suitable_for_codex: z.string().trim().nullish(),
  cancer: z.string().trim().nullish(),
  product_cat: z.string().trim().nullish(),
  follow_up_data: z.string().trim().nullish(),
  molecular_data: z.string().trim().nullish(),
  number_of_cores: z.string().trim().nullish(),
  number_of_donors: z.string().trim().nullish(),
  images: z.string().trim().nullish(),
  data_sheet: z.string().trim().nullish(),
  gcp_dzi_file: z.string().trim().nullish(),
  position: num,
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
    const { data: row } = await admin.from("tma_catalog").select(TMA_SELECT).eq("id", id).single();
    if (row) try { await syncTmaProduct(admin, row); } catch (e) { hubspotWarning = `HubSpot product sync failed: ${e instanceof Error ? e.message : String(e)}`; }
  };

  if (d.action === "create") {
    const { data: row, error } = await admin.from("tma_catalog").insert(d.data).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await syncProduct(row.id);
  } else if (d.action === "update") {
    const { error } = await admin.from("tma_catalog").update(d.data).eq("id", d.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await syncProduct(d.id);
  } else {
    const { data: row } = await admin.from("tma_catalog").select("hubspot_product_id").eq("id", d.id).single();
    const { error } = await admin.from("tma_catalog").delete().eq("id", d.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await archiveCatalogProduct(row?.hubspot_product_id);
  }
  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: `tma.${d.action}`, targetType: "tma_catalog", target: "id" in d ? d.id : undefined });
  return NextResponse.json({ ok: true, ...(hubspotWarning ? { hubspotWarning } : {}) });
}
