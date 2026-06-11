import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tierChip, parseCaps } from "@/lib/prospecting-ui";
import ConvertOpportunity from "../../[id]/convert-opportunity";
import ScoreBreakdown, { type ScoreComponent, type Feedback } from "./score-breakdown";
import CapabilitiesPanel, { type OppCapability } from "./capabilities-panel";
import DeleteOpportunity from "./delete-opportunity";
import TmaPanel, { type AddedTma, type CatalogItem } from "./tma-panel";

export const dynamic = "force-dynamic";

type Opp = {
  id: string; company_id: string | null; company_name: string; asset_name: string; modality: string | null;
  target: string | null; phase: string | null; tumor_types: string | null; fit_score: number | null;
  fit_tier: string | null; proprietary: string | null; matched_tma_skus: string | null;
  suggested_capabilities: string | null; rationale: string | null; run_label: string | null;
};
type Cohort = { id: string; ta_number: string | null; cohort: string | null; markers: string | null; donors: number | null; category: string | null; custom_stain: boolean };
type Trial = {
  id: string; nct_id: string | null; title: string | null; status: string | null; phase: string | null;
  enrollment: number | null; start_date: string | null; primary_completion_date: string | null;
  conditions: string | null; interventions: string | null; primary_endpoints: string | null;
  tissue_requirements: string | null; selection_biomarkers: string | null; relevance_flags: string | null;
  has_results: boolean; url: string | null;
};

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const { data: opp } = await supabase
    .from("opportunities")
    .select("id, company_id, company_name, asset_name, modality, target, phase, tumor_types, fit_score, fit_tier, proprietary, matched_tma_skus, suggested_capabilities, rationale, run_label")
    .eq("id", id)
    .maybeSingle();
  if (!opp) notFound();
  const o = opp as Opp;

  const [{ data: cohortRows }, { data: trialRows }, { data: campaignList }, { data: deckList }] = await Promise.all([
    supabase.from("opportunity_cohorts").select("id, ta_number, cohort, markers, donors, category, custom_stain").eq("opportunity_id", id).order("sort_order"),
    supabase.from("opportunity_trials").select("id, nct_id, title, status, phase, enrollment, start_date, primary_completion_date, conditions, interventions, primary_endpoints, tissue_requirements, selection_biomarkers, relevance_flags, has_results, url").eq("opportunity_id", id).order("sort_order"),
    supabase.from("campaigns").select("id, name").eq("status", "active").order("created_at", { ascending: false }),
    supabase.from("decks").select("id, name").eq("archived", false).order("name"),
  ]);
  const cohorts = (cohortRows ?? []) as Cohort[];
  const trials = (trialRows ?? []) as Trial[];
  const campaigns = (campaignList ?? []) as { id: string; name: string }[];
  const decks = (deckList ?? []) as { id: string; name: string }[];

  const [{ data: componentRows }, { data: capabilityRows }, { data: feedbackRow }, { data: tmaFeedbackRows }, { data: catalogRows }] = await Promise.all([
    supabase.from("opportunity_score_components").select("id, component, weight_max, points, note").eq("opportunity_id", id).order("sort_order"),
    supabase.from("opportunity_capabilities").select("id, capability_id, label, source, confirmed").eq("opportunity_id", id).order("source").order("created_at"),
    supabase.from("opportunity_feedback").select("reviewer_score, component_points, verdict, notes").eq("opportunity_id", id).maybeSingle(),
    supabase.from("opportunity_tma_feedback").select("ta_number, sku, label, verdict").eq("opportunity_id", id),
    supabase.from("tma_catalog").select("id, sku, ta_number, name").order("sku").limit(2000),
  ]);
  const scoreComponents = (componentRows ?? []) as ScoreComponent[];
  const oppCapabilities = (capabilityRows ?? []) as OppCapability[];
  const feedback = (feedbackRow ?? null) as Feedback;

  // TMA reviewer feedback (keyed by TA#) + catalog (TA# → id for links, and the add picker).
  const tmaVerdicts: Record<string, "confirmed" | "rejected" | "added"> = {};
  const addedTmas: AddedTma[] = [];
  for (const r of (tmaFeedbackRows ?? []) as { ta_number: string; sku: string | null; label: string | null; verdict: "confirmed" | "rejected" | "added" }[]) {
    tmaVerdicts[r.ta_number] = r.verdict;
    if (r.verdict === "added") addedTmas.push({ ta_number: r.ta_number, sku: r.sku, label: r.label });
  }
  const catalog = (catalogRows ?? []) as CatalogItem[];
  const tmaLinkByTa: Record<string, string> = {};
  for (const r of catalog) if (r.ta_number) tmaLinkByTa[r.ta_number] = r.id;
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
          {o.fit_score != null && (
            scoreComponents.length === 0
              ? <span className="inline-flex items-center gap-1.5 rounded-sm bg-surface-muted px-2 py-0.5 text-sm text-ink-muted" title="No per-parameter breakdown was captured for this run — treat the score as provisional.">Fit score {o.fit_score} · <span className="text-amber-600">provisional</span></span>
              : <span className="text-sm text-ink-muted">Fit score {o.fit_score}</span>
          )}
          {profile.role === "admin" && <span className="ml-auto"><DeleteOpportunity id={o.id} assetName={o.asset_name} backHref={o.company_id ? `/prospecting/${o.company_id}` : "/prospecting"} /></span>}
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

      <section>
        <h2 className="mb-2 font-display text-lg font-medium text-ink">Scoring breakdown</h2>
        <ScoreBreakdown opportunityId={o.id} skillScore={o.fit_score} components={scoreComponents} feedback={feedback} />
      </section>

      <section>
        <h2 className="mb-2 font-display text-lg font-medium text-ink">Capabilities &amp; products</h2>
        {oppCapabilities.length > 0 || caps.length === 0 ? (
          <CapabilitiesPanel opportunityId={o.id} capabilities={oppCapabilities} />
        ) : (
          <div className="card p-4">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {caps.map((cap, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-sm border border-line px-2.5 py-1 text-sm text-ink">
                  {cap.code && <span className="font-mono text-xs text-nav">{cap.code}</span>}
                  {cap.label}
                </span>
              ))}
            </div>
            <p className="text-xs text-ink-muted/70">From the run summary. Re-run the skill to make these individually confirmable.</p>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-display text-lg font-medium text-ink">
          Relevant cohorts{" "}
          <span className="font-sans text-sm font-normal text-ink-muted">
            ({cohorts.length}{totalDonors ? ` · ${totalDonors.toLocaleString()} donors` : ""})
          </span>
        </h2>
        <TmaPanel opportunityId={o.id} cohorts={cohorts} verdicts={tmaVerdicts} added={addedTmas} catalog={catalog} tmaLinkByTa={tmaLinkByTa} />
        <p className="mt-2 text-xs text-ink-muted/70">
          Markers shown are pre-run on that SKU; “custom stain” means the program target is added as a custom IHC stain. Donor counts are catalog figures.
          Confirm/reject and added TMAs are saved and read back by the prospecting skill to refine matching.
        </p>
      </section>

      {trials.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-lg font-medium text-ink">
            Clinical evidence <span className="font-sans text-sm font-normal text-ink-muted">({trials.length} {trials.length === 1 ? "trial" : "trials"})</span>
          </h2>
          <div className="flex flex-col gap-3">
            {trials.map((t) => {
              const flags = (t.relevance_flags ?? "").split(",").map((x) => x.trim()).filter(Boolean);
              const dates = [t.start_date, t.primary_completion_date].filter(Boolean).join(" → ");
              const s = (t.status ?? "").toLowerCase();
              const statusCls = /recruit|enroll|active|avail/.test(s) ? "bg-emerald-50 text-emerald-700"
                : /complet/.test(s) ? "bg-surface-blue-soft text-link"
                : /terminat|withdraw|suspend/.test(s) ? "bg-red-50 text-red-700"
                : "bg-surface-muted text-ink-muted";
              const details: [string, string | null][] = [
                ["Regimen", t.interventions], ["Indications", t.conditions],
                ["Tissue", t.tissue_requirements], ["Selection", t.selection_biomarkers],
                ["Endpoints", t.primary_endpoints],
              ];
              const shown = details.filter((d) => d[1]);
              return (
                <div key={t.id} className="card overflow-hidden p-0">
                  <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-subtle px-4 py-2.5">
                    {t.nct_id && (
                      <a href={t.url ?? `https://clinicaltrials.gov/study/${t.nct_id}`} target="_blank" rel="noreferrer" className="font-mono text-sm font-semibold text-link hover:underline">{t.nct_id}</a>
                    )}
                    {t.status && <span className={`chip ${statusCls}`}>{t.status}</span>}
                    {t.phase && <span className="chip bg-surface-muted text-nav">{t.phase}</span>}
                    {t.enrollment != null && <span className="chip bg-surface-muted text-ink-muted">n={t.enrollment.toLocaleString()}</span>}
                    {t.has_results && <span className="chip bg-surface-blue-soft text-link">results</span>}
                    {dates && <span className="ml-auto whitespace-nowrap text-xs text-ink-muted">{dates}</span>}
                  </div>
                  <div className="p-4">
                    {t.title && <p className="text-sm font-medium leading-snug text-ink">{t.title}</p>}

                    {flags.length > 0 && (
                      <div className="mt-3 rounded-md border-l-[3px] border-primary bg-surface-blue-soft/50 px-3 py-2">
                        <div className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-link">Why it matters to TriStar</div>
                        <div className="flex flex-wrap gap-1.5">
                          {flags.map((fl, i) => (
                            <span key={i} className="inline-flex items-center rounded-sm bg-surface px-2 py-0.5 text-xs text-link">{fl}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {shown.length > 0 && (
                      <dl className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                        {shown.map(([label, v]) => (
                          <div key={label} className={label === "Endpoints" ? "sm:col-span-2" : ""}>
                            <dt className="text-[0.65rem] font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
                            <dd className={`mt-0.5 text-xs text-ink ${label === "Tissue" ? "font-medium" : ""}`}>{v}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

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
