import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";
import { contactLinkInput } from "@/lib/contacts";
import { newToken, buildLinkUrl } from "@/lib/token";
import { serverEnv } from "@/lib/env.server";
import { isHubspotConfigured, upsertContact, createLinkNote, buildContactUrl } from "@/lib/hubspot";
import { logAudit } from "@/lib/audit";

// POST /api/contacts
// Upsert a contact by email, reuse-or-create the link for (deck, contact), then
// best-effort sync to HubSpot (contact upsert + a timeline note for newly created links).
export async function POST(req: NextRequest) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => null);
  const parsed = contactLinkInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  const { deckId, first_name, last_name, position, company, email } = parsed.data;
  const admin = createAdminClient();

  const { data: deck } = await admin.from("decks").select("id, name, base_url").eq("id", deckId).single();
  if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });

  // ── Upsert contact by email (DB) ───────────────────────────────────────────
  let contactId: string;
  const { data: existing } = await admin.from("contacts").select("id").eq("email", email).maybeSingle();
  if (existing) {
    await admin.from("contacts").update({ first_name, last_name, position, company }).eq("id", existing.id);
    contactId = existing.id;
  } else {
    const { data: created, error } = await admin
      .from("contacts")
      .insert({ first_name, last_name, position, company, email, created_by: guard.profile.id })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    contactId = created.id;
  }

  // ── Reuse or create the link (DB) ──────────────────────────────────────────
  let link = null;
  let reused = false;
  const { data: existingLink } = await admin
    .from("links")
    .select("*")
    .eq("deck_id", deckId)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (existingLink) {
    link = existingLink;
    reused = true;
  } else {
    for (let attempt = 0; attempt < 5 && !link; attempt++) {
      const token = newToken();
      const full_url = buildLinkUrl(deck.base_url, token);
      const { data, error } = await admin
        .from("links")
        .insert({ token, deck_id: deckId, contact_id: contactId, full_url, created_by: guard.profile.id })
        .select("*")
        .single();
      if (!error) {
        link = data;
        break;
      }
      if (error.code === "23505") {
        if (/token/.test(error.message)) continue; // token clash → retry
        const { data: raced } = await admin
          .from("links")
          .select("*")
          .eq("deck_id", deckId)
          .eq("contact_id", contactId)
          .maybeSingle();
        if (raced) {
          link = raced;
          reused = true;
          break;
        }
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }
  if (!link) return NextResponse.json({ error: "Could not allocate a unique token" }, { status: 500 });

  // ── Best-effort HubSpot sync (never blocks link creation) ──────────────────
  let hubspotWarning: string | null = null;
  if (isHubspotConfigured()) {
    try {
      const hubspotId = await upsertContact({ first_name, last_name, position, company, email });
      const hubspot_url = buildContactUrl(serverEnv.HUBSPOT_PORTAL_ID, hubspotId);
      await admin.from("contacts").update({ hubspot_id: hubspotId, hubspot_url }).eq("id", contactId);

      if (!reused) {
        try {
          await createLinkNote(hubspotId, {
            deckName: deck.name,
            fullUrl: link.full_url,
            date: new Date().toISOString().slice(0, 10),
            userEmail: guard.profile.email,
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
    await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: "link.create", targetType: "link", target: link.token, detail: { email, deckId } });
  }
  return NextResponse.json({ link, reused, hubspotWarning }, { status: reused ? 200 : 201 });
}
