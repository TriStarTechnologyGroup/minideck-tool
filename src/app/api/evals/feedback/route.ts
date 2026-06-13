import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";
import { judgeAreas } from "@/lib/evals";

export const dynamic = "force-dynamic";

const input = z.object({
  area: z.string(),
  input: z.record(z.string(), z.unknown()),
  verdict: z.enum(["pass", "fail"]),
});

// POST /api/evals/feedback — capture a 👍/👎 on a live LLM output as a LABELED judge example, so real
// usage feeds the golden sets. Any authenticated user; writes via admin client. Resolves the area's
// canonical judge dataset (earliest = the seeded scaffold), creating one if absent. De-duped by input.
export async function POST(req: NextRequest) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { area, input: exInput, verdict } = parsed.data;
  if (!judgeAreas().includes(area)) return NextResponse.json({ error: `No judge rubric for area '${area}'` }, { status: 400 });

  const admin = createAdminClient();
  let { data: ds } = await admin.from("eval_datasets").select("id").eq("area", area).eq("eval_type", "judge").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!ds) {
    const { data: created, error } = await admin.from("eval_datasets").insert({ name: `${area} — feedback`, area, eval_type: "judge", description: "Human 👍/👎 feedback captured from the app." }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    ds = created;
  }

  const sig = JSON.stringify(exInput);
  const { data: existing } = await admin.from("eval_examples").select("id, input").eq("dataset_id", ds.id).limit(5000);
  const dup = (existing ?? []).find((e) => JSON.stringify(e.input) === sig);
  const patch = { expected: { label: verdict }, status: "labeled" as const, source: "feedback", updated_at: new Date().toISOString() };
  if (dup) {
    const { error } = await admin.from("eval_examples").update(patch).eq("id", dup.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, updated: true });
  }
  const { error } = await admin.from("eval_examples").insert({ dataset_id: ds.id, input: exInput, ...patch });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
