import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAdmin } from "@/lib/api";
import { runBench, classifierAreas, judgeAreas } from "@/lib/evals";
import { MODELS } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

const MODEL_IDS = MODELS.map((m) => m.id) as string[];
const input = z.object({ models: z.array(z.string()).min(1).max(MODEL_IDS.length) });

// POST /api/admin/evals/[id]/bench — run the dataset against several models under one bench_group,
// returning a quality × cost × latency comparison (admin). Synchronous; keep bench datasets modest
// in size (each model runs the full labeled set in sequence).
export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;
  const { id: datasetId } = await params;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  const models = parsed.data.models.filter((m) => MODEL_IDS.includes(m));
  if (!models.length) return NextResponse.json({ error: "No known models selected" }, { status: 400 });

  const admin = createAdminClient();
  const { data: ds } = await admin.from("eval_datasets").select("area, eval_type").eq("id", datasetId).maybeSingle();
  if (!ds) return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  const benchable =
    (ds.eval_type === "classification" && classifierAreas().includes(ds.area as string)) ||
    (ds.eval_type === "judge" && judgeAreas().includes(ds.area as string));
  if (!benchable) {
    return NextResponse.json({ error: "Bench supports model-backed datasets (classification, judge)" }, { status: 400 });
  }
  const { count } = await admin.from("eval_examples").select("id", { count: "exact", head: true }).eq("dataset_id", datasetId).eq("status", "labeled");
  if (!count) return NextResponse.json({ error: "No labeled examples to run" }, { status: 400 });

  try {
    const { benchGroup, rows } = await runBench(admin, datasetId, models, { createdBy: guard.profile.id });
    return NextResponse.json({ benchGroup, rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "bench failed" }, { status: 500 });
  }
}
