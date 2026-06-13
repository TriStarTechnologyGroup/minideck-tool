"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ic = "rounded-sm border border-line-strong bg-surface px-2 py-1 text-sm text-ink";

export default function EvalsCreate({ areas }: { areas: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", area: areas[0] ?? "company_type", eval_type: "classification", description: "" });
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/evals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
      const j = await res.json();
      if (res.ok) router.push(`/admin/evals/${j.id}`); else alert(j.error ?? "Failed");
    } finally { setBusy(false); }
  }

  if (!open) return <button type="button" className="btn btn-secondary btn-xs self-start" onClick={() => setOpen(true)}>+ New dataset</button>;

  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="col-span-2 text-xs text-ink-muted">Name<input className={`${ic} w-full`} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Company type — golden v1" /></label>
        <label className="text-xs text-ink-muted">Area
          <input className={`${ic} w-full`} list="eval-areas" value={v.area} onChange={(e) => setV({ ...v, area: e.target.value })} />
          <datalist id="eval-areas">{areas.map((a) => <option key={a} value={a} />)}</datalist>
        </label>
        <label className="text-xs text-ink-muted">Type
          <select className={`${ic} w-full`} value={v.eval_type} onChange={(e) => setV({ ...v, eval_type: e.target.value })}>
            <option value="classification">classification</option>
            <option value="match">match</option>
            <option value="judge">judge</option>
            <option value="assertion">assertion</option>
          </select>
        </label>
      </div>
      <input className={`${ic} w-full`} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="Description (optional)" />
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary btn-xs" disabled={busy || !v.name.trim()} onClick={create}>{busy ? "Creating…" : "Create"}</button>
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <p className="text-[0.7rem] text-ink-muted/70">All four scorers run today: <b>classification</b> (vs production classifier), <b>judge</b> (LLM rubric — fit + touch quality), <b>assertion</b> (deterministic guardrails), and <b>match</b> (precision/recall/F1 vs a gold set). Pick the area that matches the registered scorer for best results.</p>
    </div>
  );
}
