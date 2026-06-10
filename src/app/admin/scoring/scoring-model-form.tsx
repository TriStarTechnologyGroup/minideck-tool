"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

export type Weight = { component: string; weight_max: number; description: string | null; sort_order: number };

export default function ScoringModelForm({ weights }: { weights: Weight[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(weights.map((w) => ({ ...w })));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(() => rows.reduce((s, r) => s + (r.weight_max || 0), 0), [rows]);
  const dirty = useMemo(() => rows.some((r, i) => r.weight_max !== weights[i]?.weight_max || r.description !== weights[i]?.description), [rows, weights]);

  function set(i: number, patch: Partial<Weight>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setSaved(false);
  }

  async function save() {
    setBusy(true); setError(null); setSaved(false);
    const res = await fetch("/api/prospecting/scoring-model", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ components: rows.map((r) => ({ component: r.component, weight_max: r.weight_max, description: r.description })) }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(json.error || "Save failed"); return; }
    setSaved(true); router.refresh();
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-3 text-sm">
        <span className="text-ink-muted">Total weight</span>
        <span className={`chip ${total === 100 ? "bg-surface-muted text-nav" : "bg-danger-bg text-danger"}`}>{total} / 100</span>
        {total !== 100 && <span className="text-xs text-danger">Weights should sum to 100 (score is 0–100).</span>}
      </div>
      <div className="flex flex-col divide-y divide-line">
        {rows.map((r, i) => (
          <div key={r.component} className="flex flex-wrap items-center gap-3 py-3">
            <input type="number" min={0} max={100} value={r.weight_max}
              onChange={(e) => set(i, { weight_max: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
              className="w-16 rounded-sm border border-line-strong bg-surface px-2 py-1 text-sm text-ink" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-ink">{r.component}</div>
              <input className="mt-1 w-full rounded-sm border border-line bg-surface px-2 py-1 text-xs text-ink-muted"
                value={r.description ?? ""} onChange={(e) => set(i, { description: e.target.value })} placeholder="Description" />
            </div>
            <div className="h-1.5 w-24 rounded-sm bg-surface-muted"><div className="h-1.5 rounded-sm bg-primary" style={{ width: `${Math.min(100, r.weight_max)}%` }} /></div>
          </div>
        ))}
      </div>
      {error && <p className="mt-3 rounded-sm bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex items-center gap-2">
        <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : saved && !dirty ? "Saved ✓" : "Save weights"}</button>
        {total !== 100 && <span className="text-xs text-ink-muted">You can save a non-100 total, but scores assume 100.</span>}
      </div>
    </div>
  );
}
