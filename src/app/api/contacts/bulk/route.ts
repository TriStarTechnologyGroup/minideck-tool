import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";
import { bulkLinkInput } from "@/lib/contacts";
import { createOrReuseLink } from "@/lib/create-link";

export const maxDuration = 300; // bulk runs can take a while (sequential HubSpot writes)

// POST /api/contacts/bulk — { deckId, rows: ContactRowInput[] }
// Generates (or reuses) a link per row using the same path as the single create.
// Processed sequentially to stay within HubSpot rate limits. Returns a per-row
// result so the UI can show created/reused/error and offer copy-all + CSV export.
export async function POST(req: NextRequest) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => null);
  const parsed = bulkLinkInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  const { deckId, rows } = parsed.data;
  const admin = createAdminClient();

  const { data: deck } = await admin.from("decks").select("id, name, base_url").eq("id", deckId).single();
  if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });

  // De-dupe rows by email within the batch (last wins) so we don't double-process.
  const byEmail = new Map<string, (typeof rows)[number]>();
  for (const r of rows) byEmail.set(r.email, r);
  const unique = [...byEmail.values()];

  const actor = { id: guard.profile.id, email: guard.profile.email };
  const results: Array<{
    email: string;
    name: string;
    company: string | null;
    status: "created" | "reused" | "error";
    full_url?: string;
    error?: string;
  }> = [];
  let created = 0;
  let reused = 0;
  let failed = 0;

  for (const r of unique) {
    const name = `${r.first_name} ${r.last_name}`.trim();
    const res = await createOrReuseLink(admin, deck, r, actor);
    if (!res.ok) {
      failed++;
      results.push({ email: r.email, name, company: r.company, status: "error", error: res.error });
    } else if (res.reused) {
      reused++;
      results.push({ email: r.email, name, company: r.company, status: "reused", full_url: res.link.full_url });
    } else {
      created++;
      results.push({ email: r.email, name, company: r.company, status: "created", full_url: res.link.full_url });
    }
  }

  return NextResponse.json({ deck: { id: deck.id, name: deck.name }, summary: { created, reused, failed, total: unique.length }, results });
}
