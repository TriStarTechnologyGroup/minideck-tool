"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { tierChip, tierRank, isProprietary } from "@/lib/prospecting-ui";

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
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="text-xs text-ink-muted">
          <tr className="border-b border-line uppercase tracking-wide">
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
          <tr className="border-b border-line">
            <th className="px-2 py-2"></th>
            <th className="px-2 py-2">
              <select className={fcls} value={f.company} onChange={(e) => set("company", e.target.value)} aria-label="Filter by company">
                <option value="all">All companies</option>
                {companies.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select>
            </th>
            <th className="px-2 py-2"><input className={fcls} placeholder="Filter…" value={f.asset} onChange={(e) => set("asset", e.target.value)} aria-label="Filter by asset" /></th>
            <th className="px-2 py-2"><input className={fcls} placeholder="Filter…" value={f.target} onChange={(e) => set("target", e.target.value)} aria-label="Filter by target" /></th>
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
            <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-ink-muted">No opportunities match these filters.</td></tr>
          ) : (
            filtered.map((o, i) => (
              <tr key={o.id} className="align-top transition-colors hover:bg-surface-subtle">
                <td className="px-4 py-2.5 text-ink-muted">{i + 1}</td>
                <td className="px-4 py-2.5">
                  {o.company_id ? (
                    <Link href={`/prospecting/${o.company_id}`} className="font-medium text-ink hover:text-link">{o.company_name} →</Link>
                  ) : (
                    <span className="font-medium text-ink">{o.company_name}</span>
                  )}
                  {isProprietary(o.proprietary) && <span className="ml-2 chip bg-surface-muted text-nav text-[0.6rem]">proprietary</span>}
                </td>
                <td className="px-4 py-2.5"><Link href={`/prospecting/opportunity/${o.id}`} className="text-ink hover:text-link">{o.asset_name}</Link></td>
                <td className="px-4 py-2.5 text-ink-muted">{o.target ?? "—"}</td>
                <td className="px-4 py-2.5 text-ink-muted">{o.modality ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">{o.phase ?? "—"}</td>
                <td className="px-4 py-2.5"><span className={`chip ${tierChip(o.fit_tier)}`}>{o.fit_tier ?? "—"}</span></td>
                <td className="px-4 py-2.5 text-ink">{o.fit_score ?? "—"}</td>
                <td className="max-w-[16rem] truncate px-4 py-2.5 text-xs text-ink-muted" title={o.matched_tma_skus ?? ""}>{o.matched_tma_skus ?? "—"}</td>
                <td className="max-w-[14rem] truncate px-4 py-2.5 text-xs text-ink-muted" title={o.suggested_capabilities ?? ""}>{o.suggested_capabilities ?? "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
