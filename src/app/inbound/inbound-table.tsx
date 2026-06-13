"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import InquiryDrawer from "./inquiry-drawer";

export type Product = { sku: string | null; name: string | null; quantity: number | null };
export type Inquiry = {
  id: string; source: "rfq" | "contact_form"; company_name: string | null; contact_name: string | null; contact_email: string | null;
  subject: string | null; message: string | null; classification: string; prospect_eligible: boolean; status: string;
  requested_products: Product[] | null; amount: number | null; received_at: string | null; opportunity_id: string | null;
};

const CLASS_LABEL: Record<string, string> = { industry: "Industry", academia: "Academia", non_profit: "Non-profit", government: "Government", other: "Other", unknown: "Unclassified" };
const STATUS_LABEL: Record<string, string> = { new: "New", classified: "Classified", replied: "Replied", quoted: "Quoted", prospected: "Prospected", closed_won: "Won", closed_lost: "Lost", ignored: "Ignored" };
function classChip(c: string): string {
  if (c === "industry") return "bg-primary text-white";
  if (c === "academia") return "bg-surface-blue-soft text-link";
  if (c === "unknown") return "bg-surface-muted text-amber-600";
  return "bg-surface-muted text-nav";
}
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—");

const fcls = "rounded-sm border border-line-strong bg-surface px-2 py-1 text-xs text-ink";
const EMPTY = { source: "all", classification: "all", status: "all", eligible: "all", opp: "all", q: "" };

export default function InboundTable({ rows }: { rows: Inquiry[] }) {
  const [f, setF] = useState(EMPTY);
  const set = (k: keyof typeof EMPTY, v: string) => setF((s) => ({ ...s, [k]: v }));
  const [data, setData] = useState(rows);
  const [openId, setOpenId] = useState<string | null>(null);
  const onStatus = (id: string, status: string) => setData((d) => d.map((r) => (r.id === id ? { ...r, status } : r)));
  const open = data.find((r) => r.id === openId) ?? null;

  const classes = useMemo(() => [...new Set(data.map((r) => r.classification))].sort(), [data]);
  const statuses = useMemo(() => [...new Set(data.map((r) => r.status))].sort(), [data]);

  const filtered = useMemo(() => {
    const needle = f.q.trim().toLowerCase();
    return data.filter((r) => {
      if (f.source !== "all" && r.source !== f.source) return false;
      if (f.classification !== "all" && r.classification !== f.classification) return false;
      if (f.status !== "all" && r.status !== f.status) return false;
      if (f.eligible !== "all" && r.prospect_eligible !== (f.eligible === "yes")) return false;
      if (f.opp === "linked" && !r.opportunity_id) return false;
      if (f.opp === "none" && r.opportunity_id) return false;
      if (!needle) return true;
      return [r.company_name, r.contact_name, r.contact_email, r.subject, r.message].some((v) => (v ?? "").toLowerCase().includes(needle));
    });
  }, [data, f]);

  const active = JSON.stringify(f) !== JSON.stringify(EMPTY);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className={fcls} value={f.source} onChange={(e) => set("source", e.target.value)} aria-label="Source">
          <option value="all">All sources</option><option value="rfq">RFQ</option><option value="contact_form">Contact form</option>
        </select>
        <select className={fcls} value={f.classification} onChange={(e) => set("classification", e.target.value)} aria-label="Classification">
          <option value="all">All types</option>
          {classes.map((c) => <option key={c} value={c}>{CLASS_LABEL[c] ?? c}</option>)}
        </select>
        <select className={fcls} value={f.status} onChange={(e) => set("status", e.target.value)} aria-label="Status">
          <option value="all">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
        </select>
        <select className={fcls} value={f.eligible} onChange={(e) => set("eligible", e.target.value)} aria-label="Prospect eligible">
          <option value="all">Any eligibility</option><option value="yes">Prospect-eligible</option><option value="no">Not eligible</option>
        </select>
        <select className={fcls} value={f.opp} onChange={(e) => set("opp", e.target.value)} aria-label="Opportunity">
          <option value="all">Any opportunity</option><option value="linked">Has opportunity</option><option value="none">No opportunity</option>
        </select>
        <input className={`${fcls} min-w-[12rem] flex-1`} placeholder="Search company, contact, subject, message…" value={f.q} onChange={(e) => set("q", e.target.value)} aria-label="Search inquiries" />
      </div>

      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2 text-xs text-ink-muted">
          <span>{filtered.length} of {data.length} inquiries · click a row to reply</span>
          {active && <button type="button" className="text-link hover:underline" onClick={() => setF(EMPTY)}>Clear filters</button>}
        </div>
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Received</th>
              <th className="px-4 py-2.5 font-medium">Source</th>
              <th className="px-4 py-2.5 font-medium">Company</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Request</th>
              <th className="px-4 py-2.5 font-medium">Opportunity</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-muted">No inquiries match these filters.</td></tr>
            ) : filtered.map((r) => {
              const products = r.requested_products ?? [];
              return (
                <tr key={r.id} className="cursor-pointer align-top transition-colors hover:bg-surface-subtle" onClick={() => setOpenId(r.id)}>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{fmtDate(r.received_at)}</td>
                  <td className="px-4 py-3"><span className={`chip ${r.source === "rfq" ? "bg-surface-blue-soft text-link" : "bg-surface-muted text-nav"}`}>{r.source === "rfq" ? "RFQ" : "Form"}</span></td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{r.company_name ?? "—"}</div>
                    <div className="text-xs text-ink-muted">{r.contact_name}{r.contact_email ? ` · ${r.contact_email}` : ""}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`chip ${classChip(r.classification)}`}>{CLASS_LABEL[r.classification] ?? r.classification}</span>
                    {r.prospect_eligible && <div className="mt-1 text-[0.6rem] uppercase tracking-wide text-primary">eligible</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-ink">{r.subject ?? "—"}</div>
                    {products.length > 0 && <div className="text-xs text-ink-muted">{products.length} item{products.length === 1 ? "" : "s"}{products[0]?.sku ? ` · ${products.slice(0, 3).map((p) => p.sku).filter(Boolean).join(", ")}${products.length > 3 ? "…" : ""}` : ""}{r.amount != null ? ` · $${r.amount.toLocaleString()}` : ""}</div>}
                    {!products.length && r.message && <div className="line-clamp-2 max-w-md text-xs text-ink-muted">{r.message}</div>}
                  </td>
                  <td className="px-4 py-3">{r.opportunity_id ? <Link href={`/prospecting/opportunity/${r.opportunity_id}`} className="text-xs font-medium text-link hover:underline" onClick={(e) => e.stopPropagation()}>View ↗</Link> : <span className="text-xs text-ink-muted/60">—</span>}</td>
                  <td className="px-4 py-3"><span className="chip bg-surface-muted text-nav capitalize">{STATUS_LABEL[r.status] ?? r.status.replace("_", " ")}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && <InquiryDrawer inquiry={open} onClose={() => setOpenId(null)} onStatus={onStatus} />}
    </div>
  );
}
