"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Report = { dryRun: boolean; total: number; matched: { byId: number; byEmail: number }; unmatched: number; wouldCreateSample: string[]; adoptedHubspotId: number; enrichedApp: number; pushed: number; created: number; errors: string[] };

export default function ContactSyncActions() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [createMissing, setCreateMissing] = useState(false);

  const run = async (mode: string) => {
    setBusy(mode); setMsg(null);
    try {
      const res = await fetch("/api/contacts/sync-hubspot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, createMissing }) });
      const j = await res.json();
      if (!res.ok) { setMsg(`Error: ${j.error ?? res.status}`); setReport(null); }
      else { setReport(j.report); if (mode === "sync") { setMsg(`Pushed ${j.report.pushed}; adopted ${j.report.adoptedHubspotId}; enriched ${j.report.enrichedApp}; created ${j.report.created}.`); router.refresh(); } }
    } catch (e) { setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(null); }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-subtle p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-secondary text-sm" disabled={!!busy} onClick={() => run("dryrun")}>{busy === "dryrun" ? "Checking…" : "Preview HubSpot sync"}</button>
        <button type="button" className="btn btn-primary text-sm" disabled={!!busy} onClick={() => run("sync")}>{busy === "sync" ? "Syncing…" : "Sync to HubSpot"}</button>
        <label className="flex items-center gap-1.5 text-xs text-ink-muted"><input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} className="accent-[var(--color-primary)]" /> create missing in HubSpot</label>
      </div>
      {msg && <p className="text-xs text-ink">{msg}</p>}
      {report && (
        <div className="text-xs text-ink-muted">
          <p>{report.dryRun ? "Dry run — nothing written. " : ""}{report.total} contacts · matched {report.matched.byId + report.matched.byEmail} (id {report.matched.byId}, email {report.matched.byEmail}) · <span className={report.unmatched ? "text-amber-600" : ""}>{report.unmatched} unmatched{report.dryRun ? " (would create)" : ""}</span></p>
          {report.wouldCreateSample.length > 0 && <p className="mt-1">Would create: {report.wouldCreateSample.slice(0, 25).join(", ")}{report.wouldCreateSample.length > 25 ? "…" : ""}</p>}
          {report.errors.length > 0 && <p className="mt-1 text-red-600">{report.errors.length} error(s): {report.errors.slice(0, 3).join("; ")}</p>}
        </div>
      )}
      <p className="text-[0.7rem] text-ink-muted/70">Preview first — it lists who would be created. Sync links + pushes app contacts; it only creates new HubSpot contacts when the checkbox is on. (Does not bulk-import HubSpot&rsquo;s full contact list — enrichment pulls relevant people per company.)</p>
    </div>
  );
}
