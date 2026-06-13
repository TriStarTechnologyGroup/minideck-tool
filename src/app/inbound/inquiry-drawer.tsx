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

  // ── Quote ──────────────────────────────────────────────────────────────────────────────────
  type QLine = { sku: string | null; name: string | null; ta_number: string | null; quantity: number | null; unit_price: number | null; note: string | null };
  const [quote, setQuote] = useState<{ currency: string; line_items: QLine[]; notes: string | null; status: string } | null>(null);
  const [qBusy, setQBusy] = useState(false);
  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/inbound/${inquiry.id}/quote`);
      if (r.ok) { const j = await r.json(); if (j.quote) setQuote({ currency: j.quote.currency, line_items: j.quote.line_items ?? [], notes: j.quote.notes, status: j.quote.status }); }
    })();
  }, [inquiry.id]);

  async function quoteAction(body: Record<string, unknown>): Promise<boolean> {
    setQBusy(true);
    try {
      const r = await fetch(`/api/inbound/${inquiry.id}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (r.ok) { setQuote({ currency: j.quote.currency, line_items: j.quote.line_items ?? [], notes: j.quote.notes, status: j.quote.status }); return true; }
      toast(j.error ?? "Quote failed"); return false;
    } finally { setQBusy(false); }
  }
  const genQuote = () => quoteAction({ action: "generate" });
  const saveQuote = async () => { if (quote && await quoteAction({ action: "save", line_items: quote.line_items, notes: quote.notes, currency: quote.currency })) toast("Quote saved"); };
  const setLine = (i: number, patch: Partial<QLine>) => setQuote((q) => (q ? { ...q, line_items: q.line_items.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) } : q));
  const removeLine = (i: number) => setQuote((q) => (q ? { ...q, line_items: q.line_items.filter((_, idx) => idx !== i) } : q));
  const addLine = () => setQuote((q) => (q ? { ...q, line_items: [...q.line_items, { sku: null, name: "", ta_number: null, quantity: 1, unit_price: null, note: null }] } : q));
  const subtotal = (quote?.line_items ?? []).reduce((s, l) => s + (l.quantity ?? 0) * (l.unit_price ?? 0), 0);
  const money = (n: number) => `${quote?.currency ?? "USD"} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  function quoteText(): string {
    const lines = (quote?.line_items ?? []).map((l) => `• ${l.name ?? l.sku ?? "Item"}${l.ta_number ? ` (${l.ta_number})` : ""} ×${l.quantity ?? 1}${l.unit_price != null ? ` — ${money((l.quantity ?? 1) * l.unit_price)}` : ""}`);
    return `Quote\n${lines.join("\n")}${subtotal ? `\n\nEstimated subtotal: ${money(subtotal)}` : ""}${quote?.notes ? `\n\n${quote.notes}` : ""}`;
  }
  const insertQuoteIntoReply = () => { if (!draft) { toast("Draft a reply first"); return; } setDraft({ ...draft, body: `${draft.body}\n\n${quoteText()}` }); toast("Quote added to reply"); };

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

        {/* Quote */}
        <section className="flex flex-col gap-2 border-t border-line pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-wide text-ink-muted">Quote</h3>
            {quote && <button className="text-xs text-link hover:underline" disabled={qBusy} onClick={genQuote}>Regenerate from request</button>}
          </div>
          {!quote ? (
            <button className="btn btn-secondary btn-xs self-start" disabled={qBusy} onClick={genQuote}>{qBusy ? "Building…" : "Build quote"}</button>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="overflow-x-auto rounded-md border border-line">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-2 py-1.5 font-medium">Item</th><th className="px-2 py-1.5 font-medium">Qty</th><th className="px-2 py-1.5 font-medium">Unit</th><th className="px-2 py-1.5 font-medium">Total</th><th className="px-2 py-1.5"></th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {quote.line_items.length === 0 ? (
                      <tr><td colSpan={5} className="px-2 py-3 text-center text-xs text-ink-muted">No line items — add one below.</td></tr>
                    ) : quote.line_items.map((l, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5"><input className={`${ic} w-full`} value={l.name ?? ""} onChange={(e) => setLine(i, { name: e.target.value })} placeholder="Item" />{(l.sku || l.ta_number) && <div className="mt-0.5 font-mono text-[0.6rem] text-nav">{[l.sku, l.ta_number].filter(Boolean).join(" · ")}</div>}</td>
                        <td className="px-2 py-1.5"><input type="number" min="0" className={`${ic} w-16`} value={l.quantity ?? ""} onChange={(e) => setLine(i, { quantity: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                        <td className="px-2 py-1.5"><input type="number" min="0" step="0.01" className={`${ic} w-24`} value={l.unit_price ?? ""} onChange={(e) => setLine(i, { unit_price: e.target.value === "" ? null : Number(e.target.value) })} placeholder="—" /></td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-ink-muted">{l.unit_price != null ? money((l.quantity ?? 1) * l.unit_price) : "—"}</td>
                        <td className="px-2 py-1.5 text-right"><button className="text-xs text-red-500 hover:underline" onClick={() => removeLine(i)}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between">
                <button className="text-xs text-link hover:underline" onClick={addLine}>+ Add line</button>
                <span className="text-sm text-ink">Subtotal: <b>{money(subtotal)}</b></span>
              </div>
              <textarea className={`${ic} w-full`} rows={2} value={quote.notes ?? ""} onChange={(e) => setQuote((q) => (q ? { ...q, notes: e.target.value } : q))} placeholder="Quote notes (terms, lead time, caveats)…" />
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn btn-primary btn-xs" disabled={qBusy} onClick={saveQuote}>{qBusy ? "Saving…" : "Save quote"}</button>
                <button className="btn btn-ghost btn-xs" onClick={insertQuoteIntoReply}>Insert into reply</button>
                <button className="btn btn-ghost btn-xs" onClick={() => { navigator.clipboard?.writeText(quoteText()); toast("Quote copied"); }}>Copy</button>
                <button className="btn btn-secondary btn-xs ml-auto" onClick={() => setStatus("quoted")}>Mark quoted</button>
              </div>
            </div>
          )}
          <p className="text-[0.7rem] text-ink-muted/70">Prices pre-fill from the HubSpot deal when available — there&rsquo;s no standing price list, so edit as needed. Totals are indicative.</p>
        </section>
      </div>
    </div>
  );
}
