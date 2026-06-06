import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser, requireApiAdmin } from "@/lib/api";
import { deckInput } from "@/lib/decks";
import { captureAndStore } from "@/lib/screenshot";
import { logAudit } from "@/lib/audit";

// GET /api/decks — list decks (any authenticated user)
export async function GET() {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decks")
    .select("*")
    .order("archived", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ decks: data });
}

// POST /api/decks — create deck + capture thumbnail (admin only)
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => null);
  const parsed = deckInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: deck, error } = await admin
    .from("decks")
    .insert({ ...parsed.data, created_by: guard.profile.id })
    .select()
    .single();

  if (error) {
    const msg = error.code === "23505" ? "A deck with that slug already exists" : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Best-effort thumbnail capture; deck is created regardless.
  let captured = false;
  try {
    const thumbnail_url = await captureAndStore(deck.slug, deck.base_url);
    if (thumbnail_url) {
      await admin.from("decks").update({ thumbnail_url }).eq("id", deck.id);
      deck.thumbnail_url = thumbnail_url;
      captured = true;
    }
  } catch {
    // ignore — re-capture available from the edit screen
  }

  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: "deck.create", targetType: "deck", target: deck.slug });
  return NextResponse.json({ deck, screenshot: captured ? "ok" : "failed" }, { status: 201 });
}
