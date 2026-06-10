"use client";

import { useState, useMemo } from "react";

export type Program = {
  id: string; asset_name: string; modality: string | null; target: string | null; highest_phase: string | null;
  tumor_types: string | null; in_window: boolean | null; proprietary: string | null;
};

const fcls = "w-full rounded-sm border border-line-strong bg-surface px-2 py-1 text-xs font-normal normal-case tracking-normal text-ink";
const EMPTY = { asset: "", modality: "all", target: "", phase: "all", tumor: "", inwin: "all", owner: "" };

export default function ProgramTable({ programs }: { programs: Program[] }) {
  const [f, setF] = useState(EMPTY);
  const set = (k: keyof typeof EMPTY, v: string) => setF((s) => ({ ...s, [k]: v }));

  const modalities = useMemo(() => [...new Set(programs.map((p) => p.modality).filter(Boolean) as string[])].sort(), [programs]);
  const phases = useMemo(() => [...new Set(programs.map((p) => p.highest_phase).filter(Boolean) as string[])].sort(), [programs]);

  const has = (s: string | null, q: string) => !q.trim() || (s ?? "").toLowerCase().includes(q.trim().toLowerCase());
  const filtered = useMemo(() => programs.filter((p) => {
    if (f.modality !== "all" && p.modality !== f.modality) return false;
    if (f.phase !== "all" && p.highest_phase !== f.phase) return false;
    if (f.inwin === "yes" && !p.in_window) return false;
    if (f.inwin === "no" && p.in_window) return false;
    return has(p.asset_name, f.asset) && has(p.target, f.target) && has(p.tumor_types, f.tumor) && has(p.proprietary, f.owner);
  }), [programs, f]);

  if (programs.length === 0) {
    return <p className="card px-6 py-8 text-center text-sm text-ink-muted">No programs on file for this company.</p>;
  }
  const active = JSON.stringify(f) !== JSON.stringify(EMPTY);

  return (
    <div className="card overflow-x-auto">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2 text-xs text-ink-muted">
        <span>{filtered.length} of {programs.length} programs</span>
        {active && <button type="button" className="text-link hover:underline" onClick={() => setF(EMPTY)}>Clear filters</button>}
      </div>
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="text-xs text-ink-muted">
          <tr className="border-b border-line uppercase tracking-wide">
            <th className="px-4 py-2.5 font-medium">Asset</th>
            <th className="px-4 py-2.5 font-medium">Modality</th>
            <th className="px-4 py-2.5 font-medium">Target</th>
            <th className="px-4 py-2.5 font-medium">Phase</th>
            <th className="px-4 py-2.5 font-medium">Tumor types</th>
            <th className="px-4 py-2.5 font-medium">In window</th>
            <th className="px-4 py-2.5 font-medium">Ownership</th>
          </tr>
          <tr className="border-b border-line">
            <th className="px-2 py-2"><input className={fcls} placeholder="Filter…" value={f.asset} onChange={(e) => set("asset", e.target.value)} aria-label="Filter by asset" /></th>
            <th className="px-2 py-2">
              <select className={fcls} value={f.modality} onChange={(e) => set("modality", e.target.value)} aria-label="Filter by modality">
                <option value="all">All</option>{modalities.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </th>
            <th className="px-2 py-2"><input className={fcls} placeholder="Filter…" value={f.target} onChange={(e) => set("target", e.target.value)} aria-label="Filter by target" /></th>
            <th className="px-2 py-2">
              <select className={fcls} value={f.phase} onChange={(e) => set("phase", e.target.value)} aria-label="Filter by phase">
                <option value="all">All</option>{phases.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </th>
            <th className="px-2 py-2"><input className={fcls} placeholder="Filter…" value={f.tumor} onChange={(e) => set("tumor", e.target.value)} aria-label="Filter by tumor type" /></th>
            <th className="px-2 py-2">
              <select className={fcls} value={f.inwin} onChange={(e) => set("inwin", e.target.value)} aria-label="Filter by in-window">
                <option value="all">All</option><option value="yes">Yes</option><option value="no">No</option>
              </select>
            </th>
            <th className="px-2 py-2"><input className={fcls} placeholder="Filter…" value={f.owner} onChange={(e) => set("owner", e.target.value)} aria-label="Filter by ownership" /></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {filtered.length === 0 ? (
            <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-muted">No programs match these filters.</td></tr>
          ) : (
            filtered.map((p) => (
              <tr key={p.id} className="align-top transition-colors hover:bg-surface-subtle">
                <td className="px-4 py-2.5 text-ink">{p.asset_name}</td>
                <td className="px-4 py-2.5 text-ink-muted">{p.modality ?? "—"}</td>
                <td className="px-4 py-2.5 text-ink-muted">{p.target ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">{p.highest_phase ?? "—"}</td>
                <td className="max-w-[18rem] truncate px-4 py-2.5 text-xs text-ink-muted" title={p.tumor_types ?? ""}>{p.tumor_types ?? "—"}</td>
                <td className="px-4 py-2.5 text-ink-muted">{p.in_window ? "Yes" : "No"}</td>
                <td className="max-w-[12rem] truncate px-4 py-2.5 text-xs text-ink-muted" title={p.proprietary ?? ""}>{p.proprietary ?? "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
