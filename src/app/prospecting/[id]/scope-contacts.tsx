"use client";

import { useState } from "react";

// Triggers a Clay enrichment scope request for this company (on-demand). Clay finds decision-makers
// matching the active ICP roles and posts them back; they appear here after Clay completes.
export default function ScopeContacts({ companyId }: { companyId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/contacts/scope", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company_id: companyId }) });
      const j = await res.json();
      setMsg(res.ok ? `Requested — Clay is finding contacts (${j.roles} roles). They’ll appear here when it completes.` : `Error: ${j.error ?? res.status}`);
    } catch (e) { setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(false); }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className="btn btn-secondary btn-xs" onClick={run} disabled={busy}>{busy ? "Requesting…" : "Scope contacts (Clay)"}</button>
      {msg && <span className="text-xs text-ink-muted">{msg}</span>}
    </span>
  );
}
