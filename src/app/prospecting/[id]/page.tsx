import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tierChip, tierRank } from "@/lib/prospecting-ui";

export const dynamic = "force-dynamic";

type Company = {
  id: string; name: string; domain: string | null; website: string | null; industry: string | null;
  lifecycle_stage: string | null; owner: string | null; employees: number | null; country: string | null;
  pipeline_program_count: number | null; notes: string | null;
};
type Program = {
  id: string; asset_name: string; modality: string | null; target: string | null; highest_phase: string | null;
  tumor_types: string | null; in_window: boolean | null; proprietary: string | null;
};
type Opp = {
  id: string; asset_name: string; target: string | null; modality: string | null; phase: string | null;
  fit_score: number | null; fit_tier: string | null; matched_tma_skus: string | null;
  suggested_capabilities: string | null; rationale: string | null; run_label: string | null;
};

export default async function CompanyProspectingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("id, name, domain, website, industry, lifecycle_stage, owner, employees, country, pipeline_program_count, notes")
    .eq("id", id)
    .maybeSingle();
  if (!company) notFound();
  const c = company as Company;

  const [{ data: programs }, { data: opportunities }] = await Promise.all([
    supabase.from("drug_programs").select("id, asset_name, modality, target, highest_phase, tumor_types, in_window, proprietary").eq("company_id", id).limit(500),
    supabase.from("opportunities").select("id, asset_name, target, modality, phase, fit_score, fit_tier, matched_tma_skus, suggested_capabilities, rationale, run_label").eq("company_id", id).limit(200),
  ]);
  const progs = (programs ?? []) as Program[];
  const opps = ((opportunities ?? []) as Opp[]).sort((a, b) => (b.fit_score ?? -1) - (a.fit_score ?? -1));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/prospecting" className="text-sm text-link hover:underline">← Opportunities</Link>
        <h1 className="mt-2 text-3xl">{c.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {[c.industry, c.lifecycle_stage, c.country, c.employees ? `${c.employees} employees` : null].filter(Boolean).join(" · ") || "—"}
          {c.domain && <> · <a href={`https://${c.domain}`} target="_blank" rel="noreferrer" className="text-link hover:underline">{c.domain}</a></>}
          {c.owner && <> · owner {c.owner}</>}
        </p>
        {c.notes && <p className="mt-2 text-sm text-ink-muted">{c.notes}</p>}
      </div>

      <section>
        <h2 className="mb-2 font-display text-lg font-medium text-ink">
          Opportunities <span className="font-sans text-sm font-normal text-ink-muted">({opps.length})</span>
        </h2>
        {opps.length === 0 ? (
          <p className="card px-6 py-8 text-center text-sm text-ink-muted">No scored opportunities for this company yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {opps.map((o) => (
              <div key={o.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`chip ${tierChip(o.fit_tier)}`}>{o.fit_tier ?? "—"}</span>
                  <span className="font-medium text-ink">{o.asset_name}</span>
                  <span className="text-ink-muted">· {o.target ?? "—"} · {o.modality ?? "—"} · {o.phase ?? "—"}</span>
                  {o.fit_score != null && <span className="ml-auto text-sm text-ink-muted">Fit {o.fit_score}</span>}
                </div>
                {o.rationale && <p className="mt-2 text-sm text-ink-muted">{o.rationale}</p>}
                <div className="mt-2 grid gap-x-6 gap-y-1 text-xs text-ink-muted sm:grid-cols-2">
                  <div><span className="font-medium text-ink">Matched TMAs:</span> {o.matched_tma_skus ?? "—"}</div>
                  <div><span className="font-medium text-ink">Suggested capabilities:</span> {o.suggested_capabilities ?? "—"}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {opps.length > 0 && tierRank(opps[0].fit_tier) === 1 && (
          <p className="mt-3 text-xs text-ink-muted/70">
            Tip: convert a Tier&nbsp;1 opportunity into an ABM campaign + deck from <Link href="/campaigns" className="text-link hover:underline">Campaigns</Link>. (One-click conversion lands in Phase 3.)
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-display text-lg font-medium text-ink">
          Drug programs <span className="font-sans text-sm font-normal text-ink-muted">({progs.length})</span>
        </h2>
        {progs.length === 0 ? (
          <p className="card px-6 py-8 text-center text-sm text-ink-muted">No programs on file for this company.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Asset</th>
                  <th className="px-4 py-2.5 font-medium">Modality</th>
                  <th className="px-4 py-2.5 font-medium">Target</th>
                  <th className="px-4 py-2.5 font-medium">Phase</th>
                  <th className="px-4 py-2.5 font-medium">Tumor types</th>
                  <th className="px-4 py-2.5 font-medium">In window</th>
                  <th className="px-4 py-2.5 font-medium">Ownership</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {progs.map((p) => (
                  <tr key={p.id} className="align-top transition-colors hover:bg-surface-subtle">
                    <td className="px-4 py-2.5 text-ink">{p.asset_name}</td>
                    <td className="px-4 py-2.5 text-ink-muted">{p.modality ?? "—"}</td>
                    <td className="px-4 py-2.5 text-ink-muted">{p.target ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">{p.highest_phase ?? "—"}</td>
                    <td className="max-w-[18rem] truncate px-4 py-2.5 text-xs text-ink-muted" title={p.tumor_types ?? ""}>{p.tumor_types ?? "—"}</td>
                    <td className="px-4 py-2.5 text-ink-muted">{p.in_window ? "Yes" : "No"}</td>
                    <td className="max-w-[12rem] truncate px-4 py-2.5 text-xs text-ink-muted" title={p.proprietary ?? ""}>{p.proprietary ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
