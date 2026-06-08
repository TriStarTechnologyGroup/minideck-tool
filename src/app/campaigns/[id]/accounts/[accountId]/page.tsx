import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import CopyButton from "@/components/copy-button";
import AccountEditor, { type TouchData } from "./account-editor";

export const dynamic = "force-dynamic";

export default async function AccountPage({ params }: { params: Promise<{ id: string; accountId: string }> }) {
  await requireUser();
  const { id: campaignId, accountId } = await params;
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("accounts")
    .select("id, name, warmth, research, context, angle, started_at, status, campaign_id")
    .eq("id", accountId)
    .single();
  if (!account || account.campaign_id !== campaignId) notFound();

  const [{ data: link }, { data: acs }, { data: touches }] = await Promise.all([
    supabase.from("links").select("token, full_url").eq("account_id", accountId).maybeSingle(),
    supabase.from("account_contacts").select("role, is_primary, contact:contacts(first_name, last_name, email, position)").eq("account_id", accountId),
    supabase.from("touches").select("id, seq, day_offset, subject, body, status, sent_at").eq("account_id", accountId).order("seq"),
  ]);

  const contacts = (acs ?? []) as unknown as { role: string; is_primary: boolean; contact: { first_name: string; last_name: string; email: string; position: string | null } | null }[];
  const warmthChip: Record<string, string> = { hot: "bg-primary text-white", warm: "bg-surface-blue-soft text-link", light: "bg-surface-muted text-ink-muted" };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link href={`/campaigns/${campaignId}`} className="text-sm text-link hover:underline">← Campaign</Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl">{account.name}</h1>
          <span className={`chip ${warmthChip[account.warmth as string]}`}>{account.warmth}</span>
        </div>
        {link && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <code className="truncate text-xs text-ink-muted">{link.full_url}</code>
            <CopyButton value={link.full_url} />
            <Link href={`/links/${link.token}`} className="text-link hover:underline">View engagement →</Link>
          </div>
        )}
      </div>

      <section>
        <h2 className="mb-2 font-display text-lg font-medium text-ink">Contacts</h2>
        <div className="card divide-y divide-line">
          {contacts.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-muted">No contacts.</p>
          ) : contacts.map((c, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div>
                <span className="font-medium text-ink">{c.contact ? `${c.contact.first_name} ${c.contact.last_name}` : "—"}</span>
                {c.contact?.position && <span className="text-ink-muted"> · {c.contact.position}</span>}
                <div className="text-xs text-ink-muted">{c.contact?.email}</div>
              </div>
              <div className="flex items-center gap-2">
                {c.is_primary && <span className="chip bg-surface-blue-soft text-link">primary</span>}
                <span className="chip bg-surface-muted text-ink-muted">{c.role}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <AccountEditor
        accountId={account.id}
        startedAt={account.started_at}
        research={account.research ?? ""}
        context={account.context ?? ""}
        angle={account.angle ?? ""}
        touches={(touches ?? []) as TouchData[]}
      />
    </main>
  );
}
