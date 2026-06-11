import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Canonical key for matching/deduping an opportunity within a company. Lowercase the
 * name, strip parenthetical code/brand suffixes and dose, then slugify — so
 * `Budigalimab (ABBV-181)`, `Budigalimab`, and `Niraparib 200 mg` collapse to a stable
 * key. An explicit key (skill-supplied `asset_key`/`external_id`) always wins.
 *
 * NOTE: cross-form drift — INN-only (`Pasritamig`) vs code-only (`JNJ-78278343`) — does
 * NOT collapse here (no name overlap). The skill must emit a stable explicit key for
 * those; the server normalizer only catches the parenthetical/dose/spacing class.
 * Keep this in sync with scripts/backfill-asset-keys.mjs.
 */
export function assetKey(name: string, explicit?: string | null): string {
  const base = (explicit && explicit.trim()) || name || "";
  let s = base.toLowerCase();
  s = s.replace(/\([^)]*\)/g, " "); // parenthetical code/brand suffixes
  s = s.replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|%)\b/g, " "); // dose
  s = s.replace(/[®™]/g, " ");
  s = s.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, "-");
  return s;
}

// Ingestion contract for the Claude prospecting skill: it POSTs a run's output here
// (companies + drug programs + scored opportunities, optionally TMA/capability reference)
// and the app upserts it into the qualification tables. Companies are matched by
// hubspot_id when given, else by name; programs/opportunities link to the resolved id.

const company = z.object({
  hubspot_id: z.string().optional(),
  name: z.string().min(1),
  domain: z.string().optional(),
  website: z.string().optional(),
  industry: z.string().optional(),
  type: z.string().optional(),
  lifecycle_stage: z.string().optional(),
  owner: z.string().optional(),
  employees: z.number().int().optional(),
  annual_revenue: z.number().int().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  year_founded: z.number().int().optional(),
  relevant: z.boolean().optional(),
  pipeline_program_count: z.number().int().optional(),
  notes: z.string().optional(),
});

const drugProgram = z.object({
  program_ref: z.string().optional(),
  company_hubspot_id: z.string().optional(), // resolution hint; stripped before insert
  company_name: z.string().min(1),
  asset_name: z.string().min(1),
  modality: z.string().optional(),
  target: z.string().optional(),
  mechanism_of_action: z.string().optional(),
  highest_phase: z.string().optional(),
  indications: z.string().optional(),
  combination_partners: z.string().optional(),
  nct_ids: z.string().optional(),
  trial_count: z.number().int().optional(),
  status_summary: z.string().optional(),
  tumor_types: z.string().optional(),
  solid_tumor: z.boolean().optional(),
  liquid_tumor: z.boolean().optional(),
  in_window: z.boolean().optional(),
  proprietary: z.string().optional(),
  data_source: z.string().optional(),
  notes: z.string().optional(),
});

const cohort = z.object({
  ta_number: z.string().optional(),
  cohort: z.string().optional(),
  markers: z.string().optional(),
  donors: z.number().int().nullable().optional(), // unknown donor counts are legitimate → null, not 0
  category: z.string().optional(),
  custom_stain: z.boolean().optional(),
});

const trial = z.object({
  nct_id: z.string().optional(),
  title: z.string().optional(),
  status: z.string().optional(),
  phase: z.string().optional(),
  enrollment: z.number().int().nullable().optional(), // some trials have no posted enrollment → null
  start_date: z.string().optional(),
  primary_completion_date: z.string().optional(),
  conditions: z.string().optional(),
  interventions: z.string().optional(),
  primary_endpoints: z.string().optional(),
  tissue_requirements: z.string().optional(),
  selection_biomarkers: z.string().optional(),
  relevance_flags: z.string().optional(),
  has_results: z.boolean().optional(),
  url: z.string().optional(),
});

const scoreComponent = z.object({
  component: z.string(),
  weight_max: z.number().int(),
  points: z.number().int(),
  note: z.string().optional(),
});

const oppCapability = z.object({
  capability_id: z.string().optional(),
  label: z.string(),
});

