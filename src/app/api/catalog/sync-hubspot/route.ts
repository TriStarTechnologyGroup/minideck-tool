import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAdmin } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { syncAllCatalog } from "@/lib/hubspot-catalog-sync";

// POST /api/catalog/sync-hubspot — mirror the entire catalog (TMAs + capabilities) into the
// HubSpot product library. Idempotent; adopts existing products by app_catalog_id / SKU.
export async function POST() {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;
  try {
    const result = await syncAllCatalog(createAdminClient());
    await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: "catalog.sync_hubspot", targetType: "catalog", detail: { synced: result.synced, errors: result.errors.length } });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sync failed" }, { status: 500 });
  }
}
