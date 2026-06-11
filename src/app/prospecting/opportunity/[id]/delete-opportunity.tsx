"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Admin-only delete control for an opportunity. Confirms, calls the cascade-delete API,
// then returns to the parent company (or the prospecting index).
export default function DeleteOpportunity({ id, assetName, backHref }: { id: string; assetName: string; backHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function remove() {
    if (!confirm(`Delete “${assetName}”? This removes its scoring breakdown, cohorts, trials, and any reviewer feedback. This cannot be undone.`)) return;
    setBusy(true); setErr(null);
    const res = await fetch(`/api/prospecting/opportunities/${id}`, { method: "DELETE" });
    if (res.ok) { router.push(backHref); router.refresh(); return; }
    setBusy(false);
    setErr((await res.json().catch(() => null))?.error ?? "Delete failed");
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={remove} disabled={busy}
        className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
        aria-label={`Delete the ${assetName} opportunity`}>
        {busy ? "Deleting…" : "Delete"}
      </button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </span>
  );
}
