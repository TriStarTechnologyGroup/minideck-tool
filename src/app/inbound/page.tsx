import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import SyncButton from "./sync-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbound — Minideck" };

type Product = { sku: string | null; name: string | null; quantity: number | null };
type Inquiry = {
  id: string; source: "rfq" | "contact_form"; company_name: string | null; contact_name: string | null; contact_email: string | null;
  subject: string | null; message: string | null; classification: string; prospect_eligible: boolean; status: string;
  requested_products: Product[] | null; amount: number | null; received_at: string | null;
};

const CLASS_LABEL: Record<string, string> = { industry: "Industry", academia: "Academia", non_profit: "Non-profit", government: "Government", other: "Other", unknown: "Unclassified" };
function classChip(c: string): string {
  if (c === "industry") return "bg-primary text-white";
  if (c === "academia") return "bg-surface-blue-soft text-link";
  if (c === "unknown") return "bg-surface-muted text-amber-600";
  return "bg-surface-muted text-nav";
}
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");

export default async function InboundPage() {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("inbound_inquiries")
    .select("id, source, company_name, contact_name, contact_email, subject, message, classification, prospect_eligible, status, requested_products, amount, received_at")
    .order("received_at", { ascending: false })
    .limit(500);
  const rows = (data ?? []) as Inquiry[];
  const newCount = rows.filter((r) => r.status === "new" || r.status === "classified").length;
  const eligible = rows.filter((r) => r.prospect_eligible).length;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Inbound</p>
          <h1 className="mt-1 text-3xl">Inquiries</h1>
          <p className="mt-1 text-sm text-ink-muted">RFQ deals + contact-form inquiries from the website. Industry orgs are prospect-eligible; academia/non-profit get a reply &amp; quote only.</p>
        </div>
        <SyncButton />
      </header>

      <div className="flex flex-wrap gap-3 text-sm">
        <span className="chip bg-surface-muted text-nav">{rows.length} total</span>
        <span className="chip bg-surface-blue-soft text-link">{newCount} unworked</span>
        <span className="chip bg-primary text-white">{eligible} prospect-eligible</span>
      </div>

      {rows.length === 0 ? (
        <div className="card px-6 py-14 text-center text-sm text-ink-muted">No inquiries synced yet. Click “Sync now”, or wait for the 15-minute cron.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Received</th>
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-4 py-2.5 font-medium">Company</th>
                <th className="px-4 py-2.5 font-medium">Classification</th>
                <th className="px-4 py-2.5 font-medium">Request</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const products = r.requested_products ?? [];
                return (
                  <tr key={r.id} className="align-top transition-colors hover:bg-surface-subtle">
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{fmtDate(r.received_at)}</td>
                    <td className="px-4 py-3"><span className={`chip ${r.source === "rfq" ? "bg-surface-blue-soft text-link" : "bg-surface-muted text-nav"}`}>{r.source === "rfq" ? "RFQ" : "Form"}</span></td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{r.company_name ?? "—"}</div>
                      <div className="text-xs text-ink-muted">{r.contact_name}{r.contact_email ? ` · ${r.contact_email}` : ""}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`chip ${classChip(r.classification)}`}>{CLASS_LABEL[r.classification] ?? r.classification}</span>
                      {r.prospect_eligible && <div className="mt-1 text-[0.65rem] uppercase tracking-wide text-primary">prospect-eligible</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-ink">{r.subject ?? "—"}</div>
                      {products.length > 0 && <div className="text-xs text-ink-muted">{products.length} item{products.length === 1 ? "" : "s"}{products[0]?.sku ? ` · ${products.slice(0, 3).map((p) => p.sku).filter(Boolean).join(", ")}${products.length > 3 ? "…" : ""}` : ""}{r.amount != null ? ` · $${r.amount.toLocaleString()}` : ""}</div>}
                      {!products.length && r.message && <div className="line-clamp-2 max-w-md text-xs text-ink-muted">{r.message}</div>}
                    </td>
                    <td className="px-4 py-3"><span className="chip bg-surface-muted text-nav capitalize">{r.status.replace("_", " ")}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-muted/70">Reply drafting, quote capture, and one-click prospecting land in the next phases. RFQ classification is by HubSpot pipeline; contact-form orgs are classified by Claude.</p>
    </main>
  );
}
