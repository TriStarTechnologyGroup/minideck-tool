import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tierChip, railVar, parseTmas, parseCaps } from "@/lib/prospecting-ui";
import ConvertOpportunity from "./convert-opportunity";

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

  const [{ data: programs }, { data: opportunities }, { data: campaignList }, { data: deckList }] = await Promise.all([
    supabase.from("drug_programs").select("id, asset_name, modality, target, highest_phase, tumor_types, in_window, proprietary").eq("company_id", id).limit(500),
    supabase.from("opportunities").select("id, asset_name, target, modality, phase, fit_score, fit_tier, matched_tma_skus, suggested_capabilities, rationale, run_label").eq("company_id", id).limit(200),
    supabase.from("campaigns").select("id, name").eq("status", "active").order("created_at", { ascending: false }),
    supabase.from("decks").select("id, name").eq("archived", false).order("name"),
  ]);
  const progs = (programs ?? []) as Program[];
  const opps = ((opportunities ?? []) as Opp[]).sort((a, b) => (b.fit_score ?? -1) - (a.fit_score ?? -1));
  const campaigns = (campaignList ?? []) as { id: string; name: string }[];
  const decks = (deckList ?? []) as { id: string; name: string }[];

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
            {opps.map((o) => {
              const tmas = parseTmas(o.matched_tma_skus);
              const caps = parseCaps(o.suggested_capabilities);
              const meta: [string, string | null][] = [["target", o.target], ["modality", o.modality], ["phase", o.phase]];
              return (
                <div key={o.id} className="card flex overflow-hidden p-0">
                  <div className="w-1 shrink-0" style={{ background: railVar(o.fit_tier) }} aria-hidden />
                  <div className="min-w-0 flex-1 p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/prospecting/opportunity/${o.id}`} className="font-display text-base font-medium text-ink hover:text-link">{o.asset_name} →</Link>
                          {o.fit_tier && <span className={`chip ${tierChip(o.fit_tier)}`}>{o.fit_tier}</span>}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {meta.filter(([, v]) => v).map(([label, v]) => (
                            <span key={label} className="inline-flex items-center gap-1 rounded-sm border border-line px-2 py-0.5 text-xs text-ink">
                              <span className="text-ink-muted">{label}</span> {v}
                            </span>
                          ))}
                        </div>
                      </div>
                      {o.fit_score != null && (
                        <div className="shrink-0 text-right">
                          <div className="text-2xl font-medium leading-none text-ink">{o.fit_score}</div>
                          <div className="text-[0.7rem] text-ink-muted">fit score</div>
                        </div>
                      )}
                    </div>

                    {o.rationale && <p className="mt-3 text-sm leading-relaxed text-ink-muted">{o.rationale}</p>}

                    {(tmas.chips.length > 0 || tmas.note) && (
                      <div className="mt-3">
                        <div className="mb-1.5 text-[0.7rem] uppercase tracking-wide text-ink-muted">
                          Matched TMAs{tmas.chips.length > 0 && <span className="ml-1 normal-case text-nav">{tmas.chips.length}</span>}
                        </div>
                        {tmas.chips.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {tmas.chips.slice(0, 10).map((t, i) => (
                              <span key={i} className="inline-flex items-center gap-1.5 rounded-sm bg-surface-subtle px-2 py-0.5 text-xs">
                                <span className="font-mono text-ink">{t.code}</span>
                                {t.marker && <span className="text-[0.7rem] text-nav">{t.marker}</span>}
                              </span>
                            ))}
                            {tmas.chips.length > 10 && <span className="rounded-sm bg-surface-subtle px-2 py-0.5 text-xs text-ink-muted">+{tmas.chips.length - 10} more</span>}
                          </div>
                        ) : (
                          <p className="text-xs text-ink-muted">{tmas.note}</p>
                        )}
                      </div>
                    )}

                    {caps.length > 0 && (
                      <div className="mt-3">
                        <div className="mb-1.5 text-[0.7rem] uppercase tracking-wide text-ink-muted">Suggested capabilities</div>
                        <div className="flex flex-wrap gap-1.5">
                          {caps.map((cap, i) => (
                            <span key={i} className="inline-flex items-center gap-1.5 rounded-sm border border-line px-2 py-0.5 text-xs text-ink">
                              {cap.code && <span className="font-mono text-[0.7rem] text-nav">{cap.code}</span>}
                              {cap.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-4">
                      <ConvertOpportunity
                        companyId={c.id}
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
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
