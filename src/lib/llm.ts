import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Per-area model selection + cost accounting for in-app Anthropic calls. Each LLM feature resolves
// its model via getModelFor(area) (default Opus 4.8, swappable from the admin Settings page), and
// logs usage via logLlmCall — feeding the cost tracker + model bench + drift monitoring.

export const DEFAULT_MODEL = "claude-opus-4-8";

export const LLM_AREAS = ["org_classify", "company_type", "inbound_match", "touch_editor", "reply_draft", "eval_judge"] as const;
export type LlmArea = (typeof LLM_AREAS)[number];

export const AREA_LABEL: Record<LlmArea, string> = {
  org_classify: "Inbound org classification",
  company_type: "Company type classification",
  inbound_match: "Inbound opportunity matching",
  touch_editor: "Campaign touch editor",
  reply_draft: "Inbound reply drafting",
  eval_judge: "Eval LLM-judge",
};

// Selectable models (admin Settings dropdown).
export const MODELS = [
  { id: "claude-opus-4-8", label: "Opus 4.8" },
  { id: "claude-opus-4-7", label: "Opus 4.7" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5" },
] as const;

// USD per 1M tokens (cached 2026-05; keep in sync with Anthropic pricing).
export const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-fable-5": { input: 10, output: 50 },
};

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (inputTokens / 1e6) * p.input + (outputTokens / 1e6) * p.output;
}

// Small in-memory cache of the model_config (it changes rarely; refresh every 60s).
let cache: { at: number; map: Map<string, { model: string; effort: string | null }> } | null = null;
const TTL_MS = 60_000;

/** Resolve the configured model (+ optional effort) for an area. Defaults to Opus 4.8. */
export async function getModelFor(area: LlmArea | string): Promise<{ model: string; effort: string | null }> {
  const now = Date.now();
  if (!cache || now - cache.at > TTL_MS) {
    try {
      const { data } = await createAdminClient().from("model_config").select("area, model, effort");
      cache = { at: now, map: new Map((data ?? []).map((r) => [r.area as string, { model: r.model as string, effort: (r.effort as string) ?? null }])) };
    } catch {
      if (!cache) cache = { at: now, map: new Map() };
    }
  }
  return cache.map.get(area) ?? { model: DEFAULT_MODEL, effort: null };
}

/** Invalidate the model cache (call after a Settings update). */
export function clearModelCache() { cache = null; }

/** Best-effort log of one Anthropic call (computes cost from tokens × pricing). Never throws. */
export async function logLlmCall(opts: {
  area: string; model: string; inputTokens?: number | null; outputTokens?: number | null;
  latencyMs?: number; ok?: boolean; error?: string | null; ref?: string | null;
}): Promise<void> {
  try {
    await createAdminClient().from("llm_calls").insert({
      area: opts.area, model: opts.model,
      input_tokens: opts.inputTokens ?? null, output_tokens: opts.outputTokens ?? null,
      cost_usd: costUsd(opts.model, opts.inputTokens ?? 0, opts.outputTokens ?? 0),
      latency_ms: opts.latencyMs ?? null, ok: opts.ok ?? true, error: opts.error ?? null, ref: opts.ref ?? null,
    });
  } catch { /* logging is best-effort — never break the feature */ }
}
