import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestProspecting, assetKey } from "@/lib/prospecting";

type Admin = ReturnType<typeof createAdminClient>;

type DraftInput = {
  source: string;
  company_name?: string | null;
  company_domain?: string | null;
  subject?: string | null;
  message?: string | null;
  requested_products?: { sku: string | null; name: string | null; quantity: number | null }[] | null;
};

/**
 * Auto-draft the opportunity SHELL for an inbound inquiry (runs on sync). Reuses
 * ingestProspecting so the company dedups and the opportunity upserts by a stable
 * asset_key = inbound:<inquiry id>; attaches the RFQ cart as matched TMAs + cohorts.
 * Unscored — the opportunity-finder skill qualifies it later (fit tier, score_components).
 * Idempotent; links inbound_inquiries.opportunity_id. Returns the opportunity id.
 */
export async function draftOpportunityForInquiry(admin: Admin, inquiryId: string, inq: DraftInput): Promise<string | null> {
  // ingestProspecting slugifies asset_key via assetKey() (`:` → `-`), so derive the key through the
  // SAME normalizer for both the write and the read-back — otherwise the post-ingest lookup misses.
  const assetKeyValue = assetKey("", `inbound:${inquiryId}`);
  const company = inq.company_name?.trim() || "Unknown (inbound)";
  const cart = (inq.requested_products ?? []).filter((p) => p.sku);
  const skus = cart.map((p) => p.sku as string);

  // Resolve cart SKUs → TA#s so the requested products show as matched cohorts.
  const skuToTa = new Map<string, string>();
  if (skus.length) {
    const { data } = await admin.from("tma_catalog").select("sku, ta_number").in("sku", skus);
    for (const r of data ?? []) if (r.sku && r.ta_number) skuToTa.set(r.sku as string, r.ta_number as string);
  }

  await ingestProspecting(admin, {
    mode: "refresh",
    companies: [{ name: company, ...(inq.company_domain ? { domain: inq.company_domain } : {}) }],
    opportunities: [{
      company_name: company,
      asset_name: inq.subject?.trim() || (inq.source === "rfq" ? "Inbound RFQ" : "Inbound inquiry"),
      asset_key: assetKeyValue,
      matched_tma_skus: skus.length ? skus.join(" | ") : undefined,
      rationale: inq.message?.trim() || undefined,
      run_label: "Inbound",
      cohorts: cart.length ? cart.map((p) => ({ ta_number: skuToTa.get(p.sku as string) ?? undefined, cohort: p.name ?? undefined, donors: p.quantity ?? null })) : undefined,
    }],
  });

  const { data: opp } = await admin.from("opportunities").select("id").eq("asset_key", assetKeyValue).limit(1).maybeSingle();
  if (opp?.id) { await admin.from("inbound_inquiries").update({ opportunity_id: opp.id as string }).eq("id", inquiryId); return opp.id as string; }
  return null;
}
