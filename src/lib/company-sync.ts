import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import {
  isHubspotConfigured, fetchCompanyIndex, ensureCompanyTypeProperty, batchUpdateCompanies,
  createCompany, normalizeDomain, normalizeCompanyName, COMPANY_TYPE_PROPERTY,
} from "@/lib/hubspot";
import { NEEDS_TYPE, type CompanyType } from "@/lib/company-types";
import { getModelFor, logLlmCall } from "@/lib/llm";

type Admin = ReturnType<typeof createAdminClient>;

// ───────────────────────── Claude type classification ─────────────────────────

const ClassResult = z.object({
  type: z.enum(["Pharma", "Biotech", "Early Stage Startup", "Academia", "Non-Profit", "Other"]),
  confident: z.boolean(),
  reason: z.string().max(200),
});

const SYSTEM = `You classify a company by TYPE for TriStar Technology Group, an oncology biospecimen/CRO whose customers are pharma, biotech, diagnostics, and AI/computational-pathology firms.
Choose exactly one type:
- "Pharma": established pharmaceutical company (clinical/commercial drugs, broad pipeline).
- "Biotech": biotechnology / drug-discovery company past the earliest stage.
- "Early Stage Startup": a young/seed/Series-A startup, often <50 people or recently founded.
- "Academia": university, academic medical center, hospital, or research institute.
- "Non-Profit": foundation, charity, consortium, or non-profit research org.
- "Other": diagnostics/tools/CRO/AI-pathology/government or anything not above.
Decide from the name, email/web domain, and industry. Set confident=false ONLY when you genuinely cannot tell (e.g. a generic name with no domain/industry signal) — then it stays unclassified. Pharma vs Biotech: large/established → Pharma; smaller/discovery-stage → Biotech. Keep reason to one sentence.`;

/** Classify one company into the type enum. Returns null when no key, error, or low confidence
 *  (caller keeps it 'Needs Type Defined'). */
export async function classifyCompanyType(input: { name: string; domain?: string | null; industry?: string | null }): Promise<{ type: CompanyType; reason: string } | null> {
  if (!serverEnv.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });
  const { model } = await getModelFor("company_type");
  const t0 = Date.now();
  try {
    const res = await client.messages.parse({
      model,
      max_tokens: 300,
      system: SYSTEM,
      messages: [{ role: "user", content: `Company: ${input.name}\nDomain: ${input.domain ?? "(unknown)"}\nIndustry: ${input.industry ?? "(unknown)"}` }],
      output_config: { format: zodOutputFormat(ClassResult) },
    });
    await logLlmCall({ area: "company_type", model, inputTokens: res.usage?.input_tokens, outputTokens: res.usage?.output_tokens, latencyMs: Date.now() - t0 });
    const out = res.parsed_output;
    if (!out || !out.confident) return null;
    return { type: out.type as CompanyType, reason: out.reason };
  } catch (e) {
    await logLlmCall({ area: "company_type", model, latencyMs: Date.now() - t0, ok: false, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]); }
  }));
}

export type ClassifyResult = { processed: number; updated: number; byType: Record<string, number>; remaining: number };

/** Classify companies still marked 'Needs Type Defined' (concurrency-pooled Haiku). Updates the
 *  app row only when Claude is confident; otherwise leaves it for a human. */
export async function classifyMissingCompanyTypes(admin: Admin, opts: { limit?: number } = {}): Promise<ClassifyResult> {
  const { data } = await admin
    .from("companies")
    .select("id, name, domain, industry")
    .eq("type", NEEDS_TYPE)
    .limit(opts.limit ?? 1000);
  const rows = (data ?? []) as { id: string; name: string; domain: string | null; industry: string | null }[];
  const byType: Record<string, number> = {};
  let updated = 0;
  await pool(rows, 6, async (c) => {
    const r = await classifyCompanyType({ name: c.name, domain: c.domain, industry: c.industry });
    if (!r) return;
    const { error } = await admin.from("companies").update({ type: r.type, updated_at: new Date().toISOString() }).eq("id", c.id);
    if (!error) { updated++; byType[r.type] = (byType[r.type] ?? 0) + 1; }
  });
  const { count } = await admin.from("companies").select("id", { count: "exact", head: true }).eq("type", NEEDS_TYPE);
  return { processed: rows.length, updated, byType, remaining: count ?? 0 };
}

// ───────────────────────── HubSpot company sync (dedup-safe) ─────────────────────────

const prettyIndustry = (s: string | null) => (s ? s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : null);

export type CompanySyncReport = {
  dryRun: boolean;
  total: number;
  matched: { byId: number; byDomain: number; byName: number };
  unmatched: number;
  wouldCreateSample: string[];
  adoptedHubspotId: number;   // matched app rows that had no/incorrect hubspot_id → linked
  enrichedApp: number;        // app rows that gained industry/website/domain from HS
  typePushed: number;         // companies whose type we pushed to HS
  created: number;            // new HS companies created (0 unless createMissing && !dryRun)
  errors: string[];
};

