import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import { requireApiUser } from "@/lib/api";

// GET /api/prospecting/catalog — the TMA catalog + capabilities the prospecting skill
// scores against, so it no longer needs the catalog merged into a workbook tab.
// Auth: bearer PROSPECTING_INGEST_SECRET (headless skill) or any signed-in user.
export async function GET(req: NextRequest) {
  const secret = serverEnv.PROSPECTING_INGEST_SECRET;
  const authed = Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!authed) {
    const guard = await requireApiUser();
    if (guard.error) return guard.error;
  }

  const admin = createAdminClient();
  const [{ data: tma }, { data: capabilities }] = await Promise.all([
    admin.from("tma_catalog").select("sku, ta_number, name, short_description, categories, primary_categories, product_cat, cancer, donor_samples_each, approx_cores, approx_donors, number_of_cores, number_of_donors, core_size, markers, suitable_for, suitable_for_codex, follow_up_data, molecular_data").order("sku"),
    admin.from("capabilities").select("capability_id, name, category, description").order("capability_id"),
  ]);

  return NextResponse.json({ tma_catalog: tma ?? [], capabilities: capabilities ?? [] });
}
