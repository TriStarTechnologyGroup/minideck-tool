import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

const patchInput = z.object({
  subject: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  status: z.enum(["draft", "sent", "skipped"]).optional(),
});

// PATCH /api/touches/[id] — edit a draft, or mark sent/skipped. Marking Touch 1 (seq 1)
// sent anchors the account's cadence (sets accounts.started_at if not already set).
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  const { id } = await params;
  const parsed = patchInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Invalid or empty update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: touch } = await admin.from("touches").select("id, seq, account_id, status").eq("id", id).maybeSingle();
  if (!touch) return NextResponse.json({ error: "Touch not found" }, { status: 404 });

  const update: Record<string, unknown> = { ...parsed.data };
  const now = new Date().toISOString();
  if (parsed.data.status === "sent") update.sent_at = now;
  if (parsed.data.status && parsed.data.status !== "sent") update.sent_at = null;

  const { data, error } = await admin.from("touches").update(update).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Anchor cadence when Touch 1 is marked sent.
  if (parsed.data.status === "sent" && touch.seq === 1) {
    const { data: acct } = await admin.from("accounts").select("started_at").eq("id", touch.account_id).maybeSingle();
    if (acct && !acct.started_at) await admin.from("accounts").update({ started_at: now }).eq("id", touch.account_id);
  }

  return NextResponse.json({ touch: data });
}
