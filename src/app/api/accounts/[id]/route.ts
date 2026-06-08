import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser, requireApiAdmin } from "@/lib/api";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

const patchInput = z.object({
  name: z.string().trim().min(1).optional(),
  warmth: z.enum(["hot", "warm", "light"]).optional(),
  research: z.string().nullable().optional(),
  context: z.string().nullable().optional(),
  angle: z.string().nullable().optional(),
  status: z.enum(["active", "won", "closed", "archived"]).optional(),
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
  const { data, error } = await admin.from("accounts").update(parsed.data).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ account: data });
}

// DELETE: remove the account + its shared link (cascades engagement) + contacts/touches. Admin only.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;
  const { id } = await params;
  const admin = createAdminClient();

  const { data: account } = await admin.from("accounts").select("link_id").eq("id", id).maybeSingle();
  if (account?.link_id) await admin.from("links").delete().eq("id", account.link_id); // cascades link_engagement

  const { error } = await admin.from("accounts").delete().eq("id", id); // cascades account_contacts + touches
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: "account.delete", targetType: "account", target: id });
  return NextResponse.json({ ok: true });
}
