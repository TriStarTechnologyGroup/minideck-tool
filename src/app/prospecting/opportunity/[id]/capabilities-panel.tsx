"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type OppCapability = { id: string; capability_id: string | null; label: string; source: "suggested" | "added"; confirmed: boolean };

export default function CapabilitiesPanel({ opportunityId, capabilities }: { opportunityId: string; capabilities: OppCapability[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [capId, setCapId] = useState("");

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch(`/api/prospecting/opportunities/${opportunityId}/capabilities`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <div className="card p-4">
      <p className="mb-3 text-xs text-ink-muted">Confirm the capabilities the skill suggested, or add your own. Confirmed + added capabilities feed the scoring feedback loop.</p>
      <div className="flex flex-col gap-1.5">
        {capabilities.map((c) => (
          <div key={c.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={c.confirmed} disabled={busy}
              onChange={(e) => post({ action: "confirm", capabilityRowId: c.id, confirmed: e.target.checked })} />
            {c.capability_id && <span className="font-mono text-[0.7rem] text-nav">{c.capability_id}</span>}
            <span className={c.confirmed ? "text-ink" : "text-ink-muted"}>{c.label}</span>
            {c.source === "added" && <span className="chip bg-surface-blue-soft text-link text-[0.6rem]">added</span>}
            {c.source === "added" && (
              <button type="button" className="ml-auto text-xs text-danger hover:underline" disabled={busy} onClick={() => post({ action: "remove", capabilityRowId: c.id })}>remove</button>
            )}
          </div>
        ))}
        {capabilities.length === 0 && <p className="text-sm text-ink-muted">No capabilities recorded yet — add the ones relevant to this opportunity.</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
        <input className="input w-24" placeholder="ID (opt)" value={capId} onChange={(e) => setCapId(e.target.value)} />
        <input className="input flex-1 min-w-[12rem]" placeholder="Add a capability / product…" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button type="button" className="btn btn-secondary" disabled={busy || !label.trim()}
          onClick={() => { post({ action: "add", label: label.trim(), capability_id: capId.trim() || null }); setLabel(""); setCapId(""); }}>+ Add</button>
      </div>
    </div>
  );
}
