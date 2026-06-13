import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyOrg } from "@/lib/classify";
import { classifyCompanyType } from "@/lib/company-sync";

type Admin = ReturnType<typeof createAdminClient>;

// Eval areas whose production classifier we can run for a `classification` dataset. Each maps the
// example's `input` (jsonb) + a model to a predicted label. Logs under area 'eval' (kept out of the
// per-feature production cost; still visible on the Spend dashboard).
type Classifier = (input: Record<string, unknown>, model: string) => Promise<string | null>;
const CLASSIFIERS: Record<string, Classifier> = {
  company_type: async (i, model) =>
    (await classifyCompanyType({ name: String(i.name ?? i.company ?? ""), domain: (i.domain as string) ?? null, industry: (i.industry as string) ?? null }, { model, logArea: "eval" }))?.type ?? null,
  org_classify: async (i, model) =>
    (await classifyOrg({ company: (i.company as string) ?? (i.name as string) ?? null, domain: (i.domain as string) ?? null, message: (i.message as string) ?? null }, { model, logArea: "eval" })).category,
};

/** Areas that the classification runner can execute today. */
export function classifierAreas(): string[] { return Object.keys(CLASSIFIERS); }

const expectedLabel = (e: Record<string, unknown> | null): string | null => {
  if (!e) return null;
  const v = e.label ?? e.type ?? e.category ?? e.expected;
  return v == null ? null : String(v);
};

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]); }
  }));
}

/** Execute a queued eval run (classification only for now). Scores each labeled example against the
 *  production classifier with the run's model, writes per-example results, and stores metrics. */
export async function runEvalRun(admin: Admin, runId: string): Promise<void> {
  const { data: run } = await admin.from("eval_runs").select("id, dataset_id, model").eq("id", runId).maybeSingle();
  if (!run) return;
  const { data: ds } = await admin.from("eval_datasets").select("id, area, eval_type").eq("id", run.dataset_id as string).maybeSingle();
  const fail = async (error: string) => { await admin.from("eval_runs").update({ status: "error", error, finished_at: new Date().toISOString() }).eq("id", runId); };
  if (!ds) return fail("dataset missing");

  const { data: exRows } = await admin.from("eval_examples").select("id, input, expected").eq("dataset_id", run.dataset_id as string).eq("status", "labeled");
  const examples = (exRows ?? []) as { id: string; input: Record<string, unknown>; expected: Record<string, unknown> | null }[];
  await admin.from("eval_runs").update({ status: "running", started_at: new Date().toISOString(), n_examples: examples.length }).eq("id", runId);

  try {
    if (ds.eval_type !== "classification") throw new Error(`The runner supports 'classification' datasets so far (got '${ds.eval_type}').`);
    const classifier = CLASSIFIERS[ds.area as string];
    if (!classifier) throw new Error(`No classifier registered for area '${ds.area}'.`);
    const model = (run.model as string) || "claude-opus-4-8";

    const results: Record<string, unknown>[] = [];
    const byClass: Record<string, { total: number; correct: number }> = {};
    let correct = 0;
    await pool(examples, 5, async (ex) => {
      const expected = expectedLabel(ex.expected);
      let predicted: string | null = null, detail: string | null = null;
      try { predicted = await classifier(ex.input ?? {}, model); } catch (e) { detail = e instanceof Error ? e.message : String(e); }
      const passed = !!expected && !!predicted && predicted.toLowerCase().trim() === expected.toLowerCase().trim();
      if (expected) { (byClass[expected] ??= { total: 0, correct: 0 }).total++; if (passed) byClass[expected].correct++; }
      if (passed) correct++;
      results.push({ run_id: runId, example_id: ex.id, predicted: { label: predicted }, passed, score: passed ? 1 : 0, detail });
    });
    if (results.length) {
      const { error } = await admin.from("eval_results").insert(results);
      if (error) throw new Error(`results insert: ${error.message}`);
    }
    const n = examples.length;
    const metrics = { accuracy: n ? correct / n : 0, n, correct, by_class: byClass, model };
    await admin.from("eval_runs").update({ status: "done", metrics, n_scored: results.length, finished_at: new Date().toISOString() }).eq("id", runId);
  } catch (e) {
    await fail(e instanceof Error ? e.message : String(e));
  }
}

/** Queue + immediately execute a run. Returns the run id. (Used by the Run button + the bench.) */
export async function startEvalRun(admin: Admin, datasetId: string, model: string, opts: { createdBy?: string; benchGroup?: string } = {}): Promise<string> {
  const { data, error } = await admin.from("eval_runs").insert({ dataset_id: datasetId, model, status: "queued", bench_group: opts.benchGroup ?? null, created_by: opts.createdBy ?? null }).select("id").single();
  if (error) throw new Error(error.message);
  await runEvalRun(admin, data.id as string);
  return data.id as string;
}
