import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAdmin } from "@/lib/api";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ token: string }> };

// DELETE /api/links/[token] — delete a single link from a deck (admin only).
// Cascades to link_engagement (FK on delete cascade). Plausible analytics are
// external and unaffected; the contact record is preserved.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;
  const { token } = await params;

  const admin = createAdminClient();

  // Fetch first so we can record meaningful audit context.
  const { data: link } = await admin
    .from("links")
    .select("token, deck_id, contact_id, full_url")
    .eq("token", token)
    .single();
  if (!link) return NextResponse.json({ error: "Link not found" }, { status: 404 });

  const { error } = await admin.from("links").delete().eq("token", token);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAudit({
    actorId: guard.profile.id,
    actorEmail: guard.profile.email,
    action: "link.delete",
    targetType: "link",
    target: token,
    detail: { deck_id: link.deck_id, contact_id: link.contact_id, full_url: link.full_url },
  });

  return NextResponse.json({ ok: true });
}
