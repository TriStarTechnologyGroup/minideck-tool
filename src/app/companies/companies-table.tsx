"use client";

import Link from "next/link";
import { useState, useMemo, useCallback } from "react";
import { COMPANY_TYPES, DEFAULT_TYPE_FILTER, TYPE_CHIP, type CompanyType } from "@/lib/company-types";

export type CompanyRow = {
  id: string;
  name: string;
  type: CompanyType;
  domain: string | null;
  industry: string | null;
  owner: string | null;
  relevant: boolean | null;
  hubspot_id: string | null;
  country: string | null;
  opportunities: number;
  inquiries: number;
};

const fcls = "rounded-sm border border-line-strong bg-surface px-2 py-1 text-xs text-ink";

export default function CompaniesTable({ rows }: { rows: CompanyRow[] }) {
  const [data, setData] = useState(rows);
  const [q, setQ] = useState("");
  const [types, setTypes] = useState<Set<CompanyType>>(new Set(DEFAULT_TYPE_FILTER));
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const toggleType = (t: CompanyType) => setTypes((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  const counts = useMemo(() => {
    const m = new Map<CompanyType, number>();
    for (const r of data) m.set(r.type, (m.get(r.type) ?? 0) + 1);
    return m;
  }, [data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.filter((c) => {
      if (types.size > 0 && !types.has(c.type)) return false;
      if (!needle) return true;
      return [c.name, c.domain, c.industry, c.owner].some((v) => (v ?? "").toLowerCase().includes(needle));
    });
  }, [data, q, types]);

  const setType = useCallback(async (id: string, type: CompanyType) => {
    const prev = data.find((c) => c.id === id)?.type;
    setData((d) => d.map((c) => (c.id === id ? { ...c, type } : c)));
    setSaving((s) => ({ ...s, [id]: true }));
    try {
      const res = await fetch(`/api/companies/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) });
      if (!res.ok) throw new Error(await res.text());
    } catch {
      setData((d) => d.map((c) => (c.id === id && prev ? { ...c, type: prev } : c))); // revert on failure
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  }, [data]);

  return (
    <div className="flex flex-col gap-3">
      {/* Type filter chips + search */}
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
        {types.size > 0 && <button type="button" className="text-xs text-link hover:underline" onClick={() => setTypes(new Set())}>show all</button>}
        {types.size === 0 && <button type="button" className="text-xs text-link hover:underline" onClick={() => setTypes(new Set(DEFAULT_TYPE_FILTER))}>default</button>}
      </div>

      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2 text-xs text-ink-muted">
          <span>{filtered.length.toLocaleString()} of {data.length.toLocaleString()} companies</span>
          <input className={`${fcls} w-56`} placeholder="Search name, domain, owner…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search companies" />
        </div>
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-ink-muted">
            <tr className="border-b border-line">
              <th className="px-3 py-2.5 font-medium">Company</th>
              <th className="px-3 py-2.5 font-medium">Type</th>
              <th className="px-3 py-2.5 font-medium">Industry</th>
              <th className="px-3 py-2.5 font-medium">Owner</th>
              <th className="px-3 py-2.5 text-center font-medium">Opps</th>
              <th className="px-3 py-2.5 text-center font-medium">Inquiries</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-ink-muted">No companies match.</td></tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="align-middle transition-colors hover:bg-surface-subtle">
                  <td className="px-3 py-2.5">
                    <Link href={`/prospecting/${c.id}`} className="font-medium text-ink hover:text-link">{c.name}</Link>
                    {c.domain && <div className="text-xs text-ink-muted">{c.domain}</div>}
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      className={`${fcls} ${saving[c.id] ? "opacity-50" : ""}`}
                      value={c.type}
                      disabled={saving[c.id]}
                      onChange={(e) => setType(c.id, e.target.value as CompanyType)}
                      aria-label={`Type for ${c.name}`}>
                      {COMPANY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2.5 text-ink-muted">{c.industry ?? "—"}</td>
                  <td className="px-3 py-2.5 text-ink-muted">{c.owner ?? "—"}</td>
                  <td className="px-3 py-2.5 text-center text-ink-muted">{c.opportunities || "—"}</td>
                  <td className="px-3 py-2.5 text-center text-ink-muted">{c.inquiries || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
