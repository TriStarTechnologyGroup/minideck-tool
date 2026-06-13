import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAdmin } from "@/lib/api";
import { startEvalRun } from "@/lib/evals";
import { getModelFor } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

const input = z.object({ model: z.string().optional() });

// POST /api/admin/evals/[id]/run — run the dataset against a model (admin). Defaults to the area's
// configured model. Synchronous (pooled); large datasets may need a background runner later.
export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;
  const { id: datasetId } = await params;
  const parsed = input.safeParse(await req.json().catch(() => ({})));
  const admin = createAdminClient();

  const { data: ds } = await admin.from("eval_datasets").select("area, eval_type").eq("id", datasetId).maybeSingle();
  if (!ds) return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  const { count } = await admin.from("eval_examples").select("id", { count: "exact", head: true }).eq("dataset_id", datasetId).eq("status", "labeled");
  if (!count) return NextResponse.json({ error: "No labeled examples to run" }, { status: 400 });

  // Assertion datasets are deterministic — no model. Classification picks the request model, else the
  // area's configured default.
  const model = ds.eval_type === "assertion"
    ? "deterministic"
    : (parsed.success && parsed.data.model ? parsed.data.model : (await getModelFor(ds.area as string)).model);
  try {
    const runId = await startEvalRun(admin, datasetId, model, { createdBy: guard.profile.id });
    const { data: run } = await admin.from("eval_runs").select("status, metrics, n_scored, error").eq("id", runId).maybeSingle();
    return NextResponse.json({ runId, ...run });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "run failed" }, { status: 500 });
  }
}
