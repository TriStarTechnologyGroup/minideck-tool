import "server-only";
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import { logLlmCall } from "@/lib/llm";
import { classifyOrg, classifyByDomain } from "@/lib/classify";
import { classifyCompanyType } from "@/lib/company-sync";
import { prospectEligible, companyProspectable, shouldBeTier1, redactPii, containsPii } from "@/lib/guardrails";
import { norm, asArray, setScore } from "@/lib/eval-match";
import { normalizeDomain, normalizeCompanyName } from "@/lib/hubspot";

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

// Deterministic guardrail assertions: input → actual outcome (a label), compared to the example's
// expected outcome. No model, no API cost — these run instantly in-app and in CI (guardrails.test.ts
// covers the same predicates). Each maps to a real production guardrail in src/lib/guardrails.ts.
type Assertion = (input: Record<string, unknown>) => string;
const ASSERTIONS: Record<string, Assertion> = {
  // Academia gate: industry → "eligible", everything else → "blocked". Accepts a category directly,
  // or a domain (run through the same .edu/.gov rule the inbound sync uses).
  academia_gate: (i) => {
    const category = (i.category as string) ?? (i.domain ? classifyByDomain(i.domain as string) ?? "other" : null);
    return prospectEligible(category) ? "eligible" : "blocked";
  },
  // Company suppression: verified, unflagged industry company → "prospectable", else "blocked".
  company_suppression: (i) =>
    companyProspectable({ type: (i.type as string) ?? null, verified: i.verified as boolean | null, flagged_for_removal: i.flagged_for_removal as boolean | null }) ? "prospectable" : "blocked",
  // Tier-1 rule: approved drug program → "tier1", else "not_tier1".
  tier1_consistency: (i) => (shouldBeTier1((i.highest_phase as string) ?? (i.phase as string) ?? null) ? "tier1" : "not_tier1"),
  // PII redaction: text must come out clean. "leak" is a guardrail failure.
  pii_redaction: (i) => (containsPii(redactPii(String(i.text ?? ""))) ? "leak" : "clean"),
};

/** Areas the deterministic assertion runner can execute. */
export function assertionAreas(): string[] { return Object.keys(ASSERTIONS); }

// ── Judge (LLM-as-judge) ──────────────────────────────────────────────────────────────────────
// Each rubric scores one artifact against TriStar's standards. When an example carries a human gold
// verdict, the run measures judge↔human agreement (validating the judge); otherwise it reports the
// judge's own pass-rate + mean score. The run's model IS the judge model, so judge models can be
// benched against each other.
const JudgeOut = z.object({ verdict: z.enum(["pass", "fail"]), score: z.number().min(0).max(1), reason: z.string().max(400) });
type Rubric = { system: string; render: (input: Record<string, unknown>) => string };
const kv = (i: Record<string, unknown>) => Object.entries(i).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join("\n");
const TRISTAR = `TriStar Technology Group is an oncology-focused biospecimen repository + CRO: 2.5M+ consented, annotated human tissue samples (FFPE, plasma), tumor microarrays (TMAs), and lab services (IHC, RNAScope, NGS, RNA-Seq, Digital Spatial Profiling, digital pathology). ICP buyers: pharma/biotech (drug discovery, translational, companion diagnostics), diagnostics companies, and AI/computational-pathology companies.`;
const RUBRICS: Record<string, Rubric> = {
  company_fit: {
    system: `${TRISTAR}\nYou judge whether a COMPANY is a strong ICP fit for TriStar's outbound. PASS = a for-profit pharma/biotech/diagnostics/AI-pathology org plausibly doing oncology drug development, translational research, or companion diagnostics (a credible buyer of biospecimens, TMAs, or oncology lab services). FAIL = academia/non-profit/government, non-oncology, a tools/reagents vendor with no specimen need, or too vague to qualify. Return verdict, a 0–1 fit score, and a one-sentence reason.`,
    render: (i) => `Company under review:\n${kv(i)}`,
  },
  people_fit: {
    system: `${TRISTAR}\nYou judge whether a PERSON is a decision-maker ICP for TriStar — i.e. someone with influence over buying biospecimens / TMAs / oncology lab services. PASS = translational medicine, biomarker, companion-diagnostics, pathology, BD/alliance, or preclinical/oncology R&D leadership (Director level and up, or clearly relevant scientist). FAIL = unrelated function (pure IT, sales, HR, finance), too junior to influence, or irrelevant industry. Return verdict, a 0–1 score, and a one-sentence reason.`,
    render: (i) => `Person under review:\n${kv(i)}`,
  },
  opportunity_validity: {
    system: `${TRISTAR}\nYou judge whether a generated OPPORTUNITY is valid and credible. PASS = the matched TMA(s)/capabilities genuinely fit the company's stated need or pipeline, the rationale is grounded (no fabricated claims, no hallucinated products), and it would not embarrass a rep. FAIL = mismatched offering, invented facts, academia being prospected, or empty/irrelevant rationale. Return verdict, a 0–1 score, and a one-sentence reason.`,
    render: (i) => `Opportunity under review:\n${kv(i)}`,
  },
  touch_quality: {
    system: `${TRISTAR}\nYou judge the QUALITY of an outbound sales email touch to a pharma/biotech translational, BD, or companion-diagnostics leader. PASS = professional, concise, specific, credible; grounded in real research/angle; no hype, no fabricated stats/claims; appropriate to its role in the cadence. FAIL = generic, hypey, fabricated, off-brand, or rambling. Return verdict, a 0–1 quality score, and a one-sentence reason.`,
    render: (i) => `Email touch under review:\n${kv(i)}`,
  },
};

