import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import { requireApiUser, requireApiAdmin } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// GET — the global scoring-model weights. Bearer PROSPECTING_INGEST_SECRET (for the skill)
// or any signed-in user. POST — admins update the weights (takes effect on the next run/rescore).
export async function GET(req: NextRequest) {
  const secret = serverEnv.PROSPECTING_INGEST_SECRET;
  const authed = Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!authed) {
    const guard = await requireApiUser();
    if (guard.error) return guard.error;
  }
  const { data } = await createAdminClient().from("scoring_model").select("component, weight_max, description, sort_order").order("sort_order");
  return NextResponse.json({ components: data ?? [], total: (data ?? []).reduce((s, r) => s + (r.weight_max as number), 0) });
}

const input = z.object({
  components: z.array(z.object({ component: z.string().min(1), weight_max: z.number().int().min(0).max(100), description: z.string().nullish() })).min(1),
});

export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });

  const admin = createAdminClient();
  for (const c of parsed.data.components) {
    const { error } = await admin.from("scoring_model")
      .update({ weight_max: c.weight_max, description: c.description ?? null, updated_at: new Date().toISOString(), updated_by: guard.profile.id })
      .eq("component", c.component);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: "scoring_model.update", detail: { components: parsed.data.components.map((c) => ({ [c.component]: c.weight_max })) } });
  return NextResponse.json({ ok: true });
}
