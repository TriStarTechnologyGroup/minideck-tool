"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { parseCsv, toCsv, downloadCsv } from "@/lib/csv";

export type Dataset = { id: string; name: string; area: string; eval_type: string; description: string | null };
export type Example = { id: string; input: Record<string, unknown>; expected: Record<string, unknown> | null; status: string; source: string | null; notes: string | null };
export type RunMetrics = { accuracy?: number; n?: number; correct?: number; by_class?: Record<string, { total: number; correct: number }>; cost_usd?: number; avg_latency_ms?: number | null; n_calls?: number };
export type Run = { id: string; model: string | null; status: string; metrics: RunMetrics | null; n_examples: number | null; n_scored: number | null; error: string | null; created_at: string; bench_group: string | null };
type BenchRow = { model: string; accuracy: number | null; cost_usd: number | null; avg_latency_ms: number | null; n: number | null; status: string };

const ic = "rounded-sm border border-line-strong bg-surface px-2 py-1 text-sm text-ink";
const labelOf = (e: Example) => { const v = e.expected?.label ?? e.expected?.type ?? e.expected?.category; return v == null ? "" : String(v); };
const inputSummary = (i: Record<string, unknown>) => Object.entries(i).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—";

export default function DatasetDetail({ dataset, initialExamples, runs, models, runnable, canSetDefault }: { dataset: Dataset; initialExamples: Example[]; runs: Run[]; models: { id: string; label: string }[]; runnable: boolean; canSetDefault: boolean }) {
  const router = useRouter();
  const [examples, setExamples] = useState(initialExamples);
  const [model, setModel] = useState(models[0]?.id ?? "claude-opus-4-8");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [addInput, setAddInput] = useState('{"name":"","domain":"","industry":""}');
  const [addLabel, setAddLabel] = useState("");
  const [benchModels, setBenchModels] = useState<string[]>(models.map((m) => m.id));
  const [benchRows, setBenchRows] = useState<BenchRow[] | null>(null);
  const [benchMsg, setBenchMsg] = useState<string | null>(null);

  const total = examples.length;
  const labeled = useMemo(() => examples.filter((e) => e.status === "labeled").length, [examples]);
  const latest = runs[0];
  const modelLabel = useMemo(() => Object.fromEntries(models.map((m) => [m.id, m.label])), [models]);

  // Most recent bench group from history (shown until a fresh bench replaces it).
  const historyBench = useMemo<BenchRow[] | null>(() => {
    const g = runs.find((r) => r.bench_group)?.bench_group;
    if (!g) return null;
    const rows = runs.filter((r) => r.bench_group === g).map((r) => ({ model: r.model ?? "?", accuracy: r.metrics?.accuracy ?? null, cost_usd: r.metrics?.cost_usd ?? null, avg_latency_ms: r.metrics?.avg_latency_ms ?? null, n: r.metrics?.n ?? null, status: r.status }));
    return rows.sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1));
  }, [runs]);
  const bench = benchRows ?? historyBench;
  const bestAcc = bench ? Math.max(...bench.map((r) => r.accuracy ?? -1)) : -1;
  const lowCost = bench ? Math.min(...bench.filter((r) => r.cost_usd != null).map((r) => r.cost_usd as number), Infinity) : Infinity;

  async function api(body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/evals/${dataset.id}/examples`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? "Failed"); return false; }
    return true;
  }

  async function setLabel(ex: Example, label: string) {
    const expected = label.trim() ? { label: label.trim() } : null;
    setExamples((xs) => xs.map((x) => (x.id === ex.id ? { ...x, expected, status: expected ? "labeled" : "unlabeled" } : x)));
    await api({ action: "update", exampleId: ex.id, data: { expected, status: expected ? "labeled" : "unlabeled" } });
  }
  async function del(ex: Example) {
    setExamples((xs) => xs.filter((x) => x.id !== ex.id));
    await api({ action: "delete", exampleId: ex.id });
  }
  async function add() {
    let input: Record<string, unknown> = {};
    try { input = JSON.parse(addInput || "{}"); } catch { alert("Input must be valid JSON"); return; }
    setBusy(true);
    const ok = await api({ action: "add", data: { input, expected: addLabel.trim() ? { label: addLabel.trim() } : null, status: addLabel.trim() ? "labeled" : "unlabeled" } });
    setBusy(false);
    if (ok) { setAddLabel(""); router.refresh(); }
  }
  async function onCsv(file: File) {
    setBusy(true); setMsg(null);
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) { setMsg("CSV needs a header row + at least one row."); return; }
      const header = rows[0].map((h) => h.trim());
      const li = header.findIndex((h) => /^(label|expected|type|category)$/i.test(h));
      const body = rows.slice(1).map((cells) => {
        const input: Record<string, string> = {};
        header.forEach((h, idx) => { if (idx !== li && h) input[h] = cells[idx] ?? ""; });
        const label = li >= 0 ? (cells[li] ?? "").trim() : "";
        return { input, expected: label ? { label } : null, status: (label ? "labeled" : "unlabeled") as "labeled" | "unlabeled" };
      });
      const res = await fetch(`/api/admin/evals/${dataset.id}/examples`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bulk", rows: body }) });
      const j = await res.json();
      if (res.ok) { setMsg(`Imported ${j.inserted} examples${li < 0 ? " (no label/expected column found — imported unlabeled)" : ""}.`); router.refresh(); }
      else setMsg(`Error: ${j.error ?? res.status}`);
    } finally { setBusy(false); }
  }
  function exportCsv() {
    const keys = [...new Set(examples.flatMap((e) => Object.keys(e.input)))];
    const columns = [...keys.map((k) => ({ key: k, label: k })), { key: "label", label: "label" }];
    downloadCsv(`${dataset.area}-golden.csv`, toCsv(columns, examples.map((e) => ({ ...e.input, label: labelOf(e) }))));
  }
  async function run() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/evals/${dataset.id}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }) });
      const j = await res.json();
      if (res.ok) { setMsg(`Run ${j.status}: ${j.metrics?.accuracy != null ? `${(j.metrics.accuracy * 100).toFixed(1)}% (${j.metrics.correct}/${j.metrics.n})` : j.error ?? "done"}`); router.refresh(); }
      else setMsg(`Error: ${j.error ?? res.status}`);
    } finally { setBusy(false); }
  }
  async function runBench() {
    setBusy(true); setBenchMsg(null);
    try {
      const res = await fetch(`/api/admin/evals/${dataset.id}/bench`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ models: benchModels }) });
      const j = await res.json();
      if (res.ok) { setBenchRows(j.rows as BenchRow[]); setBenchMsg(`Compared ${j.rows.length} models on ${j.rows[0]?.n ?? 0} examples.`); router.refresh(); }
      else setBenchMsg(`Error: ${j.error ?? res.status}`);
    } finally { setBusy(false); }
  }
  async function setDefault(m: string) {
    const res = await fetch(`/api/admin/models`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ area: dataset.area, model: m }) });
    const j = await res.json().catch(() => ({}));
    setBenchMsg(res.ok ? `Set ${modelLabel[m] ?? m} as the default for ${dataset.area}.` : `Error: ${j.error ?? res.status}`);
  }

  const fmtCost = (c: number | null) => (c == null ? "—" : c < 0.01 ? `$${c.toFixed(4)}` : `$${c.toFixed(2)}`);

  return (
    <div className="flex flex-col gap-5">
      {/* State banner */}
      {total === 0 ? (
        <div className="card border-amber-200 bg-amber-50/40 px-5 py-4 text-sm text-ink">
          <b>No golden set yet.</b> Add examples below, or upload a CSV (a <code>label</code> column = the gold answer; other columns = the input). Until it has labeled examples, evals for this area show &ldquo;awaiting golden set.&rdquo;
        </div>
      ) : labeled < total ? (
        <div className="card px-5 py-3 text-sm text-ink-muted">Building — <b className="text-ink">{labeled}/{total}</b> labeled. Label the rest (set the gold answer) to include them in a run.</div>
      ) : (
        <div className="card px-5 py-3 text-sm text-emerald-700">Ready — {labeled} labeled examples.</div>
      )}

      {/* Run + latest scorecard */}
      <section className="card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink">Run</span>
          <select className={ic} value={model} onChange={(e) => setModel(e.target.value)} disabled={!runnable}>{models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
          <button type="button" className="btn btn-primary btn-xs" disabled={busy || !runnable || labeled === 0} onClick={run}>{busy ? "Running…" : "Run eval"}</button>
          {!runnable && <span className="text-xs text-amber-600">This area/type isn&rsquo;t runnable yet — scorer lands in a later phase (match/judge/assertion).</span>}
          {runnable && labeled === 0 && <span className="text-xs text-ink-muted">Label some examples to run.</span>}
          {msg && <span className="text-xs text-ink-muted">{msg}</span>}
        </div>
        {latest && (
          <div className="text-xs text-ink-muted">
            Latest: <span className={latest.status === "error" ? "text-red-600" : "text-ink"}>{latest.status}</span>
            {latest.metrics?.accuracy != null && <> · <b className="text-ink">{(latest.metrics.accuracy * 100).toFixed(1)}%</b> ({latest.metrics.correct}/{latest.metrics.n}) · {latest.model}</>}
            {latest.error && <> · {latest.error}</>}
            {latest.metrics?.by_class && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {Object.entries(latest.metrics.by_class).map(([k, v]) => <span key={k} className="chip bg-surface-muted text-nav">{k}: {v.correct}/{v.total}</span>)}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Model bench */}
      {runnable && (
        <section className="card flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-sm font-medium text-ink">Model bench</span>
            <div className="flex flex-wrap gap-2">
              {models.map((m) => (
                <label key={m.id} className="flex items-center gap-1 text-xs text-ink-muted">
                  <input type="checkbox" checked={benchModels.includes(m.id)} onChange={(e) => setBenchModels((xs) => (e.target.checked ? [...new Set([...xs, m.id])] : xs.filter((x) => x !== m.id)))} />
                  {m.label}
                </label>
              ))}
            </div>
            <button type="button" className="btn btn-secondary btn-xs" disabled={busy || labeled === 0 || benchModels.length < 1} onClick={runBench}>{busy ? "Benching…" : "Run bench"}</button>
            {benchMsg && <span className="text-xs text-ink-muted">{benchMsg}</span>}
          </div>
          <p className="text-[0.7rem] text-ink-muted/70">Runs the labeled set against each model in sequence, then compares accuracy × cost × latency. Keep bench sets modest (≈≤60 examples) so it finishes within the request window.</p>
          {bench && bench.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-ink-muted"><tr className="border-b border-line"><th className="px-3 py-1.5 font-medium">Model</th><th className="px-3 py-1.5 font-medium">Accuracy</th><th className="px-3 py-1.5 font-medium">Cost</th><th className="px-3 py-1.5 font-medium">Avg latency</th><th className="px-3 py-1.5"></th></tr></thead>
                <tbody className="divide-y divide-line">
                  {bench.map((r) => (
                    <tr key={r.model}>
                      <td className="px-3 py-1.5 text-ink">{modelLabel[r.model] ?? r.model}</td>
                      <td className="px-3 py-1.5">{r.accuracy == null ? <span className="text-ink-muted">—</span> : <span className={r.accuracy === bestAcc ? "font-semibold text-emerald-700" : "text-ink"}>{(r.accuracy * 100).toFixed(1)}%{r.accuracy === bestAcc && " ★"}</span>}{r.status === "error" && <span className="ml-1 text-red-500">err</span>}</td>
                      <td className={`px-3 py-1.5 ${r.cost_usd != null && r.cost_usd === lowCost ? "font-semibold text-emerald-700" : "text-ink-muted"}`}>{fmtCost(r.cost_usd)}</td>
                      <td className="px-3 py-1.5 text-ink-muted">{r.avg_latency_ms == null ? "—" : `${r.avg_latency_ms} ms`}</td>
                      <td className="px-3 py-1.5 text-right">{canSetDefault && r.status === "done" && <button type="button" className="text-xs text-link hover:underline" onClick={() => setDefault(r.model)}>Set default</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!canSetDefault && <p className="mt-1 px-3 text-[0.7rem] text-ink-muted/70">This area isn&rsquo;t a configurable production model slot, so &ldquo;set default&rdquo; isn&rsquo;t shown — use it to pick the model, then wire it where the area is consumed.</p>}
            </div>
          )}
        </section>
      )}

      {/* Import / export + add */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="btn btn-secondary btn-xs cursor-pointer">Upload CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onCsv(e.target.files[0])} /></label>
          <button type="button" className="btn btn-ghost btn-xs" onClick={exportCsv} disabled={!total}>Export CSV</button>
          <span className="text-xs text-ink-muted">CSV: a <code>label</code> column is the gold answer; other columns become the input.</span>
        </div>
        <div className="card flex flex-wrap items-end gap-2 p-3">
          <label className="flex-1 text-xs text-ink-muted">Input (JSON)<textarea className={`${ic} w-full font-mono`} rows={2} value={addInput} onChange={(e) => setAddInput(e.target.value)} /></label>
          <label className="text-xs text-ink-muted">Label<input className={ic} value={addLabel} onChange={(e) => setAddLabel(e.target.value)} placeholder="Pharma" /></label>
          <button type="button" className="btn btn-primary btn-xs" disabled={busy} onClick={add}>Add example</button>
        </div>
      </section>

      {/* Examples */}
      <div className="card overflow-x-auto">
        <div className="border-b border-line px-4 py-2 text-xs text-ink-muted">{total} examples · {labeled} labeled</div>
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-ink-muted"><tr className="border-b border-line"><th className="px-3 py-2 font-medium">Input</th><th className="px-3 py-2 font-medium">Gold label</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Src</th><th className="px-3 py-2"></th></tr></thead>
          <tbody className="divide-y divide-line">
            {examples.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-ink-muted">No examples yet.</td></tr>
            ) : examples.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="px-3 py-2 text-xs text-ink-muted">{inputSummary(e.input)}</td>
                <td className="px-3 py-2"><input className={`${ic} w-36`} defaultValue={labelOf(e)} onBlur={(ev) => { if (ev.target.value.trim() !== labelOf(e)) setLabel(e, ev.target.value); }} placeholder="—" /></td>
                <td className="px-3 py-2"><span className={`chip ${e.status === "labeled" ? "bg-emerald-50 text-emerald-700" : "bg-surface-muted text-ink-muted/70"}`}>{e.status}</span></td>
                <td className="px-3 py-2 text-xs text-ink-muted">{e.source ?? "—"}</td>
                <td className="px-3 py-2 text-right"><button type="button" className="text-xs text-red-500 hover:underline" onClick={() => del(e)}>delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
