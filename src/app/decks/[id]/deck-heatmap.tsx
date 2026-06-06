import { createClient } from "@/lib/supabase/server";
import { SLIDE_SLUGS, slideLabel } from "@/lib/slides";

type EngRow = { per_slide: Record<string, number>; furthest_index: number };

// Aggregate per-slide engagement across ALL prospects for a deck → reach funnel + avg dwell.
export default async function DeckHeatmap({ deckId, deckSlug }: { deckId: string; deckSlug: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("link_engagement")
    .select("per_slide, furthest_index, link:links!inner(deck_id)")
    .eq("link.deck_id", deckId);

  const rows = (data ?? []) as unknown as EngRow[];
  const order = SLIDE_SLUGS[deckSlug] ?? [];
  const prospects = rows.length;

  if (prospects === 0 || order.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line px-6 py-8 text-center text-sm text-ink-muted">
        No audience engagement yet — this fills in as prospects open their links.
      </p>
    );
  }

  const slides = order.map((slug, i) => {
    const reached = rows.filter((r) => (r.furthest_index ?? 0) >= i + 1).length;
    const secs = rows.map((r) => r.per_slide?.[slug] ?? 0).filter((s) => s > 0);
    const avgSec = secs.length ? Math.round(secs.reduce((a, b) => a + b, 0) / secs.length) : 0;
    return { slug, reachedPct: Math.round((reached / prospects) * 100), avgSec, reached };
  });
  const maxAvg = Math.max(1, ...slides.map((s) => s.avgSec));

  return (
    <div className="card p-4">
      <p className="mb-3 text-xs text-ink-muted">
        {prospects} engaged prospect{prospects === 1 ? "" : "s"} · % reached each slide (drop-off) and average dwell.
      </p>
      <div className="space-y-1.5">
        {slides.map((s, i) => (
          <div key={s.slug} className="flex items-center gap-3 text-sm">
            <span className="w-5 text-right text-xs text-ink-muted/60">{i + 1}</span>
            <span className="w-44 shrink-0 truncate text-ink">{slideLabel(s.slug)}</span>
            <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-primary/30" style={{ width: `${s.reachedPct}%` }} />
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary"
                style={{ width: `${Math.round((s.avgSec / maxAvg) * s.reachedPct)}%` }}
                title={`avg ${s.avgSec}s`}
              />
            </div>
            <span className="w-28 shrink-0 text-right text-xs text-ink-muted">
              {s.reachedPct}% · {s.avgSec}s avg
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-muted/70">
        Light bar = % of prospects who reached the slide; solid = relative average dwell. Big drop-offs or
        skipped slides are edit candidates — revise on a branch and collect comments on the preview.
      </p>
    </div>
  );
}
