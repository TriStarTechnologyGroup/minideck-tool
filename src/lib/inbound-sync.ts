import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchRfqDeals, fetchFormSubmissions, isHubspotConfigured, type RfqDeal } from "@/lib/hubspot";
import { classifyOrg, classifyByDomain, type OrgCategory } from "@/lib/classify";

type Admin = ReturnType<typeof createAdminClient>;

// HubSpot inbound sources (confirmed against the live portal). The RFQ pipeline IS the gate:
// Pharma & Biotech = industry (prospect-eligible); Academic = academia (reply/quote only).
const PHARMA_PIPELINE = "75e28846-ad0d-4be2-a027-5e1da6590b98";
const ACADEMIC_PIPELINE = "2154953";
const CONTACT_FORM_GUID = "af68dccd-f451-451c-bbdf-9efcd1dce2aa";
const DEFAULT_LOOKBACK_DAYS = 7; // first run only (no rows yet)

export type InboundSyncResult = { rfq: number; forms: number; inserted: number; updated: number; errors: string[] };

const domainOf = (email: string | null | undefined) => (email && email.includes("@") ? email.split("@")[1].toLowerCase() : null);

type Resolved = { classification: OrgCategory; classification_reason: string | null; prospect_eligible: boolean };

/**
 * Classify an org for the academia/industry gate. The HubSpot pipeline is only a weak signal —
 * academic institutions (Duke, Ohio State, NCI…) routinely sit in the Pharma & Biotech pipeline —
 * so we classify by: (1) Academic pipeline → academia (hard); (2) email-domain rule (.edu/.gov,
 * no AI); (3) Claude. prospect_eligible = industry only. Fails safe to 'unknown' (not eligible).
 */
async function resolveClassification(opts: { academicPipeline?: boolean; company?: string | null; domain?: string | null; message?: string | null }): Promise<Resolved> {
  if (opts.academicPipeline) return { classification: "academia", classification_reason: "HubSpot Academic pipeline", prospect_eligible: false };
  const ruled = classifyByDomain(opts.domain);
  if (ruled) return { classification: ruled, classification_reason: `domain rule (${opts.domain})`, prospect_eligible: ruled === "industry" };
  const c = await classifyOrg({ company: opts.company, domain: opts.domain, message: opts.message });
  return { classification: c.category, classification_reason: c.reason, prospect_eligible: c.category === "industry" };
}

/** Upsert one inquiry by (hubspot_object_type, hubspot_object_id). HubSpot-sourced fields refresh
 *  on every sync; reviewer-owned fields (status, classification, company_id) are set on insert
 *  only — never clobbered. `classify` runs only for genuinely new rows (bounds AI cost). */
async function upsertInquiry(admin: Admin, row: Record<string, unknown>, classify: () => Promise<{ classification: OrgCategory; classification_reason: string | null; prospect_eligible: boolean }>, result: InboundSyncResult) {
  const { data: ex } = await admin.from("inbound_inquiries").select("id").eq("hubspot_object_type", row.hubspot_object_type as string).eq("hubspot_object_id", row.hubspot_object_id as string).maybeSingle();
  if (ex?.id) {
    const { error } = await admin.from("inbound_inquiries").update({ ...row, synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", ex.id);
    if (error) result.errors.push(`update ${row.hubspot_object_id}: ${error.message}`); else result.updated++;
  } else {
    const c = await classify();
    const { error } = await admin.from("inbound_inquiries").insert({ ...row, ...c, status: "classified" });
    if (error) result.errors.push(`insert ${row.hubspot_object_id}: ${error.message}`); else result.inserted++;
  }
}

function dealRow(d: RfqDeal, pipeline: "pharma" | "academic") {
  const company = d.contact?.company ?? null;
  const domain = domainOf(d.contact?.email);
  return {
    row: {
      source: "rfq", hubspot_object_type: "deal", hubspot_object_id: d.id, hubspot_contact_id: d.contact?.id ?? null,
      company_name: company, company_domain: domain,
      contact_name: [d.contact?.firstname, d.contact?.lastname].filter(Boolean).join(" ") || null, contact_email: d.contact?.email ?? null,
      subject: d.dealname, message: null, requested_products: d.lineItems, pipeline: d.pipeline, stage: d.dealstage, amount: d.amount, received_at: d.createdate,
    },
    // Academic pipeline is a hard academia signal; Pharma pipeline still needs real classification
    // (academic orgs land there too), so resolve by domain rule → Claude.
    classify: () => resolveClassification({ academicPipeline: pipeline === "academic", company, domain }),
  };
}

/** Pull new/updated RFQ deals (both pipelines) + contact-form submissions from HubSpot since the
 *  last sync, classify, and upsert into inbound_inquiries. Idempotent. */
export async function runInboundSync(admin: Admin): Promise<InboundSyncResult> {
  if (!isHubspotConfigured()) throw new Error("HubSpot not configured");
  const result: InboundSyncResult = { rfq: 0, forms: 0, inserted: 0, updated: 0, errors: [] };

  // Incremental window: newest received_at we already have, else a short lookback on first run.
  const { data: latest } = await admin.from("inbound_inquiries").select("received_at").order("received_at", { ascending: false }).limit(1).maybeSingle();
  const since = latest?.received_at ?? new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 86400_000).toISOString();

  // RFQ deals — both pipelines (pipeline drives the gate).
  for (const [pid, kind] of [[PHARMA_PIPELINE, "pharma"], [ACADEMIC_PIPELINE, "academic"]] as const) {
    try {
      const deals = await fetchRfqDeals(pid, since);
      for (const d of deals) { const { row, classify } = dealRow(d, kind); await upsertInquiry(admin, row, classify, result); result.rfq++; }
    } catch (e) { result.errors.push(`rfq ${kind}: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // Contact-form submissions — classified in-app (not pipeline-bound).
  try {
    const subs = await fetchFormSubmissions(CONTACT_FORM_GUID);
    for (const s of subs) {
      if (!s.submittedAt || s.submittedAt < since) continue;
      const v = s.values;
      const email = v.email ?? null;
      const row = {
        source: "contact_form", hubspot_object_type: "form_submission", hubspot_object_id: `${CONTACT_FORM_GUID}:${s.submittedAt}:${email ?? ""}`, hubspot_contact_id: null,
        company_name: v.company ?? null, company_domain: domainOf(email), contact_name: [v.firstname, v.lastname].filter(Boolean).join(" ") || null, contact_email: email,
        subject: v.how_can_we_help_you_ ?? null, message: v.message ?? null, requested_products: null, pipeline: null, stage: null, amount: null, received_at: s.submittedAt,
      };
      await upsertInquiry(admin, row, () => resolveClassification({ company: v.company, domain: domainOf(email), message: v.message }), result);
      result.forms++;
    }
  } catch (e) { result.errors.push(`forms: ${e instanceof Error ? e.message : String(e)}`); }

  return result;
}
