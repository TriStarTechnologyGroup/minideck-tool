import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const input = z.object({
  action: z.enum(["verify", "unverify", "flag", "unflag"]),
  ids: z.array(z.string().uuid()).min(1).max(2000),
  flag_reason: z.string().trim().nullish(),
});

// POST /api/companies/bulk — verify / unverify / flag / unflag many companies at once (signed-in
// users). Stamps verified_at/by + flagged_at the same way the single-row PATCH does.
export async function POST(req: NextRequest) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  const { action, ids, flag_reason } = parsed.data;
  const now = new Date().toISOString();

  const patch: Record<string, unknown> =
    action === "verify" ? { verified: true, verified_at: now, verified_by: guard.profile.id }
    : action === "unverify" ? { verified: false, verified_at: null, verified_by: null }
    : action === "flag" ? { flagged_for_removal: true, flagged_at: now, flag_reason: flag_reason ?? null }
    : { flagged_for_removal: false, flagged_at: null, flag_reason: null };

  const { data, error } = await createAdminClient().from("companies").update(patch).in("id", ids).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const updated = (data ?? []).length;
  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: `company.bulk_${action}`, targetType: "company", detail: { count: updated } });
  return NextResponse.json({ ok: true, updated });
}
