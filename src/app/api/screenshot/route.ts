import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAdmin } from "@/lib/api";
import { captureAndStore } from "@/lib/screenshot";

// Microlink capture + Storage upload can take a few seconds — give it headroom on Vercel.
export const maxDuration = 30;

// POST /api/screenshot { deckId } — (re)capture a deck's thumbnail (admin only)
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => null);
  const deckId = typeof body?.deckId === "string" ? body.deckId : null;
  if (!deckId) return NextResponse.json({ error: "deckId is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: deck } = await admin
    .from("decks")
    .select("id, slug, base_url")
    .eq("id", deckId)
    .single();
  if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });

  const thumbnail_url = await captureAndStore(deck.slug, deck.base_url);
  if (!thumbnail_url) return NextResponse.json({ error: "Capture failed" }, { status: 502 });

  await admin.from("decks").update({ thumbnail_url }).eq("id", deckId);
  return NextResponse.json({ thumbnail_url });
}
