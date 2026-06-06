import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAdmin } from "@/lib/api";
import { deckPatch } from "@/lib/decks";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/decks/[id] — edit / archive / unarchive (admin only)
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = deckPatch.safeParse(body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Invalid or empty update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("decks")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    const msg = error.code === "23505" ? "A deck with that slug already exists" : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  if (!data) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: "deck.update", targetType: "deck", target: data.slug, detail: parsed.data });
  return NextResponse.json({ deck: data });
}

// DELETE /api/decks/[id] — delete deck (+ cascade links) (admin only)
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;

  const admin = createAdminClient();
  const { error } = await admin.from("decks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: "deck.delete", targetType: "deck", target: id });
  return NextResponse.json({ ok: true });
}
