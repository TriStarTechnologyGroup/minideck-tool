import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { isHubspotConfigured, fetchDealLineItems } from "@/lib/hubspot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const lineItem = z.object({ sku: z.string().nullable().optional(), name: z.string().nullable().optional(), ta_number: z.string().nullable().optional(), quantity: z.number().nullable().optional(), unit_price: z.number().nullable().optional(), note: z.string().nullable().optional() });
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate") }),
  z.object({ action: z.literal("save"), line_items: z.array(lineItem), notes: z.string().nullish(), currency: z.string().optional() }),
]);

// GET /api/inbound/[id]/quote — the saved quote for an inquiry (or null).
export async function GET(_req: NextRequest, { params }: Ctx) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  const { id } = await params;
  const { data } = await createAdminClient().from("inbound_quotes").select("id, currency, line_items, notes, status, updated_at").eq("inquiry_id", id).maybeSingle();
  return NextResponse.json({ quote: data ?? null });
}

// POST /api/inbound/[id]/quote — generate line items from the inquiry's cart (prices pre-filled from
// the HubSpot deal when available), or save reviewer-edited line items. One quote per inquiry.
export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  const { id } = await params;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  const admin = createAdminClient();

  let line_items: z.infer<typeof lineItem>[];
  let notes: string | null | undefined;
  let currency = "USD";

  if (parsed.data.action === "save") {
    line_items = parsed.data.line_items;
    notes = parsed.data.notes ?? null;
    currency = parsed.data.currency || "USD";
  } else {
    const { data: inq } = await admin.from("inbound_inquiries").select("source, hubspot_object_id, requested_products").eq("id", id).maybeSingle();
    if (!inq) return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
    const products = ((inq.requested_products as { sku?: string | null; name?: string | null; quantity?: number | null }[] | null) ?? []);

    // Prices from the HubSpot deal line items (RFQ only); there's no standing price list in-app.
    const priceBySku = new Map<string, number>();
    if (inq.source === "rfq" && inq.hubspot_object_id && isHubspotConfigured()) {
      try {
        for (const li of await fetchDealLineItems(inq.hubspot_object_id as string)) if (li.sku && li.price != null) priceBySku.set(li.sku, li.price);
      } catch { /* prices stay blank for manual entry */ }
    }
    const skus = products.map((p) => p.sku).filter(Boolean) as string[];
    const taBySku = new Map<string, { ta: string | null; name: string | null }>();
    if (skus.length) {
      const { data: cat } = await admin.from("tma_catalog").select("sku, ta_number, name").in("sku", skus);
      for (const c of cat ?? []) if (c.sku) taBySku.set(c.sku as string, { ta: (c.ta_number as string) ?? null, name: (c.name as string) ?? null });
    }
    line_items = products.map((p) => ({ sku: p.sku ?? null, name: (p.sku ? taBySku.get(p.sku)?.name : null) ?? p.name ?? null, ta_number: p.sku ? taBySku.get(p.sku)?.ta ?? null : null, quantity: p.quantity ?? 1, unit_price: p.sku ? priceBySku.get(p.sku) ?? null : null, note: null }));
    // Preserve any existing notes/currency on regenerate.
    const { data: existing } = await admin.from("inbound_quotes").select("notes, currency").eq("inquiry_id", id).maybeSingle();
    notes = (existing?.notes as string) ?? null;
    currency = (existing?.currency as string) || "USD";
  }

  const { data, error } = await admin.from("inbound_quotes")
    .upsert({ inquiry_id: id, line_items, notes: notes ?? null, currency, created_by: guard.profile.id, updated_at: new Date().toISOString() }, { onConflict: "inquiry_id" })
    .select("id, currency, line_items, notes, status, updated_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: `inquiry.quote_${parsed.data.action}`, targetType: "inquiry", target: id, detail: { items: line_items.length } });
  return NextResponse.json({ quote: data });
}
