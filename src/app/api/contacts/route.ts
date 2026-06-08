import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";
import { contactLinkInput } from "@/lib/contacts";
import { createOrReuseLink } from "@/lib/create-link";

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

  const result = await createOrReuseLink(
    admin,
    deck,
    { first_name, last_name, position, company, email },
    { id: guard.profile.id, email: guard.profile.email },
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json(
    { link: result.link, reused: result.reused, hubspotWarning: result.hubspotWarning },
    { status: result.reused ? 200 : 201 },
  );
}
