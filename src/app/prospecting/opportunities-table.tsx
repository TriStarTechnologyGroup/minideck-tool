"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { tierChip, tierRank, isProprietary, railVar, parseTmas, parseCaps } from "@/lib/prospecting-ui";

type Opp = {
  id: string; company_id: string | null; company_name: string; asset_name: string;
  modality: string | null; target: string | null; phase: string | null; fit_score: number | null;
  fit_tier: string | null; proprietary: string | null; matched_tma_skus: string | null; suggested_capabilities: string | null;
};

const fcls = "w-full rounded-sm border border-line-strong bg-surface px-2 py-1 text-xs font-normal normal-case tracking-normal text-ink";
const EMPTY = { company: "all", asset: "", target: "", modality: "all", phase: "all", tier: "all", minFit: "", tma: "", caps: "" };

export default function OpportunitiesTable({ opps }: { opps: Opp[] }) {
  const [f, setF] = useState(EMPTY);
  const set = (k: keyof typeof EMPTY, v: string) => setF((s) => ({ ...s, [k]: v }));

  const companies = useMemo(() => {
    const m = new Map<string, string>();
    opps.forEach((o) => { const k = o.company_id ?? o.company_name; if (!m.has(k)) m.set(k, o.company_name); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [opps]);
  const modalities = useMemo(() => [...new Set(opps.map((o) => o.modality).filter(Boolean) as string[])].sort(), [opps]);
  const phases = useMemo(() => [...new Set(opps.map((o) => o.phase).filter(Boolean) as string[])].sort(), [opps]);

  const has = (s: string | null, q: string) => !q.trim() || (s ?? "").toLowerCase().includes(q.trim().toLowerCase());
  const filtered = useMemo(() => opps.filter((o) => {
    if (f.company !== "all" && (o.company_id ?? o.company_name) !== f.company) return false;
    if (f.modality !== "all" && o.modality !== f.modality) return false;
    if (f.phase !== "all" && o.phase !== f.phase) return false;
    if (f.tier !== "all" && tierRank(o.fit_tier) !== Number(f.tier)) return false;
    if (f.minFit && (o.fit_score ?? -1) < Number(f.minFit)) return false;
    return has(o.asset_name, f.asset) && has(o.target, f.target) && has(o.matched_tma_skus, f.tma) && has(o.suggested_capabilities, f.caps);
  }), [opps, f]);

  const active = JSON.stringify(f) !== JSON.stringify(EMPTY);

  return (
    <div className="card overflow-x-auto">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2 text-xs text-ink-muted">
        <span>{filtered.length} of {opps.length} opportunities</span>
        {active && <button type="button" className="text-link hover:underline" onClick={() => setF(EMPTY)}>Clear filters</button>}
      </div>
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="text-xs text-ink-muted">
          <tr className="border-b border-line uppercase tracking-wide">
            <th className="py-2.5 pl-3 pr-2 font-medium">#</th>
            <th className="px-3 py-2.5 font-medium">Asset / company</th>
            <th className="px-3 py-2.5 font-medium">Target</th>
            <th className="px-3 py-2.5 font-medium">Modality</th>
            <th className="px-3 py-2.5 font-medium">Phase</th>
            <th className="px-3 py-2.5 font-medium">Tier</th>
            <th className="px-3 py-2.5 font-medium">Fit</th>
            <th className="px-3 py-2.5 text-center font-medium">TMAs</th>
            <th className="px-3 py-2.5 text-center font-medium">Caps</th>
          </tr>
          <tr className="border-b border-line">
            <th className="py-2 pl-3 pr-2"></th>
            <th className="space-y-1.5 px-3 py-2">
              <select className={fcls} value={f.company} onChange={(e) => set("company", e.target.value)} aria-label="Filter by company">
                <option value="all">All companies</option>
                {companies.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select>
              <input className={fcls} placeholder="Asset filter…" value={f.asset} onChange={(e) => set("asset", e.target.value)} aria-label="Filter by asset" />
            </th>
            <th className="px-3 py-2"><input className={fcls} placeholder="Filter…" value={f.target} onChange={(e) => set("target", e.target.value)} aria-label="Filter by target" /></th>
            <th className="px-2 py-2">
              <select className={fcls} value={f.modality} onChange={(e) => set("modality", e.target.value)} aria-label="Filter by modality">
                <option value="all">All</option>{modalities.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </th>
            <th className="px-2 py-2">
              <select className={fcls} value={f.phase} onChange={(e) => set("phase", e.target.value)} aria-label="Filter by phase">
                <option value="all">All</option>{phases.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </th>
            <th className="px-2 py-2">
              <select className={fcls} value={f.tier} onChange={(e) => set("tier", e.target.value)} aria-label="Filter by tier">
                <option value="all">All</option><option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option>
              </select>
            </th>
            <th className="px-2 py-2"><input className={fcls} type="number" placeholder="≥" value={f.minFit} onChange={(e) => set("minFit", e.target.value)} aria-label="Minimum fit score" /></th>
            <th className="px-2 py-2"><input className={fcls} placeholder="Filter…" value={f.tma} onChange={(e) => set("tma", e.target.value)} aria-label="Filter by matched TMAs" /></th>
            <th className="px-2 py-2"><input className={fcls} placeholder="Filter…" value={f.caps} onChange={(e) => set("caps", e.target.value)} aria-label="Filter by capabilities" /></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {filtered.length === 0 ? (
            <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-ink-muted">No opportunities match these filters.</td></tr>
          ) : (
            filtered.map((o, i) => {
              const tmaCount = parseTmas(o.matched_tma_skus).chips.length;
              const capCount = parseCaps(o.suggested_capabilities).length;
              const fit = o.fit_score;
              return (
                <tr key={o.id} className="align-middle transition-colors hover:bg-surface-subtle">
                  <td className="py-2.5 pl-3 pr-2 text-ink-muted" style={{ borderLeft: `3px solid ${railVar(o.fit_tier)}` }}>{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/prospecting/opportunity/${o.id}`} className="font-medium text-ink hover:text-link">{o.asset_name}</Link>
                      {isProprietary(o.proprietary) && <span className="chip bg-surface-muted text-nav text-[0.6rem]">proprietary</span>}
                    </div>
                    {o.company_id ? (
                      <Link href={`/prospecting/${o.company_id}`} className="text-xs text-ink-muted hover:text-link">{o.company_name}</Link>
                    ) : (
                      <span className="text-xs text-ink-muted">{o.company_name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-ink-muted">{o.target ?? "—"}</td>
                  <td className="px-3 py-2.5 text-ink-muted">{o.modality ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">{o.phase ?? "—"}</td>
                  <td className="px-3 py-2.5"><span className={`chip ${tierChip(o.fit_tier)}`}>{o.fit_tier ?? "—"}</span></td>
                  <td className="px-3 py-2.5">
                    {fit != null ? (
                      <div className="flex items-center gap-2">
                        <span className="w-7 text-ink">{fit}</span>
                        <div className="h-1.5 w-16 rounded-sm bg-surface-muted"><div className="h-1.5 rounded-sm" style={{ width: `${Math.min(100, fit)}%`, background: railVar(o.fit_tier) }} /></div>
                      </div>
                    ) : <span className="text-ink-muted">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center text-ink-muted" title={o.matched_tma_skus ?? ""}>{tmaCount || "—"}</td>
                  <td className="px-3 py-2.5 text-center text-ink-muted" title={o.suggested_capabilities ?? ""}>{capCount || "—"}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
