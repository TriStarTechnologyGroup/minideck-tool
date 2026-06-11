import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProspectingAccess } from "@/lib/api";

// JSON read-back + bulk delete for prospecting opportunities. Auth: bearer
// PROSPECTING_INGEST_SECRET or an admin session. Lets the scoring skill reconcile against
// what's stored (before/after a run) instead of scraping the SPA.

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// GET /api/prospecting/opportunities?company=<id|name>  → JSON rows (+ child-existence flags).
export async function GET(req: NextRequest) {
  const denied = await requireProspectingAccess(req);
  if (denied) return denied;
  const admin = createAdminClient();
  const company = req.nextUrl.searchParams.get("company")?.trim();

  let companyId: string | null = null;
  if (company) {
    if (isUuid(company)) companyId = company;
    else {
      const { data } = await admin.from("companies").select("id, hubspot_id").ilike("name", company);
      // prefer the hubspot-bearing canonical row if a name has duplicates
      companyId = (data ?? []).sort((a, b) => (b.hubspot_id ? 1 : 0) - (a.hubspot_id ? 1 : 0))[0]?.id ?? null;
      if (!companyId) return NextResponse.json({ company, opportunities: [] });
    }
  }

  let query = admin
    .from("opportunities")
    .select("id, company_id, asset_name, asset_key, run_label, fit_score, fit_tier, modality, target, phase")
    .order("fit_score", { ascending: false });
  if (companyId) query = query.eq("company_id", companyId);
  const { data: opps, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const ids = (opps ?? []).map((o) => o.id);
  const childIds = async (table: string) => {
    if (!ids.length) return new Set<string>();
    const { data } = await admin.from(table).select("opportunity_id").in("opportunity_id", ids);
    return new Set((data ?? []).map((r) => r.opportunity_id as string));
  };
  const [comps, cohorts, trials, feedback] = await Promise.all([
    childIds("opportunity_score_components"), childIds("opportunity_cohorts"),
    childIds("opportunity_trials"), childIds("opportunity_feedback"),
  ]);

  // Reviewer TMA feedback per opportunity, so the skill can hone matching next run.
  const tmaByOpp = new Map<string, { confirmed: string[]; rejected: string[]; added: { ta_number: string; sku: string | null; label: string | null }[] }>();
  if (ids.length) {
    const { data: tf } = await admin.from("opportunity_tma_feedback").select("opportunity_id, ta_number, sku, label, verdict").in("opportunity_id", ids);
    for (const r of tf ?? []) {
      const e = tmaByOpp.get(r.opportunity_id as string) ?? { confirmed: [], rejected: [], added: [] };
      if (r.verdict === "confirmed") e.confirmed.push(r.ta_number as string);
      else if (r.verdict === "rejected") e.rejected.push(r.ta_number as string);
      else if (r.verdict === "added") e.added.push({ ta_number: r.ta_number as string, sku: r.sku as string | null, label: r.label as string | null });
      tmaByOpp.set(r.opportunity_id as string, e);
    }
  }

  const rows = (opps ?? []).map((o) => ({
    ...o,
    has_score_components: comps.has(o.id),
    has_cohorts: cohorts.has(o.id),
    has_trials: trials.has(o.id),
    has_feedback: feedback.has(o.id),
    tma_feedback: tmaByOpp.get(o.id) ?? { confirmed: [], rejected: [], added: [] },
  }));
  return NextResponse.json({ company: company ?? null, company_id: companyId, count: rows.length, opportunities: rows });
}

// DELETE /api/prospecting/opportunities  body: { ids?: string[], company_name?: string, run_label?: string }
// Deletes by explicit ids and/or by (company_name + run_label) selector. Children cascade.
// At least one selector is required (won't delete the whole table).
export async function DELETE(req: NextRequest) {
  const denied = await requireProspectingAccess(req);
  if (denied) return denied;
  const admin = createAdminClient();
  const body = (await req.json().catch(() => ({}))) as { ids?: string[]; company_name?: string; run_label?: string };
  const { ids, company_name, run_label } = body;
  if (!(ids?.length) && !company_name && !run_label) {
    return NextResponse.json({ error: "Provide ids[] and/or company_name/run_label" }, { status: 400 });
  }

  let deleted = 0;
  if (ids?.length) {
    const { data, error } = await admin.from("opportunities").delete().in("id", ids).select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    deleted += data?.length ?? 0;
  }
  if (company_name || run_label) {
    let q = admin.from("opportunities").delete();
    if (company_name) {
      const { data: c } = await admin.from("companies").select("id").ilike("name", company_name);
      const cids = (c ?? []).map((r) => r.id);
      if (!cids.length) return NextResponse.json({ ok: true, deleted });
      q = q.in("company_id", cids);
    }
    if (run_label) q = q.eq("run_label", run_label);
    const { data, error } = await q.select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    deleted += data?.length ?? 0;
  }
  return NextResponse.json({ ok: true, deleted });
}
