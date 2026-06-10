import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ScoringModelForm, { type Weight } from "./scoring-model-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scoring model — Minideck Admin" };

export default async function AdminScoringPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("scoring_model").select("component, weight_max, description, sort_order").order("sort_order");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <header>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-1 text-3xl">Scoring model</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The global opportunity-scoring weights. The prospecting skill reads these, so changes take
          effect on the next run/rescore — they don&apos;t retroactively change already-scored opportunities.
        </p>
      </header>
      <ScoringModelForm weights={(data ?? []) as Weight[]} />
    </main>
  );
}
