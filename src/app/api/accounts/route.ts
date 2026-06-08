import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";
import { createAccount } from "@/lib/abm";
import { DEFAULT_CADENCE, type CadenceStep } from "@/lib/cadence";

const contactInput = z.object({
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  position: z.string().trim().nullish().transform((v) => v || null),
  company: z.string().trim().nullish().transform((v) => v || null),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["to", "cc"]).default("to"),
  is_primary: z.boolean().default(false),
});

const createInput = z.object({
  campaignId: z.string().min(1),
  name: z.string().trim().min(1),
  warmth: z.enum(["hot", "warm", "light"]).optional(),
  research: z.string().nullish(),
  context: z.string().nullish(),
  angle: z.string().nullish(),
  contacts: z.array(contactInput).min(1).max(20),
});

export async function POST(req: NextRequest) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  const parsed = createInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });

  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, cadence, deck:decks(id, name, base_url)")
    .eq("id", parsed.data.campaignId)
    .single();
  const deck = campaign?.deck as unknown as { id: string; name: string; base_url: string } | null;
  if (!campaign || !deck) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  // Ensure exactly one primary.
  const contacts = parsed.data.contacts;
  if (!contacts.some((c) => c.is_primary)) contacts[0].is_primary = true;

  const cadence = (campaign.cadence as CadenceStep[]) ?? DEFAULT_CADENCE;
  const res = await createAccount(
    admin,
    {
      campaignId: campaign.id,
      deck,
      name: parsed.data.name,
      warmth: parsed.data.warmth,
      research: parsed.data.research ?? null,
      context: parsed.data.context ?? null,
      angle: parsed.data.angle ?? null,
      contacts,
      cadence,
    },
    { id: guard.profile.id, email: guard.profile.email },
  );
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json(res, { status: 201 });
}
