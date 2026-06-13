import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ContactsTable, { type ContactRow } from "./contacts-table";
import ContactSyncActions from "./sync-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contacts — Minideck" };

export default async function ContactsPage() {
  const profile = await requireUser();
  const supabase = await createClient();
  const [{ data: contacts }, { data: companies }] = await Promise.all([
    supabase.from("contacts").select("id, full_name, first_name, last_name, email, position, function, seniority, is_decision_maker, do_not_contact, source, company_id, company").order("full_name").limit(5000),
    supabase.from("companies").select("id, name, verified").limit(5000),
  ]);
  const coById = new Map((companies ?? []).map((c) => [c.id as string, c]));
  const rows = (contacts ?? []).map((c) => {
    const co = c.company_id ? coById.get(c.company_id as string) : null;
    return { ...c, company_name: co?.name ?? c.company ?? null, company_verified: !!co?.verified } as ContactRow;
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <header>
        <p className="eyebrow">Research</p>
        <h1 className="mt-1 text-3xl">Contacts</h1>
        <p className="mt-1 text-sm text-ink-muted">
          People across companies, opportunities, inbound, and campaigns. {rows.length.toLocaleString()} contacts.
          Admins can classify ICP decision-makers from titles, enrich via Clay, and two-way sync to HubSpot.
        </p>
      </header>
      {profile.role === "admin" && <ContactSyncActions />}
      <ContactsTable rows={rows} />
    </main>
  );
}
