import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tierChip, tierRank, isProprietary } from "@/lib/prospecting-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prospecting — Minideck" };

type Opp = {
  id: string;
  company_id: string | null;
  company_name: string;
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

  const { data } = await supabase
    .from("opportunities")
    .select("id, company_id, company_name, asset_name, modality, target, phase, fit_score, fit_tier, proprietary, matched_tma_skus, suggested_capabilities, run_label")
    .limit(500);

  const opps = (data ?? []) as Opp[];
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
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">#</th>
                <th className="px-4 py-2.5 font-medium">Company</th>
                <th className="px-4 py-2.5 font-medium">Asset</th>
                <th className="px-4 py-2.5 font-medium">Target</th>
                <th className="px-4 py-2.5 font-medium">Modality</th>
                <th className="px-4 py-2.5 font-medium">Phase</th>
                <th className="px-4 py-2.5 font-medium">Tier</th>
                <th className="px-4 py-2.5 font-medium">Fit</th>
                <th className="px-4 py-2.5 font-medium">Matched TMAs</th>
                <th className="px-4 py-2.5 font-medium">Suggested capabilities</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ranked.map((o, i) => (
                <tr key={o.id} className="align-top transition-colors hover:bg-surface-subtle">
                  <td className="px-4 py-2.5 text-ink-muted">{i + 1}</td>
                  <td className="px-4 py-2.5">
                    {o.company_id ? (
                      <Link href={`/prospecting/${o.company_id}`} className="font-medium text-ink hover:text-link">
                        {o.company_name} →
                      </Link>
                    ) : (
                      <span className="font-medium text-ink">{o.company_name}</span>
                    )}
                    {isProprietary(o.proprietary) && <span className="ml-2 chip bg-surface-muted text-nav text-[0.6rem]">proprietary</span>}
                  </td>
                  <td className="px-4 py-2.5 text-ink">{o.asset_name}</td>
                  <td className="px-4 py-2.5 text-ink-muted">{o.target ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink-muted">{o.modality ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">{o.phase ?? "—"}</td>
                  <td className="px-4 py-2.5"><span className={`chip ${tierChip(o.fit_tier)}`}>{o.fit_tier ?? "—"}</span></td>
                  <td className="px-4 py-2.5 text-ink">{o.fit_score ?? "—"}</td>
                  <td className="max-w-[16rem] truncate px-4 py-2.5 text-xs text-ink-muted" title={o.matched_tma_skus ?? ""}>{o.matched_tma_skus ?? "—"}</td>
                  <td className="max-w-[14rem] truncate px-4 py-2.5 text-xs text-ink-muted" title={o.suggested_capabilities ?? ""}>{o.suggested_capabilities ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-muted/70">
        Research + scoring by the Claude prospecting skill; logged to the app. Click a company for its full pipeline + opportunities.
      </p>
    </main>
  );
}
