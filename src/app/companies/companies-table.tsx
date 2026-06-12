"use client";

import Link from "next/link";
import { useState, useMemo, useCallback } from "react";
import { COMPANY_TYPES, DEFAULT_TYPE_FILTER, TYPE_CHIP, type CompanyType } from "@/lib/company-types";

export type CompanyRow = {
  id: string;
  name: string;
  type: CompanyType;
  domain: string | null;
  website: string | null;
  industry: string | null;
  owner: string | null;
  relevant: boolean | null;
  verified: boolean | null;
  flagged_for_removal: boolean | null;
  hubspot_id: string | null;
  country: string | null;
  opportunities: number;
  inquiries: number;
};

const fcls = "rounded-sm border border-line-strong bg-surface px-2 py-1 text-xs text-ink";
const siteUrl = (c: CompanyRow) => { const raw = (c.website || c.domain || "").trim(); if (!raw) return null; return raw.startsWith("http") ? raw : `https://${raw.replace(/^\/+/, "")}`; };

export default function CompaniesTable({ rows }: { rows: CompanyRow[] }) {
  const [data, setData] = useState(rows);
  const [q, setQ] = useState("");
  const [types, setTypes] = useState<Set<CompanyType>>(new Set(DEFAULT_TYPE_FILTER));
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const toggleType = (t: CompanyType) => setTypes((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  const counts = useMemo(() => {
    const m = new Map<CompanyType, number>();
    for (const r of data) m.set(r.type, (m.get(r.type) ?? 0) + 1);
    return m;
  }, [data]);
  const verifiedCount = useMemo(() => data.filter((c) => c.verified).length, [data]);
  const flaggedCount = useMemo(() => data.filter((c) => c.flagged_for_removal).length, [data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.filter((c) => {
      if (verifiedOnly && !c.verified) return false;
      if (flaggedOnly && !c.flagged_for_removal) return false;
      if (types.size > 0 && !types.has(c.type)) return false;
      if (!needle) return true;
      return [c.name, c.domain, c.industry, c.owner].some((v) => (v ?? "").toLowerCase().includes(needle));
    });
  }, [data, q, types, verifiedOnly, flaggedOnly]);

  const patch = useCallback(async (id: string, body: Record<string, unknown>, optimistic: Partial<CompanyRow>) => {
    const prev = data.find((c) => c.id === id);
    setData((d) => d.map((c) => (c.id === id ? { ...c, ...optimistic } : c)));
    setSaving((s) => ({ ...s, [id]: true }));
    try {
      const res = await fetch(`/api/companies/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
    } catch {
      if (prev) setData((d) => d.map((c) => (c.id === id ? prev : c))); // revert on failure
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  }, [data]);

  const toggleVerified = (c: CompanyRow) => patch(c.id, { verified: !c.verified }, { verified: !c.verified });
  const toggleFlag = (c: CompanyRow) => {
    if (c.flagged_for_removal) return patch(c.id, { flagged_for_removal: false }, { flagged_for_removal: false });
    const reason = window.prompt(`Flag “${c.name}” for removal — optional reason:`, "") ?? "";
    return patch(c.id, { flagged_for_removal: true, flag_reason: reason || null }, { flagged_for_removal: true });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Type filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {COMPANY_TYPES.map((t) => {
          const on = types.has(t);
          return (
            <button key={t} type="button" onClick={() => toggleType(t)}
              className={`chip transition-opacity ${on ? TYPE_CHIP[t] : "bg-surface-muted text-ink-muted/60"} ${on ? "" : "opacity-60 hover:opacity-100"}`}>
              {t} <span className="ml-1 opacity-70">{counts.get(t) ?? 0}</span>
            </button>
          );
        })}
        {types.size > 0 ? <button type="button" className="text-xs text-link hover:underline" onClick={() => setTypes(new Set())}>show all</button>
                        : <button type="button" className="text-xs text-link hover:underline" onClick={() => setTypes(new Set(DEFAULT_TYPE_FILTER))}>default</button>}
        <span className="mx-1 h-4 w-px bg-line" />
        <button type="button" onClick={() => setVerifiedOnly((v) => !v)}
          className={`chip ${verifiedOnly ? "bg-emerald-600 text-white" : "bg-surface-muted text-ink-muted/70"}`}>✓ Verified <span className="ml-1 opacity-70">{verifiedCount}</span></button>
        <button type="button" onClick={() => setFlaggedOnly((v) => !v)}
          className={`chip ${flaggedOnly ? "bg-red-600 text-white" : "bg-surface-muted text-ink-muted/70"}`}>⚑ Flagged <span className="ml-1 opacity-70">{flaggedCount}</span></button>
      </div>

      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2 text-xs text-ink-muted">
          <span>{filtered.length.toLocaleString()} of {data.length.toLocaleString()} companies</span>
          <input className={`${fcls} w-56`} placeholder="Search name, domain, owner…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search companies" />
        </div>
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-ink-muted">
            <tr className="border-b border-line">
              <th className="px-3 py-2.5 text-center font-medium" title="Verified">✓</th>
              <th className="px-3 py-2.5 font-medium">Company</th>
              <th className="px-3 py-2.5 font-medium">Type</th>
              <th className="px-3 py-2.5 font-medium">Industry</th>
              <th className="px-3 py-2.5 font-medium">Owner</th>
              <th className="px-3 py-2.5 text-center font-medium">Opps</th>
              <th className="px-3 py-2.5 text-center font-medium">Inq</th>
              <th className="px-3 py-2.5 text-center font-medium">⚑</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-ink-muted">No companies match.</td></tr>
            ) : (
              filtered.map((c) => {
                const url = siteUrl(c);
                return (
                  <tr key={c.id} className={`align-middle transition-colors hover:bg-surface-subtle ${c.flagged_for_removal ? "bg-red-50/50" : ""}`}>
                    <td className="px-3 py-2.5 text-center">
                      <button type="button" onClick={() => toggleVerified(c)} disabled={saving[c.id]}
                        title={c.verified ? "Verified — click to unverify" : "Mark verified"}
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${c.verified ? "bg-emerald-600 text-white" : "border border-line-strong text-ink-muted/40 hover:text-ink"}`}>✓</button>
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/prospecting/${c.id}`} className="font-medium text-ink hover:text-link">{c.name}</Link>
                      {url
                        ? <a href={url} target="_blank" rel="noreferrer" className="block text-xs text-link hover:underline">{c.domain ?? url.replace(/^https?:\/\//, "")} ↗</a>
                        : c.domain && <div className="text-xs text-ink-muted">{c.domain}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <select className={`${fcls} ${saving[c.id] ? "opacity-50" : ""}`} value={c.type} disabled={saving[c.id]}
                        onChange={(e) => patch(c.id, { type: e.target.value as CompanyType }, { type: e.target.value as CompanyType })} aria-label={`Type for ${c.name}`}>
                        {COMPANY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-ink-muted">{c.industry ?? "—"}</td>
                    <td className="px-3 py-2.5 text-ink-muted">{c.owner ?? "—"}</td>
                    <td className="px-3 py-2.5 text-center text-ink-muted">{c.opportunities || "—"}</td>
                    <td className="px-3 py-2.5 text-center text-ink-muted">{c.inquiries || "—"}</td>
                    <td className="px-3 py-2.5 text-center">
                      <button type="button" onClick={() => toggleFlag(c)} disabled={saving[c.id]}
                        title={c.flagged_for_removal ? "Flagged for removal — click to clear" : "Flag for removal"}
                        className={`text-sm ${c.flagged_for_removal ? "text-red-600" : "text-ink-muted/30 hover:text-red-500"}`}>⚑</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
