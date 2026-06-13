import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const STATUSES = ["new", "classified", "replied", "quoted", "prospected", "closed_won", "closed_lost", "ignored"] as const;
const input = z.object({ status: z.enum(STATUSES) });

// PATCH /api/inbound/[id] — move an inquiry through its lifecycle (signed-in users).
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  const { id } = await params;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const { error } = await createAdminClient().from("inbound_inquiries").update({ status: parsed.data.status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: "inquiry.status", targetType: "inquiry", target: id, detail: { status: parsed.data.status } });
  return NextResponse.json({ ok: true, status: parsed.data.status });
}
