import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { classifierAreas, judgeAreas, assertionAreas } from "@/lib/evals";
import EvalsCreate from "./evals-create";

export const dynamic = "force-dynamic";
export const metadata = { title: "Evals — Minideck" };

type DS = { id: string; name: string; area: string; eval_type: string; created_at: string };

export default async function EvalsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: datasets }, { data: examples }, { data: runs }] = await Promise.all([
    supabase.from("eval_datasets").select("id, name, area, eval_type, created_at").order("created_at", { ascending: false }),
    supabase.from("eval_examples").select("dataset_id, status").limit(20000),
    supabase.from("eval_runs").select("dataset_id, status, metrics, created_at").eq("status", "done").order("created_at", { ascending: false }).limit(2000),
  ]);
  const counts = new Map<string, { total: number; labeled: number }>();
  for (const e of examples ?? []) { const c = counts.get(e.dataset_id as string) ?? { total: 0, labeled: 0 }; c.total++; if (e.status === "labeled") c.labeled++; counts.set(e.dataset_id as string, c); }
  const latestAcc = new Map<string, number>();
  for (const r of runs ?? []) { const k = r.dataset_id as string; if (!latestAcc.has(k)) { const a = (r.metrics as { accuracy?: number } | null)?.accuracy; if (a != null) latestAcc.set(k, a); } }

  const list = (datasets ?? []) as DS[];

  function stateBadge(total: number, labeled: number) {
    if (total === 0) return <span className="chip bg-surface-muted text-ink-muted/70">empty</span>;
    if (labeled < total) return <span className="chip bg-amber-50 text-amber-700">building · {labeled}/{total}</span>;
    return <span className="chip bg-emerald-50 text-emerald-700">ready · {labeled}</span>;
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <header>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-1 text-3xl">Evals</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Golden datasets for measuring decision quality (LLM + deterministic). Author examples here or
          import a CSV, label them, then run them. Four scorers: classification (vs the production
          classifier), judge (LLM rubric), assertion (deterministic guardrails), and match (F1 vs a gold set).
        </p>
      </header>

      <EvalsCreate areas={[...new Set([...classifierAreas(), ...judgeAreas(), ...assertionAreas(), "inbound_match", "dedup_match"])]} />

      {list.length === 0 ? (
        <div className="card px-6 py-14 text-center text-sm text-ink-muted">
          No golden datasets yet. Create one above — pick an area + type, then add examples manually or upload a CSV.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr><th className="px-4 py-2.5 font-medium">Dataset</th><th className="px-4 py-2.5 font-medium">Area</th><th className="px-4 py-2.5 font-medium">Type</th><th className="px-4 py-2.5 font-medium">State</th><th className="px-4 py-2.5 text-right font-medium">Latest accuracy</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((d) => {
                const c = counts.get(d.id) ?? { total: 0, labeled: 0 };
                const acc = latestAcc.get(d.id);
                return (
                  <tr key={d.id} className="transition-colors hover:bg-surface-subtle">
                    <td className="px-4 py-2.5"><Link href={`/admin/evals/${d.id}`} className="font-medium text-ink hover:text-link">{d.name}</Link></td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">{d.area}</td>
                    <td className="px-4 py-2.5 text-ink-muted">{d.eval_type}</td>
                    <td className="px-4 py-2.5">{stateBadge(c.total, c.labeled)}</td>
                    <td className="px-4 py-2.5 text-right text-ink">{acc != null ? `${(acc * 100).toFixed(1)}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
