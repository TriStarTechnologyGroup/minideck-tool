import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MODELS, LLM_AREAS } from "@/lib/llm";
import { classifierAreas, assertionAreas, judgeAreas } from "@/lib/evals";
import { harvestAreas } from "@/lib/eval-harvest";
import DatasetDetail, { type Example, type Dataset, type Run } from "./dataset-detail";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export default async function EvalDatasetPage({ params }: Ctx) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const { data: ds } = await supabase.from("eval_datasets").select("id, name, area, eval_type, description").eq("id", id).maybeSingle();
  if (!ds) notFound();

  const [{ data: examples }, { data: runs }] = await Promise.all([
    supabase.from("eval_examples").select("id, input, expected, status, source, notes").eq("dataset_id", id).order("created_at").limit(5000),
    supabase.from("eval_runs").select("id, model, status, metrics, n_examples, n_scored, error, created_at, bench_group").eq("dataset_id", id).order("created_at", { ascending: false }).limit(40),
  ]);

  const area = ds.area as string;
  const type = ds.eval_type as string;
  // Runnable: the scorer for this (type, area) exists. Benchable: it's model-backed (a model choice
  // is meaningful). match runs deterministically on offline predictions, so it's runnable here too.
  const benchable = (type === "classification" && classifierAreas().includes(area)) || (type === "judge" && judgeAreas().includes(area));
  const runnable = benchable || (type === "assertion" && assertionAreas().includes(area)) || type === "match";
  // Judge model is the global eval_judge slot; otherwise the area is its own model slot (if any).
  const setDefaultArea = type === "judge" ? "eval_judge" : area;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/admin/evals" className="text-sm text-link hover:underline">← Evals</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl">{(ds as Dataset).name}</h1>
          <span className="chip bg-surface-muted text-nav font-mono text-xs">{ds.area}</span>
          <span className="chip bg-surface-muted text-ink-muted">{ds.eval_type}</span>
        </div>
        {ds.description && <p className="mt-1 text-sm text-ink-muted">{ds.description}</p>}
      </div>
      <DatasetDetail
        dataset={ds as Dataset}
        initialExamples={(examples ?? []) as Example[]}
        runs={(runs ?? []) as Run[]}
        models={MODELS.map((m) => ({ id: m.id, label: m.label }))}
        runnable={runnable}
        benchable={benchable}
        setDefaultArea={setDefaultArea}
        canSetDefault={LLM_AREAS.includes(setDefaultArea as (typeof LLM_AREAS)[number])}
        harvestable={harvestAreas().includes(area)}
      />
    </main>
  );
}
