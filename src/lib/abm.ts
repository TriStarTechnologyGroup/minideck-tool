import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createOrReuseLink, type DeckRef, type Actor } from "@/lib/create-link";
import type { CadenceStep } from "@/lib/cadence";

type Admin = ReturnType<typeof createAdminClient>;

export type Warmth = "hot" | "warm" | "light";

export type AccountContactInput = {
  first_name: string;
  last_name: string;
  position: string | null;
  company: string | null;
  email: string;
  role: "to" | "cc";
  is_primary: boolean;
};

export type CreateAccountInput = {
  campaignId: string;
  deck: DeckRef;
  name: string;
  warmth?: Warmth;
  research?: string | null;
  context?: string | null;
  angle?: string | null;
  contacts: AccountContactInput[];
  cadence: CadenceStep[];
};

/** Create an ABM account: account row + shared account link (fresh token via the
 *  standard create path) + contact set + cadence touches. */
export async function createAccount(admin: Admin, input: CreateAccountInput, actor: Actor) {
  const primary = input.contacts.find((c) => c.is_primary) ?? input.contacts[0];
  if (!primary) return { ok: false as const, error: "At least one contact is required" };

  const { data: account, error: aerr } = await admin
    .from("accounts")
    .insert({
      campaign_id: input.campaignId,
      name: input.name,
      warmth: input.warmth ?? "warm",
      research: input.research ?? null,
      context: input.context ?? null,
      angle: input.angle ?? null,
    })
    .select("id")
    .single();
  if (aerr || !account) return { ok: false as const, error: aerr?.message ?? "Account insert failed" };

  // Shared account link (mints token, HubSpot upsert + note for the primary contact).
  const res = await createOrReuseLink(
    admin,
    input.deck,
    { first_name: primary.first_name, last_name: primary.last_name, position: primary.position, company: primary.company, email: primary.email },
    actor,
  );
  if (!res.ok) {
    await admin.from("accounts").delete().eq("id", account.id);
    return { ok: false as const, error: res.error };
  }
  await admin.from("links").update({ account_id: account.id }).eq("id", res.link.id);
  await admin.from("accounts").update({ link_id: res.link.id }).eq("id", account.id);

  // Contacts → account_contacts (primary already upserted by createOrReuseLink).
  for (const c of input.contacts) {
    let contactId: string;
    if (c.email === primary.email) {
      contactId = res.link.contact_id;
    } else {
      const { data: ex } = await admin.from("contacts").select("id").eq("email", c.email).maybeSingle();
      if (ex) {
        await admin.from("contacts").update({ first_name: c.first_name, last_name: c.last_name, position: c.position, company: c.company }).eq("id", ex.id);
        contactId = ex.id;
      } else {
        const { data: ins } = await admin
          .from("contacts")
          .insert({ first_name: c.first_name, last_name: c.last_name, position: c.position, company: c.company, email: c.email, created_by: actor.id })
          .select("id")
          .single();
        if (!ins) continue;
        contactId = ins.id;
      }
    }
    await admin
      .from("account_contacts")
      .upsert({ account_id: account.id, contact_id: contactId, role: c.role, is_primary: c.is_primary }, { onConflict: "account_id,contact_id" });
  }

  // Cadence touches (drafts empty; filled in the account page).
  const rows = input.cadence.map((s) => ({ account_id: account.id, seq: s.seq, day_offset: s.day_offset }));
  if (rows.length) await admin.from("touches").insert(rows);

  return { ok: true as const, accountId: account.id, linkId: res.link.id, token: res.link.token, fullUrl: res.link.full_url };
}
