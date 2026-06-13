"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ModelRow = { area: string; label: string; model: string };

export default function ModelsForm({ rows, models }: { rows: ModelRow[]; models: { id: string; label: string }[] }) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, string>>(Object.fromEntries(rows.map((r) => [r.area, r.model])));
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function setModel(area: string, model: string) {
    const prev = state[area];
    setState((s) => ({ ...s, [area]: model })); setSaving(area); setSaved(null);
    try {
      const res = await fetch("/api/admin/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ area, model }) });
      if (!res.ok) throw new Error(await res.text());
      setSaved(area); router.refresh();
    } catch {
      setState((s) => ({ ...s, [area]: prev })); // revert
    } finally { setSaving(null); }
  }

  return (
    <div className="card divide-y divide-line">
      {rows.map((r) => (
        <div key={r.area} className="flex items-center justify-between gap-4 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-ink">{r.label}</div>
            <div className="font-mono text-xs text-ink-muted">{r.area}</div>
          </div>
          <div className="flex items-center gap-2">
            {saved === r.area && <span className="text-xs text-link">saved</span>}
            <select
              className="rounded-sm border border-line-strong bg-surface px-2 py-1 text-sm text-ink"
              value={state[r.area]} disabled={saving === r.area}
              onChange={(e) => setModel(r.area, e.target.value)} aria-label={`Model for ${r.label}`}>
              {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}
