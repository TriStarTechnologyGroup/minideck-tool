import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LLM_AREAS, AREA_LABEL, MODELS, DEFAULT_MODEL } from "@/lib/llm";
import ModelsForm, { type ModelRow } from "./models-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI models — Minideck" };

export default async function ModelsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("model_config").select("area, model, effort");
  const byArea = new Map((data ?? []).map((r) => [r.area as string, r]));
  const rows: ModelRow[] = LLM_AREAS.map((a) => ({
    area: a,
    label: AREA_LABEL[a],
    model: (byArea.get(a)?.model as string) ?? DEFAULT_MODEL,
  }));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <header>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-1 text-3xl">AI models</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Choose the Anthropic model for each LLM feature. Defaults to Opus 4.8. Higher tiers cost more
          per call — use the model bench (coming) to pick the best quality-per-dollar for each area.
        </p>
      </header>
      <ModelsForm rows={rows} models={MODELS.map((m) => ({ id: m.id, label: m.label }))} />
    </main>
  );
}
