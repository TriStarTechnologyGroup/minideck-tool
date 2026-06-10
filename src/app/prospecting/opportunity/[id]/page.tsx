import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tierChip, parseCaps } from "@/lib/prospecting-ui";
import ConvertOpportunity from "../../[id]/convert-opportunity";

export const dynamic = "force-dynamic";

type Opp = {
  id: string; company_id: string | null; company_name: string; asset_name: string; modality: string | null;
  target: string | null; phase: string | null; tumor_types: string | null; fit_score: number | null;
  fit_tier: string | null; proprietary: string | null; matched_tma_skus: string | null;
  suggested_capabilities: string | null; rationale: string | null; run_label: string | null;
};
type Cohort = { id: string; ta_number: string | null; cohort: string | null; markers: string | null; donors: number | null; category: string | null; custom_stain: boolean };

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const { data: opp } = await supabase
    .from("opportunities")
    .select("id, company_id, company_name, asset_name, modality, target, phase, tumor_types, fit_score, fit_tier, proprietary, matched_tma_skus, suggested_capabilities, rationale, run_label")
    .eq("id", id)
    .maybeSingle();
  if (!opp) notFound();
  const o = opp as Opp;

  const [{ data: cohortRows }, { data: campaignList }, { data: deckList }] = await Promise.all([
    supabase.from("opportunity_cohorts").select("id, ta_number, cohort, markers, donors, category, custom_stain").eq("opportunity_id", id).order("sort_order"),
    supabase.from("campaigns").select("id, name").eq("status", "active").order("created_at", { ascending: false }),
    supabase.from("decks").select("id, name").eq("archived", false).order("name"),
  ]);
  const cohorts = (cohortRows ?? []) as Cohort[];
  const campaigns = (campaignList ?? []) as { id: string; name: string }[];
  const decks = (deckList ?? []) as { id: string; name: string }[];
  const caps = parseCaps(o.suggested_capabilities);
  const totalDonors = cohorts.reduce((s, c) => s + (c.donors ?? 0), 0);

  const snapshot: [string, string | null][] = [
    ["Target", o.target], ["Modality", o.modality], ["Phase", o.phase],
    ["Tumor types", o.tumor_types], ["Ownership", o.proprietary],
  ];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        {o.company_id ? (
          <Link href={`/prospecting/${o.company_id}`} className="text-sm text-link hover:underline">← {o.company_name}</Link>
        ) : (
          <Link href="/prospecting" className="text-sm text-link hover:underline">← Opportunities</Link>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl">{o.asset_name}</h1>
          {o.fit_tier && <span className={`chip ${tierChip(o.fit_tier)}`}>{o.fit_tier}</span>}
          {o.fit_score != null && <span className="text-sm text-ink-muted">Fit score {o.fit_score}</span>}
        </div>
        <p className="mt-1 text-sm text-ink-muted">{o.company_name}{o.run_label ? ` · ${o.run_label}` : ""}</p>
      </div>

      {/* Snapshot */}
      <div className="card flex flex-wrap gap-x-8 gap-y-3 p-5">
        {snapshot.filter(([, v]) => v).map(([label, v]) => (
          <div key={label}>
            <div className="text-[0.7rem] uppercase tracking-wide text-ink-muted">{label}</div>
            <div className="text-sm text-ink">{v}</div>
          </div>
        ))}
      </div>

      {o.rationale && (
        <section>
          <h2 className="mb-2 font-display text-lg font-medium text-ink">Why TriStar fits</h2>
          <p className="card p-5 text-sm leading-relaxed text-ink">{o.rationale}</p>
        </section>
      )}

      {caps.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-lg font-medium text-ink">Recommended offerings</h2>
          <div className="flex flex-wrap gap-1.5">
            {caps.map((cap, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-sm border border-line px-2.5 py-1 text-sm text-ink">
                {cap.code && <span className="font-mono text-xs text-nav">{cap.code}</span>}
                {cap.label}
              </span>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-display text-lg font-medium text-ink">
          Relevant cohorts{" "}
          <span className="font-sans text-sm font-normal text-ink-muted">
            ({cohorts.length}{totalDonors ? ` · ${totalDonors.toLocaleString()} donors` : ""})
          </span>
        </h2>
        {cohorts.length === 0 ? (
          <p className="card px-6 py-8 text-center text-sm text-ink-muted">
            {o.matched_tma_skus ? o.matched_tma_skus : "No matched cohorts on file. Re-run the prospecting skill to populate this opportunity's detail."}
          </p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">TA #</th>
                  <th className="px-4 py-2.5 font-medium">Cohort</th>
                  <th className="px-4 py-2.5 font-medium">Markers</th>
                  <th className="px-4 py-2.5 font-medium text-right">Donors</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {cohorts.map((c) => (
                  <tr key={c.id} className="align-top transition-colors hover:bg-surface-subtle">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-ink">{c.ta_number}</td>
                    <td className="px-4 py-2.5 text-ink">{c.cohort}</td>
                    <td className="px-4 py-2.5">
                      {c.custom_stain
                        ? <span className="text-xs text-ink-muted/70">custom stain</span>
                        : <span className="text-ink-muted">{c.markers ?? "—"}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-ink">{c.donors?.toLocaleString() ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-ink-muted">{c.category ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-ink-muted/70">
          Markers shown are pre-run on that SKU; “custom stain” means the program target is added as a custom IHC stain. Donor counts are catalog figures.
        </p>
      </section>

      <section>
        <h2 className="mb-2 font-display text-lg font-medium text-ink">Take it to market</h2>
        <p className="mb-3 text-sm text-ink-muted">
          Engagement contact: Marie Cumberbatch — Head of Projects &amp; IO Applications. Convert this opportunity into a tracked ABM campaign:
        </p>
        <ConvertOpportunity
          companyId={o.company_id ?? ""}
          campaigns={campaigns}
          decks={decks}
          defaults={{
            research: o.rationale ?? "",
            angle: [
              o.matched_tma_skus ? `Matched TMAs: ${o.matched_tma_skus}` : "",
              o.suggested_capabilities ? `Suggested capabilities: ${o.suggested_capabilities}` : "",
              `Opportunity: ${o.asset_name}${o.target ? ` (${o.target})` : ""}${o.phase ? ` · ${o.phase}` : ""}`,
            ].filter(Boolean).join("\n"),
          }}
        />
      </section>
    </main>
  );
}
