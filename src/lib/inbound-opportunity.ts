import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestProspecting, assetKey } from "@/lib/prospecting";

type Admin = ReturnType<typeof createAdminClient>;

type CartItem = { sku: string | null; name: string | null; quantity: number | null; price?: number | null };
type DraftInput = {
  source: string;
  company_name?: string | null;
  company_domain?: string | null;
  subject?: string | null;
  message?: string | null;
  amount?: number | null;
  requested_products?: CartItem[] | null;
};

/** Compose a human-readable "raw inquiry" rationale so the opportunity always reflects what came in,
 *  regardless of source (RFQ carts have no message; contact forms have no cart). */
function rawInquirySummary(inq: DraftInput, cart: CartItem[]): string {
  const lines: string[] = [];
  lines.push(inq.source === "rfq" ? "Inbound RFQ (website)" : "Inbound contact-form inquiry");
  if (inq.subject?.trim()) lines.push(`Subject: ${inq.subject.trim()}`);
  if (cart.length) {
    lines.push(`Requested ${cart.length} item${cart.length === 1 ? "" : "s"}:`);
    for (const p of cart) lines.push(`  • ${p.name ?? p.sku}${p.quantity ? ` ×${p.quantity}` : ""}${p.sku ? ` [SKU ${p.sku}]` : ""}`);
  }
  if (inq.amount != null) lines.push(`Deal amount: $${inq.amount.toLocaleString()}`);
  if (inq.message?.trim()) lines.push(`Message: ${inq.message.trim()}`);
  return lines.join("\n");
}

/**
 * Auto-draft the opportunity SHELL for an inbound inquiry (runs on sync). Reuses ingestProspecting so
 * the company dedups and the opportunity upserts by a stable asset_key = inbound-<inquiry id>. Injects
 * the RAW inquiry: the requested cart as matched TMAs + cohorts (anchor), and a composed rationale
 * (subject + cart + amount + message) so the opportunity reflects exactly what was asked — even RFQs,
 * which carry no free-text message. Unscored; the opportunity-finder skill qualifies it later
 * (matchmakes more TMAs/capabilities + score_components).
 *
 * GUARD: never re-ingest an opportunity the skill has already scored — ingestProspecting deletes &
 * replaces score_components/cohorts per opp, so a re-draft would wipe the skill's work. If a scored
 * opp already exists for this inquiry, we only (re)link it. Idempotent. Returns the opportunity id.
 */
export async function draftOpportunityForInquiry(admin: Admin, inquiryId: string, inq: DraftInput): Promise<string | null> {
  // ingestProspecting slugifies asset_key via assetKey() (`:` → `-`), so derive the key through the
  // SAME normalizer for both the write and the read-back — otherwise the post-ingest lookup misses.
  const assetKeyValue = assetKey("", `inbound:${inquiryId}`);

  // If a scored opportunity already exists for this inquiry, leave it untouched (don't clobber the
  // skill's score_components/cohorts) — just make sure the inquiry link is set, then bail.
  const { data: existing } = await admin.from("opportunities").select("id").eq("asset_key", assetKeyValue).limit(1).maybeSingle();
  if (existing?.id) {
    const { count } = await admin.from("opportunity_score_components").select("opportunity_id", { count: "exact", head: true }).eq("opportunity_id", existing.id as string);
    if ((count ?? 0) > 0) {
      await admin.from("inbound_inquiries").update({ opportunity_id: existing.id as string }).eq("id", inquiryId);
      return existing.id as string;
    }
  }

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
      rationale: rawInquirySummary(inq, cart),
      run_label: "Inbound",
      // The requested cart is the anchor — flag it "Requested" so the skill can keep it and add matches.
      cohorts: cart.length ? cart.map((p) => ({ ta_number: skuToTa.get(p.sku as string) ?? undefined, cohort: p.name ?? undefined, donors: p.quantity ?? null, category: "Requested" })) : undefined,
    }],
  });

  const { data: opp } = await admin.from("opportunities").select("id").eq("asset_key", assetKeyValue).limit(1).maybeSingle();
  if (opp?.id) { await admin.from("inbound_inquiries").update({ opportunity_id: opp.id as string }).eq("id", inquiryId); return opp.id as string; }
  return null;
}
