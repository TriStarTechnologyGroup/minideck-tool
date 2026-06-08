import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser, requireApiAdmin } from "@/lib/api";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

const patchInput = z.object({
  name: z.string().trim().min(1).optional(),
  sender_label: z.string().trim().nullable().optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  const { id } = await params;
  const parsed = patchInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Invalid or empty update" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.from("campaigns").update(parsed.data).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ campaign: data });
}

// DELETE: cascade accounts/contacts/touches (FK), and explicitly delete the accounts'
// shared links (which cascades link_engagement) so nothing is orphaned. Admin only.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;
  const admin = createAdminClient();

  const { data: accts } = await admin.from("accounts").select("link_id").eq("campaign_id", id);
  const linkIds = (accts ?? []).map((a: { link_id: string | null }) => a.link_id).filter(Boolean) as string[];
  if (linkIds.length) await admin.from("links").delete().in("id", linkIds);

  const { error } = await admin.from("campaigns").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: "campaign.delete", targetType: "campaign", target: id });
  return NextResponse.json({ ok: true });
}
