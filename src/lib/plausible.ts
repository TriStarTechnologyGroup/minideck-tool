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
 * Lifetime per-link stats for one token on a given Plausible site.
 *
 * IMPORTANT: only EVENT-LEVEL metrics (pageviews, events) can be filtered by an
 * event-level custom property like `token`. Session-level metrics (visit_duration,
 * bounce_rate, visits, visitors) are NOT correctly scoped by `event:props:token` —
 * Plausible returns the site-wide value — so we deliberately do not use them here.
 */
export async function getLinkStats(siteId: string, token: string): Promise<LinkStats> {
  const tokenFilter = ["is", "event:props:token", [token]];
  const base = { site_id: siteId, date_range: "all" as const };

  const [agg, byDay, reached, slideViews, artifact] = await Promise.all([
    query({ ...base, metrics: ["pageviews"], filters: [tokenFilter] }),
    query({ ...base, metrics: ["pageviews"], dimensions: ["time:day"], filters: [tokenFilter] }),
    query({ ...base, metrics: ["events"], dimensions: ["event:props:slide_index"], filters: [tokenFilter, ["is", "event:name", ["Slide Reached"]]] }),
    query({ ...base, metrics: ["events"], dimensions: ["event:props:slide"], filters: [tokenFilter, ["is", "event:name", ["Slide View"]]] }),
    query({ ...base, metrics: ["events"], filters: [tokenFilter, ["is", "event:name", ["Section View"]], ["is", "event:props:section", ["artifact"]]] }),
  ]);

  const views = agg.results[0]?.metrics?.[0] ?? 0;

  let lastSeen: string | null = null;
  for (const row of byDay.results) {
    const day = row.dimensions?.[0];
    if (day && (row.metrics?.[0] ?? 0) > 0 && (!lastSeen || day > lastSeen)) lastSeen = day;
  }

  let furthestSlide = 0;
  for (const row of reached.results) {
    const idx = parseInt(row.dimensions?.[0] ?? "0", 10);
    if (Number.isFinite(idx) && idx > furthestSlide) furthestSlide = idx;
  }

  const slides = slideViews.results
    .map((r) => ({ slide: r.dimensions?.[0] ?? "?", views: r.metrics?.[0] ?? 0 }))
    .sort((a, b) => b.views - a.views);

  return {
    opened: views > 0,
    views,
    lastSeen,
    furthestSlide,
    slides,
    artifactViews: artifact.results[0]?.metrics?.[0] ?? 0,
  };
}
