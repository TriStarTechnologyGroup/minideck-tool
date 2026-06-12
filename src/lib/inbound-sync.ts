import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchRfqDeals, fetchFormSubmissions, fetchDealLineItems, isHubspotConfigured, type RfqDeal } from "@/lib/hubspot";
import { classifyOrg, classifyByDomain, type OrgCategory } from "@/lib/classify";
import { draftOpportunityForInquiry } from "@/lib/inbound-opportunity";

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
async function upsertInquiry(admin: Admin, row: Record<string, unknown>, classify: () => Promise<{ classification: OrgCategory; classification_reason: string | null; prospect_eligible: boolean }>, result: InboundSyncResult): Promise<string | null> {
  const { data: ex } = await admin.from("inbound_inquiries").select("id, opportunity_id").eq("hubspot_object_type", row.hubspot_object_type as string).eq("hubspot_object_id", row.hubspot_object_id as string).maybeSingle();
  if (ex?.id) {
    const { error } = await admin.from("inbound_inquiries").update({ ...row, synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", ex.id);
    if (error) result.errors.push(`update ${row.hubspot_object_id}: ${error.message}`); else result.updated++;
    return ex.opportunity_id ? null : (ex.id as string); // draft if it doesn't have one yet (backfill)
  }
  const c = await classify();
  const { data: ins, error } = await admin.from("inbound_inquiries").insert({ ...row, ...c, status: "classified" }).select("id").single();
  if (error) { result.errors.push(`insert ${row.hubspot_object_id}: ${error.message}`); return null; }
  result.inserted++;
  return ins.id as string; // newly inserted → draft an opportunity shell
}

// Draft the opportunity for a newly-inserted inquiry; best-effort (don't fail the whole sync).
async function draft(admin: Admin, id: string | null, row: Record<string, unknown>, result: InboundSyncResult) {
  if (!id) return;
  try { await draftOpportunityForInquiry(admin, id, row as Parameters<typeof draftOpportunityForInquiry>[2]); }
  catch (e) { result.errors.push(`draft opp ${id}: ${e instanceof Error ? e.message : String(e)}`); }
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

  // PER-SOURCE incremental window — forms must not be gated behind the newest *deal's* time
  // (deals are frequent, forms rare). Default to a short lookback on first run.
  const fallback = new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 86400_000).toISOString();
  const sinceFor = async (source: string) => {
    const { data } = await admin.from("inbound_inquiries").select("received_at").eq("source", source).order("received_at", { ascending: false }).limit(1).maybeSingle();
    return data?.received_at ?? fallback;
  };
  const rfqSince = await sinceFor("rfq");
  const formSince = await sinceFor("contact_form");

  // Contact-form submissions FIRST — few + high-value, so they always sync even if the deal
  // loop is heavy. Classified in-app (not pipeline-bound).
  try {
    const subs = await fetchFormSubmissions(CONTACT_FORM_GUID);
    for (const s of subs) {
      if (!s.submittedAt || s.submittedAt < formSince) continue;
      const v = s.values;
      const email = v.email ?? null;
      const row = {
        source: "contact_form", hubspot_object_type: "form_submission", hubspot_object_id: `${CONTACT_FORM_GUID}:${s.submittedAt}:${email ?? ""}`, hubspot_contact_id: null,
        company_name: v.company ?? null, company_domain: domainOf(email), contact_name: [v.firstname, v.lastname].filter(Boolean).join(" ") || null, contact_email: email,
        subject: v.how_can_we_help_you_ ?? null, message: v.message ?? null, requested_products: null, pipeline: null, stage: null, amount: null, received_at: s.submittedAt,
      };
      const newId = await upsertInquiry(admin, row, () => resolveClassification({ company: v.company, domain: domainOf(email), message: v.message }), result);
      await draft(admin, newId, row, result);
      result.forms++;
    }
  } catch (e) { result.errors.push(`forms: ${e instanceof Error ? e.message : String(e)}`); }

  // RFQ deals — both pipelines. Academic pipeline → academia; Pharma needs real classification.
  for (const [pid, kind] of [[PHARMA_PIPELINE, "pharma"], [ACADEMIC_PIPELINE, "academic"]] as const) {
    try {
      const deals = await fetchRfqDeals(pid, rfqSince);
      for (const d of deals) { const { row, classify } = dealRow(d, kind); const newId = await upsertInquiry(admin, row, classify, result); await draft(admin, newId, row, result); result.rfq++; }
    } catch (e) { result.errors.push(`rfq ${kind}: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // Reconcile inbound shells with their inquiry — ONE pass that converges the whole inbox. Earlier
  // syncs left shells out of sync three ways: (a) no opportunity yet (HubSpot only re-fetches
  // recently-modified objects, so old inquiries never got drafted), (b) RFQ cart dropped by the
  // `line_items` vs `"line items"` association-key bug, (c) shell drafted before the rich-rationale
  // change, or its cart arrived via the refresh path (which doesn't re-draft). For every inquiry:
  // fill an empty RFQ cart from HubSpot, then re-draft when the linked shell is missing/stale
  // (unlinked, no rationale, or has a cart but no cohorts). draft() preserves skill-scored opps.
  try {
    const { data: rows } = await admin.from("inbound_inquiries")
      .select("id, opportunity_id, hubspot_object_id, source, company_name, company_domain, subject, message, amount, requested_products");
    const oppIds = (rows ?? []).map((r) => r.opportunity_id as string).filter(Boolean);
    const [{ data: opps }, { data: cohorts }] = await Promise.all([
      oppIds.length ? admin.from("opportunities").select("id, rationale").in("id", oppIds) : Promise.resolve({ data: [] as { id: string; rationale: string | null }[] }),
      oppIds.length ? admin.from("opportunity_cohorts").select("opportunity_id").in("opportunity_id", oppIds) : Promise.resolve({ data: [] as { opportunity_id: string }[] }),
    ]);
    const hasRationale = new Set((opps ?? []).filter((o) => (o.rationale ?? "").trim()).map((o) => o.id as string));
    const hasCohorts = new Set((cohorts ?? []).map((c) => c.opportunity_id as string));
    for (const inq of rows ?? []) {
      let cart = (Array.isArray(inq.requested_products) ? inq.requested_products : []) as unknown[];
      if (inq.source === "rfq" && cart.length === 0) {
        const items = await fetchDealLineItems(inq.hubspot_object_id as string);
        if (items.length) {
          const { error } = await admin.from("inbound_inquiries").update({ requested_products: items, updated_at: new Date().toISOString() }).eq("id", inq.id);
          if (error) result.errors.push(`cart backfill ${inq.hubspot_object_id}: ${error.message}`); else cart = items;
        }
      }
      const oppId = inq.opportunity_id as string | null;
      const stale = !oppId || !hasRationale.has(oppId) || (cart.length > 0 && !hasCohorts.has(oppId));
      if (stale) await draft(admin, inq.id as string, { ...inq, requested_products: cart } as Record<string, unknown>, result);
    }
  } catch (e) { result.errors.push(`shell reconcile: ${e instanceof Error ? e.message : String(e)}`); }

  return result;
}