type AppCompany = { id: string; name: string; type: CompanyType; domain: string | null; website: string | null; industry: string | null; country: string | null; hubspot_id: string | null };

/**
 * Two-way company sync. Matches every app company to a HubSpot company by hubspot_id → domain →
 * normalized name (domain is the strong key; name is a conservative fallback). For matches: adopt
 * the hubspot_id, enrich missing app fields from HS, and push the app `type` to the
 * tristar_company_type property. For non-matches: candidates to CREATE in HubSpot.
 *
 * DEDUP SAFETY: run with { dryRun: true } first — it writes NOTHING and reports match counts +
 * the names it WOULD create, so creates can be verified as genuinely new before executing. Creates
 * only happen with { dryRun: false, createMissing: true }.
 */
export async function syncCompaniesToHubspot(admin: Admin, opts: { dryRun?: boolean; createMissing?: boolean } = {}): Promise<CompanySyncReport> {
  if (!isHubspotConfigured()) throw new Error("HubSpot not configured");
  const dryRun = opts.dryRun !== false ? opts.dryRun ?? true : false; // default to dry-run unless explicitly false
  const report: CompanySyncReport = {
    dryRun: !!dryRun, total: 0, matched: { byId: 0, byDomain: 0, byName: 0 }, unmatched: 0,
    wouldCreateSample: [], adoptedHubspotId: 0, enrichedApp: 0, typePushed: 0, created: 0, errors: [],
  };

  const index = await fetchCompanyIndex();
  if (!dryRun) { try { await ensureCompanyTypeProperty(); } catch (e) { report.errors.push(`ensure type property: ${e instanceof Error ? e.message : String(e)}`); } }

  const { data } = await admin.from("companies").select("id, name, type, domain, website, industry, country, hubspot_id").limit(5000);
  const companies = (data ?? []) as AppCompany[];
  report.total = companies.length;

  const typePush: { id: string; properties: Record<string, string> }[] = [];

  for (const c of companies) {
    // Resolve the HubSpot id: existing id (still present) → domain → normalized name.
    let hsId: string | null = null; let how: "byId" | "byDomain" | "byName" | null = null;
    if (c.hubspot_id && index.byId.has(c.hubspot_id)) { hsId = c.hubspot_id; how = "byId"; }
    if (!hsId) { const d = normalizeDomain(c.domain || c.website); if (d && index.byDomain.has(d)) { hsId = index.byDomain.get(d)!; how = "byDomain"; } }
    if (!hsId) { const n = normalizeCompanyName(c.name); if (n && index.byName.has(n)) { hsId = index.byName.get(n)!; how = "byName"; } }

    if (hsId && how) {
      report.matched[how]++;
      const hs = index.byId.get(hsId);
      if (!dryRun) {
        // Adopt the id when missing/changed.
        if (c.hubspot_id !== hsId) {
          const { error } = await admin.from("companies").update({ hubspot_id: hsId, updated_at: new Date().toISOString() }).eq("id", c.id);
          if (error) report.errors.push(`adopt ${c.name}: ${error.message}`); else report.adoptedHubspotId++;
        }
        // Enrich missing app fields from HS.
        const patch: Record<string, unknown> = {};
        if (!c.industry && hs?.industry) patch.industry = prettyIndustry(hs.industry);
        if (!c.website && hs?.website) patch.website = hs.website;
        if (!c.domain && hs?.domain) patch.domain = hs.domain;
        if (Object.keys(patch).length) {
          const { error } = await admin.from("companies").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", c.id);
          if (error) report.errors.push(`enrich ${c.name}: ${error.message}`); else report.enrichedApp++;
        }
        // Queue the type push (batched after the loop).
        typePush.push({ id: hsId, properties: { [COMPANY_TYPE_PROPERTY]: c.type } });
      }
    } else {
      report.unmatched++;
      if (report.wouldCreateSample.length < 50) report.wouldCreateSample.push(c.name);
      if (!dryRun && opts.createMissing) {
        try {
          const props: Record<string, string> = { name: c.name, [COMPANY_TYPE_PROPERTY]: c.type };
          const dom = normalizeDomain(c.domain || c.website);
          if (dom) props.domain = dom;
          const newId = await createCompany(props);
          await admin.from("companies").update({ hubspot_id: newId, updated_at: new Date().toISOString() }).eq("id", c.id);
          report.created++;
        } catch (e) { report.errors.push(`create ${c.name}: ${e instanceof Error ? e.message : String(e)}`); }
      }
    }
  }

  if (!dryRun && typePush.length) {
    try { await batchUpdateCompanies(typePush); report.typePushed = typePush.length; }
    catch (e) { report.errors.push(`type push: ${e instanceof Error ? e.message : String(e)}`); }
  }

  return report;
}
