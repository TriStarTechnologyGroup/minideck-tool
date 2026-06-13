import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

// Harvest real production records into eval examples (status 'unlabeled', source 'candidate') so the
// golden sets get seeded from actual app data — including the prospecting skill's own outputs
// (opportunities, touches) — instead of being hand-authored from scratch. The reviewer then labels
// them. Read-only, zero API cost.

const compact = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0)));
const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : s ?? null);

type Harvester = (admin: Admin, limit: number) => Promise<Record<string, unknown>[]>;

const harvestCompanies: Harvester = async (admin, limit) => {
  const { data } = await admin.from("companies").select("name, type, industry, domain, website, employees, country, notes").not("flagged_for_removal", "is", true).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).map((c) => compact({ name: c.name, type: c.type, industry: c.industry, domain: c.domain || c.website, employees: c.employees, country: c.country, notes: clip(c.notes, 300) }));
};

const HARVESTERS: Record<string, Harvester> = {
  company_fit: harvestCompanies,
  company_type: harvestCompanies,
  people_fit: async (admin, limit) => {
    const { data } = await admin.from("contacts").select("full_name, first_name, last_name, position, function, seniority, company, is_decision_maker, location").order("created_at", { ascending: false }).limit(limit);
    return (data ?? []).map((c) => compact({ name: c.full_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(), title: c.position, function: c.function, seniority: c.seniority, company: c.company, is_decision_maker: c.is_decision_maker, location: c.location }));
  },
  opportunity_validity: async (admin, limit) => {
    const { data } = await admin.from("opportunities").select("company_name, asset_name, modality, target, phase, tumor_types, fit_tier, matched_tma_skus, suggested_capabilities, rationale").order("created_at", { ascending: false }).limit(limit);
    return (data ?? []).map((o) => compact({ company: o.company_name, asset: o.asset_name, modality: o.modality, target: o.target, phase: o.phase, tumor_types: o.tumor_types, fit_tier: o.fit_tier, matched_tma_skus: o.matched_tma_skus, suggested_capabilities: o.suggested_capabilities, rationale: clip(o.rationale, 500) }));
  },
  touch_quality: async (admin, limit) => {
    const { data: touches } = await admin.from("touches").select("subject, body, account_id, seq").order("id", { ascending: false }).limit(limit);
    const ids = [...new Set((touches ?? []).map((t) => t.account_id).filter(Boolean))] as string[];
    const { data: accts } = ids.length ? await admin.from("accounts").select("id, name, angle").in("id", ids) : { data: [] };
    const am = new Map((accts ?? []).map((a) => [a.id as string, a]));
    return (touches ?? []).map((t) => { const a = t.account_id ? am.get(t.account_id as string) : null; return compact({ account: a?.name, angle: clip(a?.angle, 300), seq: t.seq, subject: t.subject, body: clip(t.body, 800) }); });
  },
  org_classify: async (admin, limit) => {
    const { data } = await admin.from("inbound_inquiries").select("company_name, company_domain, message").order("received_at", { ascending: false }).limit(limit);
    return (data ?? []).map((i) => compact({ company: i.company_name, domain: i.company_domain, message: clip(i.message, 800) }));
  },
};

/** Areas that can pull candidate examples from app data. */
export function harvestAreas(): string[] { return Object.keys(HARVESTERS); }

/** Harvest up to `limit` recent records for the area into example inputs (caller inserts + dedupes). */
export async function harvestCandidates(admin: Admin, area: string, limit: number): Promise<Record<string, unknown>[]> {
  const h = HARVESTERS[area];
  if (!h) return [];
  return h(admin, Math.min(Math.max(limit, 1), 200));
}
