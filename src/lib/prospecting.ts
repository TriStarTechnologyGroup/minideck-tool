import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

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
  donors: z.number().int().optional(),
  category: z.string().optional(),
  custom_stain: z.boolean().optional(),
});

const opportunity = z.object({
  run_label: z.string().optional(),
  company_hubspot_id: z.string().optional(),
  company_name: z.string().min(1),
  asset_name: z.string().min(1),
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
  companies: z.array(company).optional(),
  drug_programs: z.array(drugProgram).optional(),
  opportunities: z.array(opportunity).optional(),
  tma_catalog: z.array(tma).optional(),
  capabilities: z.array(capability).optional(),
});

export type ProspectingPayload = z.infer<typeof prospectingPayload>;
export type IngestCounts = { companies: number; drug_programs: number; opportunities: number; opportunity_cohorts: number; tma_catalog: number; capabilities: number };

/** Upsert a prospecting run's output. Idempotent on companies (hubspot_id) and
 *  capabilities (capability_id); programs/opportunities are appended and linked. */
export async function ingestProspecting(admin: Admin, payload: ProspectingPayload): Promise<IngestCounts> {
  const counts: IngestCounts = { companies: 0, drug_programs: 0, opportunities: 0, opportunity_cohorts: 0, tma_catalog: 0, capabilities: 0 };

  if (payload.companies?.length) {
    const withHs = payload.companies.filter((c) => c.hubspot_id);
    const without = payload.companies.filter((c) => !c.hubspot_id);
    if (withHs.length) {
      const { error } = await admin.from("companies").upsert(withHs, { onConflict: "hubspot_id" });
      if (error) throw new Error(`companies upsert: ${error.message}`);
    }
    if (without.length) {
      const { error } = await admin.from("companies").insert(without);
      if (error) throw new Error(`companies insert: ${error.message}`);
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
    const { data } = await admin.from("companies").select("id, name").in("name", names);
    for (const c of data ?? []) byName.set(c.name as string, c.id as string);
  }
  const resolve = (r: { company_hubspot_id?: string; company_name?: string }) =>
    (r.company_hubspot_id && byHs.get(r.company_hubspot_id)) || (r.company_name && byName.get(r.company_name)) || null;

  if (payload.drug_programs?.length) {
    const rows = payload.drug_programs.map(({ company_hubspot_id, ...p }) => ({ ...p, company_id: resolve({ company_hubspot_id, company_name: p.company_name }) }));
    const { error } = await admin.from("drug_programs").insert(rows);
    if (error) throw new Error(`drug_programs insert: ${error.message}`);
    counts.drug_programs = rows.length;
  }

  if (payload.opportunities?.length) {
    // Split each opportunity into its row (cohorts/hint stripped) and its cohort list.
    const prepared = payload.opportunities.map(({ company_hubspot_id, cohorts, ...o }) => ({
      row: { ...o, run_label: o.run_label ?? payload.run_label ?? null, company_id: resolve({ company_hubspot_id, company_name: o.company_name }) },
      cohorts: cohorts ?? [],
    }));
    // Insert returning ids in order so each opportunity's cohorts can be linked.
    const { data: inserted, error } = await admin.from("opportunities").insert(prepared.map((p) => p.row)).select("id");
    if (error) throw new Error(`opportunities insert: ${error.message}`);
    counts.opportunities = prepared.length;

    const cohortRows: Record<string, unknown>[] = [];
    prepared.forEach((p, i) => {
      const oppId = (inserted ?? [])[i]?.id;
      if (oppId) p.cohorts.forEach((c, j) => cohortRows.push({ opportunity_id: oppId, ...c, sort_order: j }));
    });
    if (cohortRows.length) {
      const { error: ce } = await admin.from("opportunity_cohorts").insert(cohortRows);
      if (ce) throw new Error(`opportunity_cohorts insert: ${ce.message}`);
      counts.opportunity_cohorts = cohortRows.length;
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
