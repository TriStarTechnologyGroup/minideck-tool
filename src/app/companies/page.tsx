import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import CompaniesTable, { type CompanyRow } from "./companies-table";
import SyncActions from "./sync-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Companies — Minideck" };

export default async function CompaniesPage() {
  const profile = await requireUser();
  const supabase = await createClient();

  const [{ data: companies }, { data: oppRows }, { data: inqRows }] = await Promise.all([
    supabase.from("companies").select("id, name, type, domain, industry, owner, relevant, hubspot_id, country").order("name").limit(5000),
    supabase.from("opportunities").select("company_id").not("company_id", "is", null).limit(10000),
    supabase.from("inbound_inquiries").select("company_id").not("company_id", "is", null).limit(10000),
  ]);

  const oppCount = new Map<string, number>();
  for (const o of oppRows ?? []) oppCount.set(o.company_id as string, (oppCount.get(o.company_id as string) ?? 0) + 1);
  const inqCount = new Map<string, number>();
  for (const r of inqRows ?? []) inqCount.set(r.company_id as string, (inqCount.get(r.company_id as string) ?? 0) + 1);

  const rows = (companies ?? []).map((c) => ({
    ...c,
    opportunities: oppCount.get(c.id as string) ?? 0,
    inquiries: inqCount.get(c.id as string) ?? 0,
  })) as CompanyRow[];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <header>
        <p className="eyebrow">Accounts</p>
        <h1 className="mt-1 text-3xl">Companies</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Every company in the system, synced from HubSpot. Set each company&rsquo;s type to drive prospecting
          eligibility and reporting. {rows.length.toLocaleString()} companies.
        </p>
      </header>
      {profile.role === "admin" && <SyncActions />}
      <CompaniesTable rows={rows} />
      <p className="text-xs text-ink-muted/70">
        Type is editable inline. Default view shows Pharma &amp; Biotech; toggle the chips to see other segments.
        Click a company for its full pipeline + opportunities.
      </p>
    </main>
  );
}
