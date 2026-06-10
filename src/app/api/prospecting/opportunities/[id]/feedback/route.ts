import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// POST /api/prospecting/opportunities/[id]/feedback — save reviewer feedback for an
// opportunity's score (non-destructive; the opportunity's own fit_score is untouched).
const input = z.object({
  reviewer_score: z.number().int().nullish(),
  component_points: z.record(z.string(), z.number().int()).nullish(),
  verdict: z.enum(["agree", "too_high", "too_low", "reject"]).nullish(),
  notes: z.string().nullish(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  const { id } = await params;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("opportunity_feedback").upsert(
    {
      opportunity_id: id,
      reviewer_score: parsed.data.reviewer_score ?? null,
      component_points: parsed.data.component_points ?? null,
      verdict: parsed.data.verdict ?? null,
      notes: parsed.data.notes ?? null,
      updated_by: guard.profile.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "opportunity_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: "opportunity.feedback", targetType: "opportunity", target: id, detail: { verdict: parsed.data.verdict, reviewer_score: parsed.data.reviewer_score } });
  return NextResponse.json({ ok: true });
}
