import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tierRank, isProprietary } from "@/lib/prospecting-ui";
import { NEEDS_TYPE, type CompanyType } from "@/lib/company-types";
import OpportunitiesTable from "./opportunities-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prospecting — Minideck" };

type Opp = {
  id: string;
  company_id: string | null;
  company_name: string;
  company_type: CompanyType;
  company_verified: boolean;
  asset_name: string;
  modality: string | null;
  target: string | null;
  phase: string | null;
  fit_score: number | null;
  fit_tier: string | null;
  proprietary: string | null;
  matched_tma_skus: string | null;
  suggested_capabilities: string | null;
  run_label: string | null;
};

export default async function ProspectingPage() {
  await requireUser();
  const supabase = await createClient();

  const [{ data }, { data: companyRows }] = await Promise.all([
    supabase
      .from("opportunities")
      .select("id, company_id, company_name, asset_name, modality, target, phase, fit_score, fit_tier, proprietary, matched_tma_skus, suggested_capabilities, run_label")
      .limit(500),
    supabase.from("companies").select("id, type, verified").limit(5000),
  ]);

  const companyById = new Map((companyRows ?? []).map((c) => [c.id as string, { type: (c.type as CompanyType) ?? NEEDS_TYPE, verified: !!c.verified }]));
  const opps = ((data ?? []) as Omit<Opp, "company_type" | "company_verified">[]).map((o) => {
    const co = o.company_id ? companyById.get(o.company_id) : undefined;
    return { ...o, company_type: co?.type ?? NEEDS_TYPE, company_verified: co?.verified ?? false };
  }) as Opp[];
  // Proprietary first, then by fit score (nulls last).
  const ranked = [...opps].sort((a, b) => {
    if (isProprietary(a.proprietary) !== isProprietary(b.proprietary)) return isProprietary(a.proprietary) ? -1 : 1;
    return (b.fit_score ?? -1) - (a.fit_score ?? -1);
  });

  const tier1 = opps.filter((o) => tierRank(o.fit_tier) === 1).length;
  const companies = new Set(opps.map((o) => o.company_id ?? o.company_name)).size;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <header>
        <p className="eyebrow">Sales intelligence</p>
        <h1 className="mt-1 text-3xl">Prospecting opportunities</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Scored by the TriStar prospecting skill against our TMA catalog + capabilities. Proprietary,
          early-stage, not-approved assets rank first. {opps.length} opportunities · {tier1} Tier&nbsp;1 ·
          {" "}{companies} companies.
        </p>
      </header>

      {ranked.length === 0 ? (
        <p className="card px-6 py-12 text-center text-sm text-ink-muted">
          No opportunities yet. Run the prospecting skill — it logs results here via the ingestion endpoint.
        </p>
      ) : (
        <OpportunitiesTable opps={ranked} />
      )}
      <p className="text-xs text-ink-muted/70">
        Research + scoring by the Claude prospecting skill; logged to the app. Click a company for its full pipeline + opportunities.
      </p>
    </main>
  );
}