/** Areas the LLM-judge can score (have a rubric). */
export function judgeAreas(): string[] { return Object.keys(RUBRICS); }

async function runJudge(area: string, input: Record<string, unknown>, model: string, ref: string): Promise<{ verdict: string; score: number; reason: string }> {
  const rubric = RUBRICS[area];
  if (!rubric) throw new Error(`No rubric registered for judge area '${area}'.`);
  if (!serverEnv.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  const client = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });
  const t0 = Date.now();
  try {
    const res = await client.messages.parse({ model, max_tokens: 700, system: rubric.system, messages: [{ role: "user", content: rubric.render(input) }], output_config: { format: zodOutputFormat(JudgeOut) } });
    await logLlmCall({ area: "eval", model, inputTokens: res.usage?.input_tokens, outputTokens: res.usage?.output_tokens, latencyMs: Date.now() - t0, ref });
    const o = res.parsed_output;
    if (!o) throw new Error("no structured output");
    return { verdict: o.verdict, score: o.score, reason: o.reason };
  } catch (e) {
    await logLlmCall({ area: "eval", model, latencyMs: Date.now() - t0, ok: false, error: e instanceof Error ? e.message : String(e), ref });
    throw e;
  }
}

// ── Match (set comparison) ──────────────────────────────────────────────────────────────────────
// Compares a predicted set against a gold set (precision/recall/F1). The prediction comes from a
// registered matcher for the area, or — when none is registered — from the example's own `predicted`
// field (so offline-scored matches, e.g. exported from a real prospecting run, can be graded today).
// A matcher prepares shared context once per run (e.g. loads a table), then maps each example's
// input → a predicted set. Live matchers run real in-app logic; areas without one fall back to the
// example's own `input.predicted` (offline scoring).
type Matcher = { prepare?: (admin: Admin) => Promise<unknown>; match: (input: Record<string, unknown>, ctx: unknown) => string[] };
const tokenize = (s: string): string[] => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 2);

const MATCHERS: Record<string, Matcher> = {
  // Live: mirrors the production dedup rule (normalized domain OR normalized company name) used by the
  // HubSpot company sync. Given {name, domain}, returns the existing companies it would be merged with.
  dedup_match: {
    prepare: async (admin) => {
      const { data } = await admin.from("companies").select("name, domain, website").limit(5000);
      return (data ?? []).map((c) => ({ name: String(c.name ?? ""), nd: normalizeDomain((c.domain as string) || (c.website as string)), nn: normalizeCompanyName(c.name as string) }));
    },
    match: (input, ctx) => {
      const list = (ctx as { name: string; nd: string; nn: string }[]) ?? [];
      const nd = normalizeDomain(String(input.domain ?? input.website ?? ""));
      const nn = normalizeCompanyName(String(input.name ?? input.company ?? ""));
      return list.filter((c) => (nd && c.nd === nd) || (nn && c.nn === nn)).map((c) => c.name);
    },
  },
  // Live baseline (NOT the LLM skill): keyword overlap between the inquiry and the TMA catalog
  // (name / cancer / categories / markers). A deterministic floor to measure the skill against.
  inbound_match: {
    prepare: async (admin) => {
      const { data } = await admin.from("tma_catalog").select("sku, name, cancer, categories, markers").limit(5000);
      return (data ?? []).map((t) => ({ sku: String(t.sku ?? t.name ?? ""), tokens: new Set(tokenize([t.name, t.cancer, t.categories, t.markers].filter(Boolean).join(" "))) }));
    },
    match: (input, ctx) => {
      const cat = (ctx as { sku: string; tokens: Set<string> }[]) ?? [];
      const q = new Set(tokenize([input.message, input.requested_products, input.cancer, input.tumor_types, input.target, input.asset].filter(Boolean).map(String).join(" ")));
      if (!q.size) return [];
      const scored = cat.map((t) => { let o = 0; for (const tok of t.tokens) if (q.has(tok)) o++; return { sku: t.sku, o }; }).filter((x) => x.o > 0).sort((a, b) => b.o - a.o);
      return scored.slice(0, 5).map((x) => x.sku);
    },
  },
};

