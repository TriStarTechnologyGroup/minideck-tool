import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import CampaignDashboard, { type AccountRow } from "./campaign-dashboard";
import AddAccount from "./add-account";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, status, sender_label, deck:decks(id, name, base_url)")
    .eq("id", id)
    .single();
  if (!campaign) notFound();
  const deck = campaign.deck as unknown as { id: string; name: string; base_url: string } | null;

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, warmth, started_at, status, link_id")
    .eq("campaign_id", id)
    .order("created_at", { ascending: true });
  const acctIds = (accounts ?? []).map((a: { id: string }) => a.id);

  const [{ data: links }, { data: acs }, { data: touches }] = await Promise.all([
    supabase.from("links").select("token, full_url, account_id").in("account_id", acctIds.length ? acctIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("account_contacts").select("account_id, role, is_primary, contact:contacts(first_name, last_name, email)").in("account_id", acctIds.length ? acctIds : ["x"]),
    supabase.from("touches").select("account_id, seq, day_offset, status, sent_at").in("account_id", acctIds.length ? acctIds : ["x"]),
  ]);

  const linkByAcct = new Map<string, { token: string; full_url: string }>();
  (links ?? []).forEach((l: { token: string; full_url: string; account_id: string | null }) => { if (l.account_id) linkByAcct.set(l.account_id, { token: l.token, full_url: l.full_url }); });
  const primaryByAcct = new Map<string, { name: string; email: string }>();
  const acsRows = (acs ?? []) as unknown as { account_id: string; is_primary: boolean; contact: { first_name: string; last_name: string; email: string } | null }[];
  acsRows.forEach((r) => {
    if (r.is_primary && r.contact) primaryByAcct.set(r.account_id, { name: `${r.contact.first_name} ${r.contact.last_name}`.trim(), email: r.contact.email });
  });
  const touchesByAcct = new Map<string, AccountRow["touches"]>();
  (touches ?? []).forEach((t: { account_id: string; seq: number; day_offset: number; status: string; sent_at: string | null }) => {
    const arr = touchesByAcct.get(t.account_id) ?? [];
    arr.push({ seq: t.seq, day_offset: t.day_offset, status: t.status, sent_at: t.sent_at });
    touchesByAcct.set(t.account_id, arr);
  });

  const rows: AccountRow[] = (accounts ?? []).map((a: { id: string; name: string; warmth: string; started_at: string | null; status: string }) => {
    const link = linkByAcct.get(a.id);
    const primary = primaryByAcct.get(a.id);
    return {
      id: a.id, name: a.name, warmth: a.warmth as AccountRow["warmth"], started_at: a.started_at, status: a.status,
      token: link?.token ?? null, full_url: link?.full_url ?? null,
      primaryName: primary?.name ?? null, primaryEmail: primary?.email ?? null,
      touches: touchesByAcct.get(a.id) ?? [],
    };
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/campaigns" className="text-sm text-link hover:underline">← Campaigns</Link>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl">{campaign.name}</h1>
            <p className="text-sm text-ink-muted">
              {deck?.name} · {rows.length} account{rows.length === 1 ? "" : "s"}
              {campaign.sender_label ? ` · sender ${campaign.sender_label}` : ""}
            </p>
          </div>
        </div>
      </div>

      {deck && <AddAccount campaignId={campaign.id} />}

      <CampaignDashboard campaignId={campaign.id} rows={rows} />
    </main>
  );
}
