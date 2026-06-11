import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertProduct, archiveProduct, isHubspotConfigured } from "@/lib/hubspot";

type Admin = ReturnType<typeof createAdminClient>;

// Mirror the app catalog (tma_catalog + capabilities) into the HubSpot product library so
// RFQ deal/quote line items, the quote demand index, and opportunity matched-TMAs all share
// one product identity. App is the source of truth; reconcile key = app_catalog_id (uuid).

type TmaRow = { id: string; sku: string | null; name: string | null; short_description: string | null; hubspot_product_id: string | null };
type CapRow = { id: string; capability_id: string | null; name: string | null; description: string | null; hubspot_product_id: string | null };

/** Upsert one TMA's HubSpot product and store the back-link. Returns the product id. */
export async function syncTmaProduct(admin: Admin, row: TmaRow): Promise<string> {
  const productId = await upsertProduct({
    appCatalogId: `tma:${row.id}`,
    name: row.name || row.sku || `TMA ${row.id.slice(0, 8)}`,
    description: row.short_description,
    sku: row.sku,
    hubspotProductId: row.hubspot_product_id,
  });
  if (productId !== row.hubspot_product_id) await admin.from("tma_catalog").update({ hubspot_product_id: productId }).eq("id", row.id);
  return productId;
}

/** Upsert one capability's HubSpot product and store the back-link. */
export async function syncCapabilityProduct(admin: Admin, row: CapRow): Promise<string> {
  const productId = await upsertProduct({
    appCatalogId: `cap:${row.id}`,
    name: row.name || row.capability_id || `Capability ${row.id.slice(0, 8)}`,
    description: row.description,
    sku: row.capability_id,
    hubspotProductId: row.hubspot_product_id,
  });
  if (productId !== row.hubspot_product_id) await admin.from("capabilities").update({ hubspot_product_id: productId }).eq("id", row.id);
  return productId;
}

export type CatalogSyncResult = { tmas: number; capabilities: number; synced: number; errors: { type: string; id: string; label: string; error: string }[] };

/** Full reconcile: mirror every catalog item to HubSpot (idempotent; adopts existing products). */
export async function syncAllCatalog(admin: Admin): Promise<CatalogSyncResult> {
  if (!isHubspotConfigured()) throw new Error("HubSpot not configured");
  const [{ data: tmas }, { data: caps }] = await Promise.all([
    admin.from("tma_catalog").select("id, sku, name, short_description, hubspot_product_id"),
    admin.from("capabilities").select("id, capability_id, name, description, hubspot_product_id"),
  ]);
  const result: CatalogSyncResult = { tmas: (tmas ?? []).length, capabilities: (caps ?? []).length, synced: 0, errors: [] };
  for (const t of (tmas ?? []) as TmaRow[]) {
    try { await syncTmaProduct(admin, t); result.synced++; }
    catch (e) { result.errors.push({ type: "tma", id: t.id, label: t.sku ?? t.name ?? t.id, error: e instanceof Error ? e.message : String(e) }); }
  }
  for (const c of (caps ?? []) as CapRow[]) {
    try { await syncCapabilityProduct(admin, c); result.synced++; }
    catch (e) { result.errors.push({ type: "capability", id: c.id, label: c.capability_id ?? c.name ?? c.id, error: e instanceof Error ? e.message : String(e) }); }
  }
  return result;
}

/** Best-effort archive of a catalog item's HubSpot product on delete (never throws to the caller). */
export async function archiveCatalogProduct(hubspotProductId: string | null | undefined): Promise<void> {
  if (!hubspotProductId) return;
  try { await archiveProduct(hubspotProductId); } catch { /* leave it; reconcile or manual cleanup */ }
}
