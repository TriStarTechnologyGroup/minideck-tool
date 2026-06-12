"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type ContactRow = {
  id: string; full_name: string | null; first_name: string | null; last_name: string | null; email: string | null;
  position: string | null; function: string | null; seniority: string | null; is_decision_maker: boolean | null;
  do_not_contact: boolean | null; source: string | null; company_id: string | null; company: string | null;
  company_name: string | null; company_verified: boolean;
};

const fcls = "rounded-sm border border-line-strong bg-surface px-2 py-1 text-xs text-ink";
const SOURCE_LABEL: Record<string, string> = { lead: "Lead", inbound: "Inbound", hubspot: "HubSpot", clay: "Clay", manual: "Manual" };

export default function ContactsTable({ rows }: { rows: ContactRow[] }) {
  const [q, setQ] = useState("");
  const [fn, setFn] = useState("all");
  const [dm, setDm] = useState(false);
  const [verifiedCo, setVerifiedCo] = useState(false);
  const [hideDnc, setHideDnc] = useState(true);

  const functions = useMemo(() => [...new Set(rows.map((r) => r.function).filter(Boolean) as string[])].sort(), [rows]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return rows.filter((c) => {
      if (hideDnc && c.do_not_contact) return false;
      if (dm && !c.is_decision_maker) return false;
      if (verifiedCo && !c.company_verified) return false;
      if (fn !== "all" && c.function !== fn) return false;
      if (!n) return true;
      return [c.full_name, c.email, c.position, c.company_name].some((v) => (v ?? "").toLowerCase().includes(n));
    });
  }, [rows, q, fn, dm, verifiedCo, hideDnc]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className={fcls} value={fn} onChange={(e) => setFn(e.target.value)} aria-label="Function">
          <option value="all">All functions</option>
          {functions.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <button type="button" onClick={() => setDm((v) => !v)} className={`chip ${dm ? "bg-primary text-white" : "bg-surface-muted text-ink-muted/70"}`}>Decision-makers</button>
        <button type="button" onClick={() => setVerifiedCo((v) => !v)} className={`chip ${verifiedCo ? "bg-emerald-600 text-white" : "bg-surface-muted text-ink-muted/70"}`}>✓ Verified company</button>
        <label className="flex items-center gap-1.5 text-xs text-ink-muted"><input type="checkbox" checked={hideDnc} onChange={(e) => setHideDnc(e.target.checked)} className="accent-[var(--color-primary)]" /> hide do-not-contact</label>
        <input className={`${fcls} min-w-[14rem] flex-1`} placeholder="Search name, email, title, company…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search contacts" />
      </div>

      <div className="card overflow-x-auto">
        <div className="border-b border-line px-4 py-2 text-xs text-ink-muted">{filtered.length.toLocaleString()} of {rows.length.toLocaleString()} contacts</div>
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-ink-muted">
            <tr className="border-b border-line">
              <th className="px-3 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Title</th>
              <th className="px-3 py-2.5 font-medium">Company</th>
              <th className="px-3 py-2.5 font-medium">Function</th>
              <th className="px-3 py-2.5 font-medium">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-ink-muted">No contacts match.</td></tr>
            ) : filtered.map((c) => (
              <tr key={c.id} className="align-middle transition-colors hover:bg-surface-subtle">
                <td className="px-3 py-2.5">
                  <Link href={`/contacts/${c.id}`} className="font-medium text-ink hover:text-link">{c.full_name || c.email || "—"}</Link>
                  <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                    {c.email}
                    {c.is_decision_maker && <span className="chip bg-primary text-white text-[0.55rem]">DM</span>}
                    {c.do_not_contact && <span className="chip bg-red-100 text-red-700 text-[0.55rem]">DNC</span>}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-ink-muted">{c.position ?? "—"}</td>
                <td className="px-3 py-2.5">
                  {c.company_id
                    ? <Link href={`/prospecting/${c.company_id}`} className="text-link hover:underline">{c.company_name}</Link>
                    : <span className="text-ink-muted">{c.company_name ?? "—"}</span>}
                  {c.company_verified && <span className="ml-1 text-[0.6rem] text-emerald-600" title="Verified company">✓</span>}
                </td>
                <td className="px-3 py-2.5 text-ink-muted">{c.function ?? "—"}</td>
                <td className="px-3 py-2.5 text-ink-muted">{SOURCE_LABEL[c.source ?? ""] ?? c.source ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
