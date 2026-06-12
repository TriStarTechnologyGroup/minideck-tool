"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Resp = Record<string, unknown>;

export default function SyncActions() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [report, setReport] = useState<Resp | null>(null);
  const [createMissing, setCreateMissing] = useState(false);

  const run = async (mode: string, extra: Resp = {}) => {
    setBusy(mode); setMsg(null);
    try {
      const res = await fetch("/api/companies/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, ...extra }) });
      const j = await res.json();
      if (!res.ok) { setMsg(`Error: ${j.error ?? res.status}`); setReport(null); }
      else {
        setReport(j.report ?? j);
        if (mode === "classify") { setMsg(`Classified ${j.updated} of ${j.processed}; ${j.remaining} still need a type.`); router.refresh(); }
        else if (mode === "hubspot-sync") { setMsg(`Pushed type for ${j.report?.typePushed}; adopted ${j.report?.adoptedHubspotId}; enriched ${j.report?.enrichedApp}; created ${j.report?.created}.`); router.refresh(); }
        else setMsg(null);
      }
    } catch (e) { setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(null); }
  };

  const r = report as { matched?: { byId: number; byDomain: number; byName: number }; unmatched?: number; wouldCreateSample?: string[]; dryRun?: boolean; total?: number; errors?: string[] } | null;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-subtle p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-secondary text-sm" disabled={!!busy} onClick={() => run("classify")}>
          {busy === "classify" ? "Classifying…" : "Classify types (Claude)"}
        </button>
        <button type="button" className="btn btn-secondary text-sm" disabled={!!busy} onClick={() => run("hubspot-dryrun")}>
          {busy === "hubspot-dryrun" ? "Checking…" : "Preview HubSpot sync"}
        </button>
        <button type="button" className="btn btn-primary text-sm" disabled={!!busy} onClick={() => run("hubspot-sync", { createMissing })}>
          {busy === "hubspot-sync" ? "Syncing…" : "Sync to HubSpot"}
        </button>
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          <input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} className="accent-[var(--color-primary)]" />
          create missing in HubSpot
        </label>
      </div>
      {msg && <p className="text-xs text-ink">{msg}</p>}
      {r && (r.matched || r.unmatched != null) && (
        <div className="text-xs text-ink-muted">
          <p>
            {r.dryRun ? "Dry run — nothing written. " : ""}
            {r.total} companies · matched {(r.matched?.byId ?? 0) + (r.matched?.byDomain ?? 0) + (r.matched?.byName ?? 0)}{" "}
            (id {r.matched?.byId ?? 0}, domain {r.matched?.byDomain ?? 0}, name {r.matched?.byName ?? 0}) ·{" "}
            <span className={r.unmatched ? "text-amber-600" : ""}>{r.unmatched ?? 0} unmatched{r.dryRun ? " (would create)" : ""}</span>
          </p>
          {r.wouldCreateSample && r.wouldCreateSample.length > 0 && (
            <p className="mt-1">Would create: {r.wouldCreateSample.slice(0, 30).join(", ")}{r.wouldCreateSample.length > 30 ? "…" : ""}</p>
          )}
          {r.errors && r.errors.length > 0 && <p className="mt-1 text-red-600">{r.errors.length} error(s): {r.errors.slice(0, 3).join("; ")}</p>}
        </div>
      )}
      <p className="text-[0.7rem] text-ink-muted/70">
        Preview first — it lists exactly which companies would be created so duplicates can be ruled out. “Sync” enriches + pushes type for matches; it only creates new HubSpot companies when the checkbox is on.
      </p>
    </div>
  );
}
