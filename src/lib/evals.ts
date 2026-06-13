import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyOrg } from "@/lib/classify";
import { classifyCompanyType } from "@/lib/company-sync";

type Admin = ReturnType<typeof createAdminClient>;

// Eval areas whose production classifier we can run for a `classification` dataset. Each maps the
// example's `input` (jsonb) + a model to a predicted label. Logs under area 'eval' (kept out of the
// per-feature production cost; still visible on the Spend dashboard).
type Classifier = (input: Record<string, unknown>, model: string, ref: string) => Promise<string | null>;
const CLASSIFIERS: Record<string, Classifier> = {
  company_type: async (i, model, ref) =>
    (await classifyCompanyType({ name: String(i.name ?? i.company ?? ""), domain: (i.domain as string) ?? null, industry: (i.industry as string) ?? null }, { model, logArea: "eval", logRef: ref }))?.type ?? null,
  org_classify: async (i, model, ref) =>
    (await classifyOrg({ company: (i.company as string) ?? (i.name as string) ?? null, domain: (i.domain as string) ?? null, message: (i.message as string) ?? null }, { model, logArea: "eval", logRef: ref })).category,
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
      try { predicted = await classifier(ex.input ?? {}, model, runId); } catch (e) { detail = e instanceof Error ? e.message : String(e); }
      const passed = !!expected && !!predicted && predicted.toLowerCase().trim() === expected.toLowerCase().trim();
      if (expected) { (byClass[expected] ??= { total: 0, correct: 0 }).total++; if (passed) byClass[expected].correct++; }
      if (passed) correct++;
      results.push({ run_id: runId, example_id: ex.id, predicted: { label: predicted }, passed, score: passed ? 1 : 0, detail });
    });
    if (results.length) {
      const { error } = await admin.from("eval_results").insert(results);
      if (error) throw new Error(`results insert: ${error.message}`);
    }
    // Real cost + latency for this run: every classifier call logged to llm_calls tagged with ref=runId.
    const { data: calls } = await admin.from("llm_calls").select("cost_usd, latency_ms").eq("ref", runId);
    const costUsd = (calls ?? []).reduce((s, c) => s + (Number(c.cost_usd) || 0), 0);
    const lats = (calls ?? []).map((c) => Number(c.latency_ms)).filter((x) => Number.isFinite(x) && x > 0);
    const avgLatencyMs = lats.length ? Math.round(lats.reduce((s, x) => s + x, 0) / lats.length) : null;
    const n = examples.length;
    const metrics = { accuracy: n ? correct / n : 0, n, correct, by_class: byClass, model, cost_usd: costUsd, avg_latency_ms: avgLatencyMs, n_calls: (calls ?? []).length };
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

export type BenchRow = { model: string; runId: string; status: string; accuracy: number | null; cost_usd: number | null; avg_latency_ms: number | null; n: number | null; error: string | null };

/** Run one dataset against several models under a shared bench_group, so quality × cost × latency can
 *  be compared side by side. Runs sequentially (each run pools internally) to stay within rate limits.
 *  Returns one row per model, sorted by accuracy desc. */
export async function runBench(admin: Admin, datasetId: string, models: string[], opts: { createdBy?: string } = {}): Promise<{ benchGroup: string; rows: BenchRow[] }> {
  const benchGroup = randomUUID();
  const rows: BenchRow[] = [];
  for (const model of models) {
    try {
      const runId = await startEvalRun(admin, datasetId, model, { createdBy: opts.createdBy, benchGroup });
      const { data: run } = await admin.from("eval_runs").select("status, metrics, error").eq("id", runId).maybeSingle();
      const m = (run?.metrics ?? {}) as { accuracy?: number; cost_usd?: number; avg_latency_ms?: number; n?: number };
      rows.push({ model, runId, status: (run?.status as string) ?? "error", accuracy: m.accuracy ?? null, cost_usd: m.cost_usd ?? null, avg_latency_ms: m.avg_latency_ms ?? null, n: m.n ?? null, error: (run?.error as string) ?? null });
    } catch (e) {
      rows.push({ model, runId: "", status: "error", accuracy: null, cost_usd: null, avg_latency_ms: null, n: null, error: e instanceof Error ? e.message : String(e) });
    }
  }
  rows.sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1));
  return { benchGroup, rows };
}