const opportunity = z.object({
  run_label: z.string().optional(),
  company_hubspot_id: z.string().optional(),
  company_name: z.string().min(1),
  asset_name: z.string().min(1),
  // Optional stable identity override; when given, the server matches on this instead of
  // normalizing asset_name (use for cross-form drift like INN vs code-name).
  asset_key: z.string().optional(),
  external_id: z.string().optional(),
  modality: z.string().optional(),
  target: z.string().optional(),
  phase: z.string().optional(),
  tumor_types: z.string().optional(),
  fit_score: z.number().int().optional(),
  fit_tier: z.string().optional(),
  proprietary: z.string().optional(),
  matched_tma_skus: z.string().optional(),
  suggested_capabilities: z.string().optional(),
  rationale: z.string().optional(),
  notes: z.string().optional(),
  cohorts: z.array(cohort).optional(), // the §5 cohort table for this opportunity
  trials: z.array(trial).optional(), // ClinicalTrials.gov evidence for this opportunity
  score_components: z.array(scoreComponent).optional(), // per-parameter scoring breakdown
  capabilities: z.array(oppCapability).optional(), // structured suggested capabilities
});

const tma = z.object({
  sku: z.string().optional(),
  ta_number: z.string().optional(),
  name: z.string().optional(),
  short_description: z.string().optional(),
  description: z.string().optional(),
  categories: z.string().optional(),
  donor_samples_each: z.number().int().optional(),
  approx_cores: z.number().int().optional(),
  approx_donors: z.number().int().optional(),
  core_size: z.string().optional(),
  markers: z.string().optional(),
  primary_categories: z.string().optional(),
  suitable_for: z.string().optional(),
});

const capability = z.object({
  capability_id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional(),
});

export const prospectingPayload = z.object({
  run_label: z.string().optional(),
  // All modes upsert opportunities by (company, asset_key) and replace that opportunity's
  // skill-owned children, preserving reviewer feedback + reviewer-added capabilities.
  //   append/refresh — non-destructive to other assets (synonyms; both idempotent on key).
  //   replace        — additionally PRUNES opportunities absent from the payload for each
  //                    company in it (skill-owned), so a re-run becomes authoritative.
  //                    Opportunities carrying reviewer feedback are never pruned.
  // drug_programs are skill-owned and wholesale-replaced per company in every mode (fixes the
  // old append-accumulation bug).
  mode: z.enum(["append", "refresh", "replace"]).optional(),
  companies: z.array(company).optional(),
  drug_programs: z.array(drugProgram).optional(),
  opportunities: z.array(opportunity).optional(),
  tma_catalog: z.array(tma).optional(),
  capabilities: z.array(capability).optional(),
});

export type ProspectingPayload = z.infer<typeof prospectingPayload>;
export type IngestCounts = { companies: number; drug_programs: number; opportunities: number; pruned_opportunities: number; opportunity_cohorts: number; opportunity_trials: number; opportunity_score_components: number; opportunity_capabilities: number; tma_catalog: number; capabilities: number };

/** Upsert a prospecting run's output. Companies dedupe on hubspot_id/name; opportunities
 *  upsert on (company_id, asset_key); drug_programs are replaced per company; `replace`
 *  mode prunes opportunities absent from the payload (preserving reviewer feedback). */
