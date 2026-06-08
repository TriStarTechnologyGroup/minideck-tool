import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import CampaignForm from "./campaign-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns — Minideck" };

type Campaign = { id: string; name: string; status: string; created_at: string; deck: { name: string } | null };

export default async function CampaignsPage() {
  await requireUser();
  const supabase = await createClient();

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, status, created_at, deck:decks(name)")
    .order("created_at", { ascending: false });
  const { data: decks } = await supabase.from("decks").select("id, name").eq("archived", false).order("name");

  // account counts per campaign
  const { data: accts } = await supabase.from("accounts").select("campaign_id");
  const counts = new Map<string, number>();
  (accts ?? []).forEach((a: { campaign_id: string }) => counts.set(a.campaign_id, (counts.get(a.campaign_id) ?? 0) + 1));

  const rows = (campaigns ?? []) as unknown as Campaign[];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Account-based marketing</p>
          <h1 className="mt-1 text-3xl">Campaigns</h1>
        </div>
        <CampaignForm decks={(decks ?? []) as { id: string; name: string }[]} />
      </header>

      {rows.length === 0 ? (
        <div className="card px-6 py-14 text-center text-sm text-ink-muted">
          No campaigns yet. Create one to run an account-based push with a tracked deck link per account.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Campaign</th>
                <th className="px-4 py-2.5 font-medium">Deck</th>
                <th className="px-4 py-2.5 font-medium">Accounts</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-surface-subtle">
                  <td className="px-4 py-2.5">
                    <Link href={`/campaigns/${c.id}`} className="font-medium text-ink hover:text-link">{c.name} →</Link>
                  </td>
                  <td className="px-4 py-2.5 text-ink-muted">{c.deck?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink">{counts.get(c.id) ?? 0}</td>
                  <td className="px-4 py-2.5">
                    <span className={`chip ${c.status === "active" ? "bg-surface-blue-soft text-link" : "bg-surface-muted text-ink-muted"}`}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