/** Areas with a registered (live) matcher. Offline scoring via `input.predicted` works regardless. */
export function matchAreas(): string[] { return Object.keys(MATCHERS); }

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
    const evalType = ds.eval_type as string;
    const area = ds.area as string;
    const model = (run.model as string) || "claude-opus-4-8";
    // Score one example → { predicted label, 0-1 score, passed, detail }. classification + judge are
    // model-backed (logged + billed under 'eval'); assertion + match are deterministic (no API cost).
    type Scored = { predicted: string | null; score: number; passed: boolean; detail: string | null };
    let scorer: (input: Record<string, unknown>, expected: Record<string, unknown> | null) => Promise<Scored>;
    if (evalType === "classification") {
      const classifier = CLASSIFIERS[area];
      if (!classifier) throw new Error(`No classifier registered for area '${area}'.`);
      scorer = async (input, expected) => {
        const predicted = await classifier(input, model, runId);
        const exp = expectedLabel(expected);
        const passed = !!exp && !!predicted && norm(predicted) === norm(exp);
        return { predicted, score: passed ? 1 : 0, passed, detail: null };
      };
    } else if (evalType === "assertion") {
      const assertion = ASSERTIONS[area];
      if (!assertion) throw new Error(`No assertion registered for area '${area}'.`);
      scorer = async (input, expected) => {
        const predicted = assertion(input);
        const exp = expectedLabel(expected);
        const passed = !!exp && norm(predicted) === norm(exp);
        return { predicted, score: passed ? 1 : 0, passed, detail: null };
      };
    } else if (evalType === "judge") {
      if (!RUBRICS[area]) throw new Error(`No rubric registered for judge area '${area}'.`);
      scorer = async (input, expected) => {
        const j = await runJudge(area, input, model, runId);
        const exp = expectedLabel(expected); // human gold verdict when labeled → measures agreement
        const passed = exp ? norm(j.verdict) === norm(exp) : j.verdict === "pass";
        return { predicted: j.verdict, score: j.score, passed, detail: j.reason };
      };
    } else if (evalType === "match") {
      const matcher = MATCHERS[area];
      const ctx = matcher?.prepare ? await matcher.prepare(admin) : null; // load shared context once
      scorer = async (input, expected) => {
        const predictedSet = matcher ? matcher.match(input, ctx) : asArray(input.predicted);
        const gold = asArray(expected?.items ?? expected?.expected ?? expected?.gold ?? expected?.label);
        const s = setScore(predictedSet, gold);
        const detail = [s.missing.length ? `missing: ${s.missing.join(", ")}` : "", s.extra.length ? `extra: ${s.extra.join(", ")}` : "", !matcher && !predictedSet.length ? "no prediction (set input.predicted or register a matcher)" : ""].filter(Boolean).join(" · ") || null;
        return { predicted: `F1 ${s.f1.toFixed(2)} (${s.tp}/${gold.length})`, score: s.f1, passed: s.f1 === 1, detail };
      };
    } else {
      throw new Error(`Unknown eval_type '${evalType}'.`);
    }

    const results: Record<string, unknown>[] = [];
    const byClass: Record<string, { total: number; correct: number }> = {};
    let correct = 0, scoreSum = 0;
    await pool(examples, 5, async (ex) => {
      let r: Scored = { predicted: null, score: 0, passed: false, detail: null };
      try { r = await scorer(ex.input ?? {}, ex.expected); } catch (e) { r.detail = e instanceof Error ? e.message : String(e); }
      const bucket = expectedLabel(ex.expected) ?? r.predicted ?? "—";
      (byClass[bucket] ??= { total: 0, correct: 0 }).total++; if (r.passed) byClass[bucket].correct++;
      if (r.passed) correct++;
      scoreSum += r.score;
      results.push({ run_id: runId, example_id: ex.id, predicted: { label: r.predicted }, passed: r.passed, score: r.score, detail: r.detail });
    });
    if (results.length) {
      const { error } = await admin.from("eval_results").insert(results);
      if (error) throw new Error(`results insert: ${error.message}`);
    }
    // Real cost + latency for this run: every model-backed call logged to llm_calls tagged ref=runId.
    const { data: calls } = await admin.from("llm_calls").select("cost_usd, latency_ms").eq("ref", runId);
    const costUsd = (calls ?? []).reduce((s, c) => s + (Number(c.cost_usd) || 0), 0);
    const lats = (calls ?? []).map((c) => Number(c.latency_ms)).filter((x) => Number.isFinite(x) && x > 0);
    const avgLatencyMs = lats.length ? Math.round(lats.reduce((s, x) => s + x, 0) / lats.length) : null;
    const n = examples.length;
    const metrics = { accuracy: n ? correct / n : 0, avg_score: n ? scoreSum / n : 0, n, correct, by_class: byClass, model, cost_usd: costUsd, avg_latency_ms: avgLatencyMs, n_calls: (calls ?? []).length };
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
