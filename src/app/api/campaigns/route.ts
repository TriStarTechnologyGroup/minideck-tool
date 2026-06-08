import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { DEFAULT_CADENCE } from "@/lib/cadence";

const createInput = z.object({
  name: z.string().trim().min(1),
  deckId: z.string().min(1),
  sender_label: z.string().trim().optional(),
});

export async function GET() {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  const supabase = await createClient();
  const { data } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(req: NextRequest) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  const parsed = createInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const admin = createAdminClient();
  const { data: deck } = await admin.from("decks").select("id").eq("id", parsed.data.deckId).single();
  if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });

  const { data, error } = await admin
    .from("campaigns")
    .insert({ name: parsed.data.name, deck_id: parsed.data.deckId, sender_label: parsed.data.sender_label ?? null, cadence: DEFAULT_CADENCE, created_by: guard.profile.id })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: "campaign.create", targetType: "campaign", target: data.id });
  return NextResponse.json({ campaign: data }, { status: 201 });
}