export async function ingestProspecting(admin: Admin, payload: ProspectingPayload): Promise<IngestCounts> {
  const counts: IngestCounts = { companies: 0, drug_programs: 0, opportunities: 0, pruned_opportunities: 0, opportunity_cohorts: 0, opportunity_trials: 0, opportunity_score_components: 0, opportunity_capabilities: 0, tma_catalog: 0, capabilities: 0 };

  if (payload.companies?.length) {
    const withHs = payload.companies.filter((c) => c.hubspot_id);
    const without = payload.companies.filter((c) => !c.hubspot_id);
    if (withHs.length) {
      const { error } = await admin.from("companies").upsert(withHs, { onConflict: "hubspot_id" });
      if (error) throw new Error(`companies upsert: ${error.message}`);
    }
    // Without a hubspot_id, dedupe by name: update an existing same-named company rather than
    // inserting a duplicate (this is what created dup company rows on rescore).
    for (const c of without) {
      const { data: ex } = await admin.from("companies").select("id").eq("name", c.name).limit(1);
      if (ex && ex.length) {
        const { error } = await admin.from("companies").update(c).eq("id", ex[0].id);
        if (error) throw new Error(`companies update: ${error.message}`);
      } else {
        const { error } = await admin.from("companies").insert(c);
        if (error) throw new Error(`companies insert: ${error.message}`);
      }
    }
    counts.companies = payload.companies.length;
  }

  // Resolve company ids for the referenced programs/opportunities.
  const refs = [...(payload.drug_programs ?? []), ...(payload.opportunities ?? [])];
  const hsIds = [...new Set(refs.map((r) => r.company_hubspot_id).filter(Boolean) as string[])];
  const names = [...new Set(refs.map((r) => r.company_name).filter(Boolean) as string[])];
  const byHs = new Map<string, string>();
  const byName = new Map<string, string>();
  if (hsIds.length) {
    const { data } = await admin.from("companies").select("id, hubspot_id").in("hubspot_id", hsIds);
    for (const c of data ?? []) if (c.hubspot_id) byHs.set(c.hubspot_id as string, c.id as string);
  }
  if (names.length) {
    const { data } = await admin.from("companies").select("id, name, hubspot_id").in("name", names);
    // If a name has duplicate rows, prefer the one with a hubspot_id (the canonical record).
    for (const c of data ?? []) {
      const existing = byName.get(c.name as string);
      if (!existing || c.hubspot_id) byName.set(c.name as string, c.id as string);
    }
  }
  const resolve = (r: { company_hubspot_id?: string; company_name?: string }) =>
    (r.company_hubspot_id && byHs.get(r.company_hubspot_id)) || (r.company_name && byName.get(r.company_name)) || null;

  if (payload.drug_programs?.length) {
    const rows = payload.drug_programs.map(({ company_hubspot_id, ...p }) => ({ ...p, company_id: resolve({ company_hubspot_id, company_name: p.company_name }) }));
    // drug_programs are skill-owned: replace this run's companies' programs wholesale so
    // reruns don't accumulate (previously every refresh appended, ballooning the table).
    const companyIds = [...new Set(rows.map((r) => r.company_id).filter(Boolean) as string[])];
    if (companyIds.length) {
      const { error: de } = await admin.from("drug_programs").delete().in("company_id", companyIds);
      if (de) throw new Error(`drug_programs replace: ${de.message}`);
    }
    const { error } = await admin.from("drug_programs").insert(rows);
    if (error) throw new Error(`drug_programs insert: ${error.message}`);
    counts.drug_programs = rows.length;
  }

  if (payload.opportunities?.length) {
    const mode = payload.mode ?? "append";
    const cohortRows: Record<string, unknown>[] = [];
    const trialRows: Record<string, unknown>[] = [];
    const componentRows: Record<string, unknown>[] = [];
    const capabilityRows: Record<string, unknown>[] = [];
    // Track which keys arrived per company, so `replace` can prune the rest.
    const incomingByCompany = new Map<string, Set<string>>();

    for (const { company_hubspot_id, asset_key: explicitKey, external_id, cohorts, trials, score_components, capabilities, ...o } of payload.opportunities) {
      const company_id = resolve({ company_hubspot_id, company_name: o.company_name });
      const key = assetKey(o.asset_name, explicitKey ?? external_id);
      const row = { ...o, asset_key: key, run_label: o.run_label ?? payload.run_label ?? null, company_id };
      if (company_id) {
        const set = incomingByCompany.get(company_id) ?? new Set<string>();
        set.add(key);
        incomingByCompany.set(company_id, set);
      }

      // Upsert on (company_id, asset_key) — idempotent across reruns and naming drift. Rows
      // without a resolved company can't dedupe, so they're inserted as-is.
      let oppId: string | undefined;
      if (company_id) {
        const { data: up, error: ue } = await admin.from("opportunities").upsert([row], { onConflict: "company_id,asset_key" }).select("id");
        if (ue) throw new Error(`opportunities upsert: ${ue.message}`);
        oppId = (up ?? [])[0]?.id as string | undefined;
      } else {
        const { data: ins, error: ie } = await admin.from("opportunities").insert([row]).select("id");
        if (ie) throw new Error(`opportunities insert: ${ie.message}`);
        oppId = (ins ?? [])[0]?.id as string | undefined;
      }
      counts.opportunities++;
      if (!oppId) continue;
      // Replace skill-owned children every run; preserve reviewer feedback + reviewer-added caps.
      await admin.from("opportunity_score_components").delete().eq("opportunity_id", oppId);
      await admin.from("opportunity_cohorts").delete().eq("opportunity_id", oppId);
      await admin.from("opportunity_trials").delete().eq("opportunity_id", oppId);
      await admin.from("opportunity_capabilities").delete().eq("opportunity_id", oppId).eq("source", "suggested");
      (cohorts ?? []).forEach((c, j) => cohortRows.push({ opportunity_id: oppId, ...c, sort_order: j }));
      (trials ?? []).forEach((t, j) => trialRows.push({ opportunity_id: oppId, ...t, sort_order: j }));
      (score_components ?? []).forEach((s, j) => componentRows.push({ opportunity_id: oppId, ...s, sort_order: j }));
      (capabilities ?? []).forEach((c) => capabilityRows.push({ opportunity_id: oppId, ...c, source: "suggested" }));
    }
    if (cohortRows.length) {
      const { error: ce } = await admin.from("opportunity_cohorts").insert(cohortRows);
      if (ce) throw new Error(`opportunity_cohorts insert: ${ce.message}`);
      counts.opportunity_cohorts = cohortRows.length;
    }
    if (trialRows.length) {
      const { error: te } = await admin.from("opportunity_trials").insert(trialRows);
      if (te) throw new Error(`opportunity_trials insert: ${te.message}`);
      counts.opportunity_trials = trialRows.length;
    }
    if (componentRows.length) {
      const { error: se } = await admin.from("opportunity_score_components").insert(componentRows);
      if (se) throw new Error(`opportunity_score_components insert: ${se.message}`);
      counts.opportunity_score_components = componentRows.length;
    }
    if (capabilityRows.length) {
      const { error: cae } = await admin.from("opportunity_capabilities").insert(capabilityRows);
      if (cae) throw new Error(`opportunity_capabilities insert: ${cae.message}`);
      counts.opportunity_capabilities = capabilityRows.length;
    }

    // `replace`: make the run authoritative per company — prune opportunities whose key
    // didn't arrive in this payload. Never prune rows a reviewer has given feedback on.
    if (mode === "replace") {
      for (const [company_id, keys] of incomingByCompany) {
        const { data: existing, error: qe } = await admin.from("opportunities").select("id, asset_key").eq("company_id", company_id);
        if (qe) throw new Error(`replace prune query: ${qe.message}`);
        const stale = (existing ?? []).filter((r) => r.asset_key && !keys.has(r.asset_key as string)).map((r) => r.id as string);
        if (!stale.length) continue;
        const { data: fb } = await admin.from("opportunity_feedback").select("opportunity_id").in("opportunity_id", stale);
        const keep = new Set((fb ?? []).map((f) => f.opportunity_id as string));
        const toDelete = stale.filter((id) => !keep.has(id));
        if (!toDelete.length) continue;
        const { error: del } = await admin.from("opportunities").delete().in("id", toDelete); // children cascade
        if (del) throw new Error(`replace prune: ${del.message}`);
        counts.pruned_opportunities += toDelete.length;
      }
    }
  }

  if (payload.capabilities?.length) {
    const { error } = await admin.from("capabilities").upsert(payload.capabilities, { onConflict: "capability_id" });
    if (error) throw new Error(`capabilities upsert: ${error.message}`);
    counts.capabilities = payload.capabilities.length;
  }

  if (payload.tma_catalog?.length) {
    const { error } = await admin.from("tma_catalog").insert(payload.tma_catalog);
    if (error) throw new Error(`tma_catalog insert: ${error.message}`);
    counts.tma_catalog = payload.tma_catalog.length;
  }

  return counts;
}
