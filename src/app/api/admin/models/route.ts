import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAdmin } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { LLM_AREAS, MODELS, clearModelCache } from "@/lib/llm";

const MODEL_IDS = MODELS.map((m) => m.id) as string[];
const input = z.object({
  area: z.string().refine((a) => (LLM_AREAS as readonly string[]).includes(a), "unknown area"),
  model: z.string().refine((m) => MODEL_IDS.includes(m), "unknown model"),
  effort: z.string().trim().nullish(),
});

// POST /api/admin/models — set the model (+ optional effort) for an LLM area (admin only).
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  const { area, model, effort } = parsed.data;

  const { error } = await createAdminClient()
    .from("model_config")
    .upsert({ area, model, effort: effort ?? null, updated_at: new Date().toISOString() }, { onConflict: "area" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  clearModelCache();
  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: "model_config.update", targetType: "model_config", target: area });
  return NextResponse.json({ ok: true });
}
