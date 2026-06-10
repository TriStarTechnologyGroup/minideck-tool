"use client";

import { useState, useMemo } from "react";

export type Program = {
  id: string; asset_name: string; modality: string | null; target: string | null; highest_phase: string | null;
  tumor_types: string | null; in_window: boolean | null; proprietary: string | null;
};

export default function ProgramTable({ programs }: { programs: Program[] }) {
  const [q, setQ] = useState("");
  const [phase, setPhase] = useState("all");
  const [inWin, setInWin] = useState(false);

  const phases = useMemo(
    () => [...new Set(programs.map((p) => p.highest_phase).filter(Boolean) as string[])].sort(),
    [programs],
  );

  const filtered = useMemo(() => programs.filter((p) => {
    if (phase !== "all" && p.highest_phase !== phase) return false;
    if (inWin && !p.in_window) return false;
    if (q.trim()) {
      const hay = `${p.asset_name} ${p.target ?? ""} ${p.tumor_types ?? ""} ${p.modality ?? ""}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  }), [programs, q, phase, inWin]);

  if (programs.length === 0) {
    return <p className="card px-6 py-8 text-center text-sm text-ink-muted">No programs on file for this company.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-full sm:w-60" placeholder="Search asset, target, tumor…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={phase} onChange={(e) => setPhase(e.target.value)} aria-label="Filter by phase">
          <option value="all">All phases</option>
          {phases.map((ph) => <option key={ph} value={ph}>{ph}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-ink-muted">
          <input type="checkbox" checked={inWin} onChange={(e) => setInWin(e.target.checked)} /> In window only
        </label>
        <span className="ml-auto text-xs text-ink-muted">{filtered.length} of {programs.length}</span>
      </div>

      {filtered.length === 0 ? (
        <p className="card px-6 py-8 text-center text-sm text-ink-muted">No programs match these filters.</p>
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
              {filtered.map((p) => (
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
    </div>
  );
}
