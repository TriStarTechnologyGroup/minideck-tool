"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast";
import { gmailComposeUrl } from "@/lib/gmail";
import type { Inquiry } from "./inbound-table";

const STATUSES: [string, string][] = [["new", "New"], ["classified", "Classified"], ["replied", "Replied"], ["quoted", "Quoted"], ["prospected", "Prospected"], ["closed_won", "Won"], ["closed_lost", "Lost"], ["ignored", "Ignored"]];
const ic = "rounded-sm border border-line-strong bg-surface px-2 py-1 text-sm text-ink";

export default function InquiryDrawer({ inquiry, onClose, onStatus }: { inquiry: Inquiry; onClose: () => void; onStatus: (id: string, status: string) => void }) {
  const toast = useToast();
  const [status, setLocalStatus] = useState(inquiry.status);
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  async function setStatus(s: string) {
    setLocalStatus(s);
    const res = await fetch(`/api/inbound/${inquiry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }) });
    if (res.ok) { onStatus(inquiry.id, s); toast(`Marked ${STATUSES.find(([v]) => v === s)?.[1] ?? s}`); }
    else { setLocalStatus(inquiry.status); toast("Couldn't update status"); }
  }

  async function draftReply() {
    setBusy("draft");
    try {
      const res = await fetch(`/api/inbound/${inquiry.id}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: extra || undefined }) });
      const j = await res.json();
      if (res.ok) setDraft({ subject: j.subject, body: j.body });
      else toast(j.error ?? "Draft failed");
    } finally { setBusy(null); }
  }

  const products = inquiry.requested_products ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink-deep/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-xl flex-col gap-5 overflow-y-auto bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`chip ${inquiry.source === "rfq" ? "bg-surface-blue-soft text-link" : "bg-surface-muted text-nav"}`}>{inquiry.source === "rfq" ? "RFQ" : "Form"}</span>
              <span className="chip bg-surface-muted text-nav capitalize">{inquiry.classification}</span>
              {inquiry.prospect_eligible && <span className="text-[0.6rem] uppercase tracking-wide text-primary">eligible</span>}
            </div>
            <h2 className="mt-1.5 text-xl text-ink">{inquiry.company_name ?? "—"}</h2>
            <p className="text-sm text-ink-muted">{inquiry.contact_name}{inquiry.contact_email ? ` · ${inquiry.contact_email}` : ""}</p>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">Status</span>
          <select className={ic} value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          {inquiry.opportunity_id && <Link href={`/prospecting/opportunity/${inquiry.opportunity_id}`} className="ml-auto text-xs text-link hover:underline" target="_blank">Opportunity ↗</Link>}
        </div>

        {/* Request */}
        <section className="flex flex-col gap-2">
          <h3 className="text-xs uppercase tracking-wide text-ink-muted">Request</h3>
          {inquiry.subject && <p className="text-sm font-medium text-ink">{inquiry.subject}</p>}
          {inquiry.message && <p className="whitespace-pre-wrap rounded-md bg-surface-subtle p-3 text-sm text-ink">{inquiry.message}</p>}
          {products.length > 0 && (
            <div className="overflow-hidden rounded-md border border-line text-sm">
              <table className="w-full text-left">
                <thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-3 py-1.5 font-medium">SKU</th><th className="px-3 py-1.5 font-medium">Item</th><th className="px-3 py-1.5 font-medium">Qty</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {products.map((p, i) => <tr key={i}><td className="px-3 py-1.5 font-mono text-xs text-nav">{p.sku ?? "—"}</td><td className="px-3 py-1.5 text-ink">{p.name ?? "—"}</td><td className="px-3 py-1.5 text-ink-muted">{p.quantity ?? "—"}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
          {inquiry.amount != null && <p className="text-xs text-ink-muted">Stated amount: ${inquiry.amount.toLocaleString()}</p>}
        </section>

        {/* Reply */}
        <section className="flex flex-col gap-2 border-t border-line pt-4">
          <h3 className="text-xs uppercase tracking-wide text-ink-muted">Reply</h3>
          {!draft ? (
            <div className="flex flex-col gap-2">
              <input className={`${ic} w-full`} placeholder="Optional steer (e.g. 'emphasize FFPE NSCLC cohorts')" value={extra} onChange={(e) => setExtra(e.target.value)} />
              <button className="btn btn-primary btn-xs self-start" disabled={busy === "draft"} onClick={draftReply}>{busy === "draft" ? "Drafting…" : "Draft reply"}</button>
              <p className="text-[0.7rem] text-ink-muted/70">Tone adapts to the org type{inquiry.prospect_eligible ? " (industry — proposes a call)" : " (non-industry — offers a quote, no sales push)"}. Never invents prices.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <input className={`${ic} w-full`} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
              <textarea className={`${ic} w-full font-mono`} rows={11} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
              <div className="flex flex-wrap items-center gap-2">
                {inquiry.contact_email && <a className="btn btn-primary btn-xs" href={gmailComposeUrl([inquiry.contact_email], [], draft.subject, draft.body)} target="_blank" rel="noopener noreferrer" onClick={() => setStatus("replied")}>Open in Gmail → mark replied</a>}
                <button className="btn btn-ghost btn-xs" onClick={() => { navigator.clipboard?.writeText(`${draft.subject}\n\n${draft.body}`); toast("Copied"); }}>Copy</button>
                <button className="btn btn-ghost btn-xs" disabled={busy === "draft"} onClick={draftReply}>Redraft</button>
                <button className="btn btn-secondary btn-xs ml-auto" onClick={() => setStatus("replied")}>Mark replied</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
