"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast";

export type QueueCompany = {
  id: string; name: string; domain: string | null; website: string | null; industry: string | null;
  type: string; country: string | null; employees: number | null; hubspot_id: string | null;
  opportunities: number; inquiries: number;
};

type Outcome = "verified" | "flagged" | "skipped";

export default function VerifyQueue({ companies }: { companies: QueueCompany[] }) {
  const toast = useToast();
  const [i, setI] = useState(0);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [busy, setBusy] = useState(false);

  const total = companies.length;
  const done = Object.keys(outcomes).length;
  const counts = useMemo(() => {
    const c = { verified: 0, flagged: 0, skipped: 0 };
    for (const o of Object.values(outcomes)) c[o]++;
    return c;
  }, [outcomes]);
  const current = i < total ? companies[i] : null;

  const record = useCallback((id: string, o: Outcome) => { setOutcomes((m) => ({ ...m, [id]: o })); setI((x) => x + 1); }, []);

  const patch = useCallback(async (c: QueueCompany, body: Record<string, unknown>, o: Outcome) => {
    record(c.id, o); // optimistic advance
    setBusy(true);
    try {
      const res = await fetch(`/api/companies/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { toast(`Couldn't update ${c.name}`); setOutcomes((m) => { const n = { ...m }; delete n[c.id]; return n; }); }
    } catch { toast(`Couldn't update ${c.name}`); }
    finally { setBusy(false); }
  }, [record, toast]);

  const verify = useCallback((c: QueueCompany | null) => c && patch(c, { verified: true }, "verified"), [patch]);
  const skip = useCallback((c: QueueCompany | null) => c && record(c.id, "skipped"), [record]);
  const back = useCallback(() => setI((x) => Math.max(0, x - 1)), []);
  const flag = useCallback((c: QueueCompany | null) => {
    if (!c) return;
    const reason = window.prompt(`Flag "${c.name}" for removal — optional reason:`, "") ?? "";
    void patch(c, { flagged_for_removal: true, flag_reason: reason || null }, "flagged");
  }, [patch]);

  async function verifyAllRemaining() {
    const ids = companies.slice(i).map((c) => c.id).filter((id) => !outcomes[id]);
    if (!ids.length) return;
    if (!window.confirm(`Verify all ${ids.length} remaining companies?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/companies/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", ids }) });
      const j = await res.json();
      if (res.ok) { setOutcomes((m) => { const n = { ...m }; for (const id of ids) n[id] = "verified"; return n; }); setI(total); toast(`Verified ${j.updated} companies`); }
      else toast(j.error ?? "Bulk verify failed");
    } finally { setBusy(false); }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const c = i < companies.length ? companies[i] : null;
      if (!c) return;
      const k = e.key.toLowerCase();
      if (k === "v" || e.key === "Enter") { e.preventDefault(); verify(c); }
      else if (k === "f") { e.preventDefault(); flag(c); }
      else if (k === "s" || e.key === "ArrowRight") { e.preventDefault(); skip(c); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, companies, verify, flag, skip, back]);

  const reviewedColor = (o?: Outcome) => o === "verified" ? "text-emerald-600" : o === "flagged" ? "text-red-500" : "text-ink-muted";

  return (
    <div className="flex flex-col gap-4">
      {/* Progress */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>{Math.min(done, total)} of {total} reviewed</span>
          <span className="flex gap-3">
            <span className="text-emerald-600">{counts.verified} verified</span>
            <span className="text-red-500">{counts.flagged} flagged</span>
            <span>{counts.skipped} skipped</span>
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${total ? (Math.min(done, total) / total) * 100 : 0}%` }} /></div>
      </div>

      {current ? (
        <div className="card flex flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl text-ink">{current.name}</h2>
                <span className="chip bg-surface-muted text-nav">{current.type}</span>
              </div>
              {current.domain || current.website ? (
                <a href={`https://${(current.domain || current.website || "").replace(/^https?:\/\//, "")}`} target="_blank" rel="noopener noreferrer" className="text-sm text-link hover:underline">{(current.domain || current.website)?.replace(/^https?:\/\//, "")} ↗</a>
              ) : <span className="text-sm text-ink-muted/70">no domain</span>}
            </div>
            <span className="text-xs text-ink-muted">#{i + 1}</span>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {current.industry && <Field label="Industry" value={current.industry} />}
            {current.country && <Field label="Country" value={current.country} />}
            {current.employees != null && <Field label="Employees" value={current.employees.toLocaleString()} />}
            <Field label="Opportunities" value={String(current.opportunities)} />
            <Field label="Inquiries" value={String(current.inquiries)} />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <button className="btn btn-primary btn-xs" disabled={busy} onClick={() => verify(current)}><kbd className="opacity-70">V</kbd> Verify</button>
            <button className="btn btn-danger btn-xs" disabled={busy} onClick={() => flag(current)}><kbd className="opacity-70">F</kbd> Flag</button>
            <button className="btn btn-ghost btn-xs" disabled={busy} onClick={() => skip(current)}><kbd className="opacity-70">S</kbd> Skip</button>
            <span className="mx-1 text-ink-muted/40">·</span>
            <Link href={`/prospecting/${current.id}`} target="_blank" className="text-xs text-link hover:underline">Open full profile ↗</Link>
            {current.hubspot_id && <a href={`https://app.hubspot.com/contacts/0/company/${current.hubspot_id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-link hover:underline">HubSpot ↗</a>}
            <button className="btn btn-ghost btn-xs ml-auto" disabled={i === 0} onClick={back}>← Back</button>
          </div>
        </div>
      ) : (
        <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="text-2xl">✓</div>
          <h2 className="text-xl text-ink">Queue cleared</h2>
          <p className="text-sm text-ink-muted">{counts.verified} verified · {counts.flagged} flagged · {counts.skipped} skipped. Verified companies are now in the scheduled prospecting queue.</p>
          <Link href="/companies" className="btn btn-primary btn-xs">Back to companies</Link>
        </div>
      )}

      {current && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-muted/70">{total - Math.min(done, total)} left</span>
          <button className="btn btn-ghost btn-xs" disabled={busy} onClick={verifyAllRemaining}>Verify all remaining ({companies.slice(i).filter((c) => !outcomes[c.id]).length})</button>
        </div>
      )}

      {/* Recently reviewed (lets you eyeball + jump back) */}
      {done > 0 && (
        <div className="text-xs text-ink-muted/70">
          Recent: {companies.slice(Math.max(0, i - 5), i).map((c) => <span key={c.id} className={`mr-2 ${reviewedColor(outcomes[c.id])}`}>{c.name}</span>)}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[0.7rem] uppercase tracking-wide text-ink-muted">{label}</div><div className="text-ink">{value}</div></div>;
}
