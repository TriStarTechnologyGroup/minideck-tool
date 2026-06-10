"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import ConvertOpportunity from "./convert-opportunity";
import { tierChip, tierRank, railVar, parseTmas, parseCaps, isProprietary } from "@/lib/prospecting-ui";

export type Opp = {
  id: string; asset_name: string; target: string | null; modality: string | null; phase: string | null;
  fit_score: number | null; fit_tier: string | null; proprietary: string | null; matched_tma_skus: string | null;
  suggested_capabilities: string | null; rationale: string | null;
};

export default function OpportunityList({
  companyId, opps, campaigns, decks,
}: {
  companyId: string; opps: Opp[];
  campaigns: { id: string; name: string }[]; decks: { id: string; name: string }[];
}) {
  const [tier, setTier] = useState("all");
  const [own, setOwn] = useState("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => opps.filter((o) => {
    if (tier !== "all" && tierRank(o.fit_tier) !== Number(tier)) return false;
    if (own === "proprietary" && !isProprietary(o.proprietary)) return false;
    if (own === "partner" && isProprietary(o.proprietary)) return false;
    if (q.trim()) {
      const hay = `${o.asset_name} ${o.target ?? ""} ${o.modality ?? ""}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  }), [opps, tier, own, q]);

  if (opps.length === 0) {
    return <p className="card px-6 py-8 text-center text-sm text-ink-muted">No scored opportunities for this company yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-full sm:w-60" placeholder="Search asset or target…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Filter by tier">
          <option value="all">All tiers</option>
          <option value="1">Tier 1</option>
          <option value="2">Tier 2</option>
          <option value="3">Tier 3</option>
        </select>
        <select className="input w-auto" value={own} onChange={(e) => setOwn(e.target.value)} aria-label="Filter by ownership">
          <option value="all">All ownership</option>
          <option value="proprietary">Proprietary</option>
          <option value="partner">Partner / other</option>
        </select>
        <span className="ml-auto text-xs text-ink-muted">{filtered.length} of {opps.length}</span>
      </div>

      {filtered.length === 0 ? (
        <p className="card px-6 py-8 text-center text-sm text-ink-muted">No opportunities match these filters.</p>
      ) : (
        filtered.map((o) => {
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
                    companyId={companyId}
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
        })
      )}
    </div>
  );
}
