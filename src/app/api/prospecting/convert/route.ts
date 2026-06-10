import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";
import { createAccount } from "@/lib/abm";
import { DEFAULT_CADENCE, type CadenceStep } from "@/lib/cadence";

// POST /api/prospecting/convert — turn a prospecting opportunity into an ABM account:
// pick an existing campaign or create a new one (name + deck), then create the account
// (linked to its company profile, with the opportunity context prefilled) + its link.
const contactInput = z.object({
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  position: z.string().trim().nullish().transform((v) => v || null),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["to", "cc"]).default("to"),
  is_primary: z.boolean().default(false),
});

const input = z.object({
  companyId: z.string().min(1),
  campaign: z.union([z.object({ id: z.string().min(1) }), z.object({ name: z.string().trim().min(1), deckId: z.string().min(1) })]),
  warmth: z.enum(["hot", "warm", "light"]).optional(),
  research: z.string().nullish(),
  context: z.string().nullish(),
  angle: z.string().nullish(),
  contacts: z.array(contactInput).min(1).max(20),
});

export async function POST(req: NextRequest) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  const data = parsed.data;

  const admin = createAdminClient();

  const { data: company } = await admin.from("companies").select("id, name").eq("id", data.companyId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // Resolve (or create) the campaign and its deck.
  let campaignId: string;
  let cadence: CadenceStep[] = DEFAULT_CADENCE;
  let deck: { id: string; name: string; base_url: string } | null = null;

  if ("id" in data.campaign) {
    const { data: c } = await admin.from("campaigns").select("id, cadence, deck:decks(id, name, base_url)").eq("id", data.campaign.id).single();
    if (!c) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    campaignId = c.id as string;
    cadence = (c.cadence as CadenceStep[]) ?? DEFAULT_CADENCE;
    deck = c.deck as unknown as { id: string; name: string; base_url: string } | null;
  } else {
    const { data: d } = await admin.from("decks").select("id, name, base_url").eq("id", data.campaign.deckId).single();
    if (!d) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    deck = d as { id: string; name: string; base_url: string };
    const { data: created, error } = await admin
      .from("campaigns")
      .insert({ name: data.campaign.name, deck_id: deck.id, created_by: guard.profile.id })
      .select("id, cadence")
      .single();
    if (error || !created) return NextResponse.json({ error: error?.message ?? "Campaign create failed" }, { status: 400 });
    campaignId = created.id as string;
    cadence = (created.cadence as CadenceStep[]) ?? DEFAULT_CADENCE;
  }
  if (!deck) return NextResponse.json({ error: "Campaign has no deck" }, { status: 400 });

  const contacts = data.contacts;
  if (!contacts.some((c) => c.is_primary)) contacts[0].is_primary = true;

  const res = await createAccount(
    admin,
    {
      campaignId,
      deck,
      name: company.name as string,
      warmth: data.warmth,
      research: data.research ?? null,
      context: data.context ?? null,
      angle: data.angle ?? null,
      companyId: company.id as string,
      contacts: contacts.map((c) => ({ ...c, company: company.name as string })),
      cadence,
    },
    { id: guard.profile.id, email: guard.profile.email },
  );
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });

  return NextResponse.json({ ok: true, campaignId, accountId: res.accountId, token: res.token, fullUrl: res.fullUrl }, { status: 201 });
}
