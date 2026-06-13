// Pure set-comparison helpers for `match` evals (kept out of the server-only evals.ts so they're
// unit-testable in CI without pulling in the Anthropic SDK / server env).

export const norm = (s: string) => s.toLowerCase().trim();

/** Coerce a value into a list of strings: arrays pass through; a delimited string splits on ;,|. */
export const asArray = (v: unknown): string[] =>
  (Array.isArray(v) ? v.map((x) => String(x)) : typeof v === "string" && v.trim() ? v.split(/[;,|]/).map((s) => s.trim()) : []).filter(Boolean);

/** Precision / recall / F1 of a predicted set vs a gold set (case-insensitive). Empty-vs-empty = 1. */
export function setScore(predicted: string[], gold: string[]): { f1: number; precision: number; recall: number; tp: number; missing: string[]; extra: string[] } {
  const p = new Set(predicted.map(norm)); const g = new Set(gold.map(norm));
  let tp = 0; for (const x of p) if (g.has(x)) tp++;
  const precision = p.size ? tp / p.size : (g.size ? 0 : 1);
  const recall = g.size ? tp / g.size : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const missing = [...g].filter((x) => !p.has(x)); const extra = [...p].filter((x) => !g.has(x));
  return { f1, precision, recall, tp, missing, extra };
}
