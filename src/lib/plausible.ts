import "server-only";
import { serverEnv } from "@/lib/env.server";

const ENDPOINT = "https://plausible.io/api/v2/query";

export function isPlausibleConfigured(): boolean {
  return Boolean(serverEnv.PLAUSIBLE_API_KEY);
}

export interface LinkStats {
  opened: boolean;
  views: number; // pageviews (deck + artifact loads) — event-level, correctly token-scoped
  lastSeen: string | null; // YYYY-MM-DD (day granularity)
  furthestSlide: number; // max slide_index from Slide Reached
  slides: { slide: string; views: number }[]; // per-slide view counts (desc)
  artifactViews: number; // Section View (section=artifact) events
}

type QueryBody = Record<string, unknown>;
type Row = { dimensions?: string[]; metrics?: number[] };

async function query(body: QueryBody): Promise<{ results: Row[] }> {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serverEnv.PLAUSIBLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Plausible ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/**
 * Per-link stats for one or more tokens on a Plausible site, in a fixed number of
 * grouped queries (dimensioned by `event:props:token`) rather than 5 per token.
 * Returns a map token → LinkStats; tokens with no events get a zeroed entry.
 *
 * IMPORTANT: only EVENT-LEVEL metrics (pageviews, events) can be filtered by an
 * event-level custom property like `token`. Session-level metrics (visit_duration,
 * bounce_rate, visits, visitors) are NOT correctly scoped by `event:props:token` —
 * Plausible returns the site-wide value — so we deliberately do not use them here.
 */
export async function getDeckLinkStats(
  siteId: string,
  tokens: string[],
): Promise<Record<string, LinkStats>> {
  const out: Record<string, LinkStats> = {};
  for (const t of tokens) {
    out[t] = { opened: false, views: 0, lastSeen: null, furthestSlide: 0, slides: [], artifactViews: 0 };
  }
  if (tokens.length === 0) return out;

  const tokenFilter = ["is", "event:props:token", tokens];
  const tok = "event:props:token";
  const base = { site_id: siteId, date_range: "all" as const };

  const [agg, byDay, reached, slideViews, artifact] = await Promise.all([
    query({ ...base, metrics: ["pageviews"], dimensions: [tok], filters: [tokenFilter] }),
    query({ ...base, metrics: ["pageviews"], dimensions: [tok, "time:day"], filters: [tokenFilter] }),
    query({ ...base, metrics: ["events"], dimensions: [tok, "event:props:slide_index"], filters: [tokenFilter, ["is", "event:name", ["Slide Reached"]]] }),
    query({ ...base, metrics: ["events"], dimensions: [tok, "event:props:slide"], filters: [tokenFilter, ["is", "event:name", ["Slide View"]]] }),
    query({ ...base, metrics: ["events"], dimensions: [tok], filters: [tokenFilter, ["is", "event:name", ["Section View"]], ["is", "event:props:section", ["artifact"]]] }),
  ]);

  for (const r of agg.results) {
    const t = r.dimensions?.[0];
    if (t && out[t]) out[t].views = r.metrics?.[0] ?? 0;
  }
  for (const r of byDay.results) {
    const t = r.dimensions?.[0];
    const day = r.dimensions?.[1];
    if (t && out[t] && day && (r.metrics?.[0] ?? 0) > 0) {
      const ls = out[t].lastSeen;
      if (!ls || day > ls) out[t].lastSeen = day;
    }
  }
  for (const r of reached.results) {
    const t = r.dimensions?.[0];
    const idx = parseInt(r.dimensions?.[1] ?? "0", 10);
    if (t && out[t] && Number.isFinite(idx) && idx > out[t].furthestSlide) out[t].furthestSlide = idx;
  }
  for (const r of slideViews.results) {
    const t = r.dimensions?.[0];
    if (t && out[t]) out[t].slides.push({ slide: r.dimensions?.[1] ?? "?", views: r.metrics?.[0] ?? 0 });
  }
  for (const r of artifact.results) {
    const t = r.dimensions?.[0];
    if (t && out[t]) out[t].artifactViews = r.metrics?.[0] ?? 0;
  }
  for (const t of tokens) {
    out[t].opened = out[t].views > 0;
    out[t].slides.sort((a, b) => b.views - a.views);
  }
  return out;
}
