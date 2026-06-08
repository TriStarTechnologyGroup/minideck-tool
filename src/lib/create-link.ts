import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { newToken, buildLinkUrl } from "@/lib/token";
import { serverEnv } from "@/lib/env.server";
import { isHubspotConfigured, upsertContact, createLinkNote, buildContactUrl } from "@/lib/hubspot";
import { logAudit } from "@/lib/audit";
import type { Link } from "@/lib/contacts";

type Admin = ReturnType<typeof createAdminClient>;
export type DeckRef = { id: string; name: string; base_url: string };
export type ContactFieldsInput = {
  first_name: string;
  last_name: string;
  position: string | null;
  company: string | null;
  email: string;
};
export type Actor = { id: string; email: string };

export type CreateLinkResult =
  | { ok: true; link: Link; reused: boolean; hubspotWarning: string | null }
  | { ok: false; error: string };

/**
 * Upsert a contact by email, reuse-or-create the (deck, contact) link, then
 * best-effort HubSpot sync. Shared by the single POST /api/contacts and the
 * bulk endpoint so both behave identically (same reuse + sync guarantees).
 */
export async function createOrReuseLink(
  admin: Admin,
  deck: DeckRef,
  f: ContactFieldsInput,
  actor: Actor,
): Promise<CreateLinkResult> {
  // ── Upsert contact by email (DB) ──
  let contactId: string;
  const { data: existing } = await admin.from("contacts").select("id").eq("email", f.email).maybeSingle();
  if (existing) {
    await admin.from("contacts").update({ first_name: f.first_name, last_name: f.last_name, position: f.position, company: f.company }).eq("id", existing.id);
    contactId = existing.id;
  } else {
    const { data: created, error } = await admin
      .from("contacts")
      .insert({ first_name: f.first_name, last_name: f.last_name, position: f.position, company: f.company, email: f.email, created_by: actor.id })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    contactId = created.id;
  }

  // ── Reuse or create the link (DB) ──
  let link: Link | null = null;
  let reused = false;
  const { data: existingLink } = await admin
    .from("links")
    .select("*")
    .eq("deck_id", deck.id)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (existingLink) {
    link = existingLink as Link;
    reused = true;
  } else {
    for (let attempt = 0; attempt < 5 && !link; attempt++) {
      const token = newToken();
      const full_url = buildLinkUrl(deck.base_url, token);
      const { data, error } = await admin
        .from("links")
        .insert({ token, deck_id: deck.id, contact_id: contactId, full_url, created_by: actor.id })
        .select("*")
        .single();
      if (!error) {
        link = data as Link;
        break;
      }
      if (error.code === "23505") {
        if (/token/.test(error.message)) continue; // token clash → retry
        const { data: raced } = await admin
          .from("links")
          .select("*")
          .eq("deck_id", deck.id)
          .eq("contact_id", contactId)
          .maybeSingle();
        if (raced) {
          link = raced as Link;
          reused = true;
          break;
        }
      }
      return { ok: false, error: error.message };
    }
  }
  if (!link) return { ok: false, error: "Could not allocate a unique token" };

  // ── Best-effort HubSpot sync (never blocks link creation) ──
  let hubspotWarning: string | null = null;
  if (isHubspotConfigured()) {
    try {
      const hubspotId = await upsertContact({ first_name: f.first_name, last_name: f.last_name, position: f.position, company: f.company, email: f.email });
      const hubspot_url = buildContactUrl(serverEnv.HUBSPOT_PORTAL_ID, hubspotId);
      await admin.from("contacts").update({ hubspot_id: hubspotId, hubspot_url }).eq("id", contactId);
      if (!reused) {
        try {
          await createLinkNote(hubspotId, {
            deckName: deck.name,
            fullUrl: link.full_url,
            date: new Date().toISOString().slice(0, 10),
            userEmail: actor.email,
          });
        } catch {
          hubspotWarning = "Contact synced, but the timeline note failed.";
        }
      }
    } catch {
      hubspotWarning = "HubSpot sync failed — link created. Use Retry sync.";
    }
  }

  if (!reused) {
    await logAudit({ actorId: actor.id, actorEmail: actor.email, action: "link.create", targetType: "link", target: link.token, detail: { email: f.email, deckId: deck.id } });
  }
  return { ok: true, link, reused, hubspotWarning };
}
