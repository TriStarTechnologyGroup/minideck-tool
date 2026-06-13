"use client";

import { useState } from "react";

// Triggers a Clay enrichment scope request for this company (on-demand). Clay finds decision-makers
// matching the active ICP roles, up to `limit` people, and posts them back; they appear here after
// Clay completes. When the synced count reaches the cap, surfaces a one-click "Sync more".
export default function ScopeContacts({ companyId, contactCount, scopeLimit }: { companyId: string; contactCount: number; scopeLimit: number | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const atCap = scopeLimit != null && contactCount >= scopeLimit;

  async function run(limit: number) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/contacts/scope", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company_id: companyId, limit }) });
      const j = await res.json();
      setMsg(res.ok ? `Requested up to ${j.limit} — Clay is finding contacts (${j.roles} roles). New ones appear here when it completes.` : `Error: ${j.error ?? res.status}`);
    } catch (e) { setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(false); }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1 text-right">
      <span className="inline-flex items-center gap-2">
        {atCap && <span className="text-xs text-amber-600" title={`Synced the ${scopeLimit}-person cap — there may be more.`}>● {contactCount} synced · more may be available</span>}
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => run(atCap ? (scopeLimit as number) + 100 : scopeLimit ?? 100)} disabled={busy}>
          {busy ? "Requesting…" : atCap ? "Sync 100 more" : "Scope contacts (Clay)"}
        </button>
      </span>
      {msg && <span className="max-w-md text-xs text-ink-muted">{msg}</span>}
    </span>
  );
}
