import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import SyncButton from "./sync-button";
import InboundTable, { type Inquiry } from "./inbound-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbound — Minideck" };

export default async function InboundPage() {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("inbound_inquiries")
    .select("id, source, company_name, contact_name, contact_email, subject, message, classification, prospect_eligible, status, requested_products, amount, received_at, opportunity_id")
    .order("received_at", { ascending: false })
    .limit(1000);
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
        <div className="card px-6 py-14 text-center text-sm text-ink-muted">No inquiries synced yet. Click &ldquo;Sync now&rdquo;, or wait for the 15-minute cron.</div>
      ) : (
        <InboundTable rows={rows} />
      )}
      <p className="text-xs text-ink-muted/70">Reply drafting, quote capture, and one-click prospecting land in the next phases. RFQ classification is by HubSpot pipeline; contact-form orgs are classified by Claude.</p>
    </main>
  );
}
