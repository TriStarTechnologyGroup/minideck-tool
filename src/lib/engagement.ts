// Pure milestone/engagement computation for the public /api/ingest beacon. Kept free
// of I/O so the max-seen merge + milestone-crossing logic can be unit-tested in
// isolation (the route stays a thin DB-read → compute → DB-write + alert wrapper).

export const MAX_SECONDS = 86_400;

/** Clamp an untrusted seconds value to a sane, non-negative integer. */
export const clampSeconds = (n: unknown): number =>
  Math.min(MAX_SECONDS, Math.max(0, Math.floor(Number(n) || 0)));

const SLUG_RE = /^[a-z0-9-]{1,64}$/;

export interface ExistingEngagement {
  deck_seconds?: number | null;
  artifact_seconds?: number | null;
  per_slide?: Record<string, number> | null;
  furthest_index?: number | null;
  reached_cta?: boolean | null;
  first_seen_at?: string | null;
  opened_notified_at?: string | null;
  cta_notified_at?: string | null;
  artifact_notified_at?: string | null;
}

export interface Beacon {
  surface: "deck" | "artifact";
  seconds: number; // already clamped by the caller
  perSlide?: Record<string, unknown> | null;
}

export interface EngagementRow {
  deck_seconds: number;
  artifact_seconds: number;
  per_slide: Record<string, number>;
  furthest_index: number;
  reached_cta: boolean;
  first_seen_at: string;
  opened_notified_at: string | null;
  cta_notified_at: string | null;
  artifact_notified_at: string | null;
  updated_at: string;
}

export interface ComputedEngagement {
  row: EngagementRow;
  crossed: string[]; // milestones newly crossed AND not yet notified
  artifactOpened: boolean; // true even when artifact_seconds is still 0
}

/**
 * Merge a beacon into the existing engagement row using MAX-SEEN semantics —
 * beacons are cumulative and can arrive out of order, so no value ever regresses —
 * and determine which alert milestones are newly crossed and not yet notified.
 *
 * Pure: the caller passes `now` (ISO) and the deck's slide `order`/`total`, so the
 * result is fully deterministic.
 */
/**
 * Milestones that are TRUE in the persisted row but were never notified — the
 * condition the cron backstop sweep retries. Unlike the per-beacon `crossed`
 * (which gates "opened" on the first beacon), this keys purely off stored state,
 * so it also recovers an "opened" alert that failed after the first beacon.
 */
export function pendingMilestones(row: ExistingEngagement): string[] {
  const out: string[] = [];
  if (row.first_seen_at && !row.opened_notified_at) out.push("opened the deck");
  if (row.reached_cta && !row.cta_notified_at) out.push("reached the call-to-action");
  if ((row.artifact_seconds ?? 0) > 0 && !row.artifact_notified_at) out.push("opened the data/example page");
  return out;
}

export function computeEngagement(
  existing: ExistingEngagement | null,
  beacon: Beacon,
  order: string[],
  total: number,
  now: string,
): ComputedEngagement {
  // Per-slide seconds: max-seen, deck surface only, slug-validated.
  const perSlide: Record<string, number> = { ...(existing?.per_slide ?? {}) };
  if (beacon.surface === "deck" && beacon.perSlide && typeof beacon.perSlide === "object") {
    for (const [slug, v] of Object.entries(beacon.perSlide)) {
      if (SLUG_RE.test(slug)) perSlide[slug] = Math.max(perSlide[slug] ?? 0, clampSeconds(v));
    }
  }

  // Furthest slide reached = highest 1-based index of any slide we have time for.
  let furthest = existing?.furthest_index ?? 0;
  for (const slug of Object.keys(perSlide)) {
    const idx = order.indexOf(slug);
    if (idx + 1 > furthest) furthest = idx + 1;
  }

  const reachedCta = (existing?.reached_cta ?? false) || (total > 0 && furthest >= total);
  const artifactOpened = beacon.surface === "artifact" || (existing?.artifact_seconds ?? 0) > 0;

  const deckSeconds =
    beacon.surface === "deck"
      ? Math.max(existing?.deck_seconds ?? 0, beacon.seconds)
      : existing?.deck_seconds ?? 0;
  const artifactSeconds =
    beacon.surface === "artifact"
      ? Math.max(existing?.artifact_seconds ?? 0, beacon.seconds)
      : existing?.artifact_seconds ?? 0;

  // A milestone fires once: it must be newly true AND not already notified.
  const crossed: string[] = [];
  const isFirst = !existing?.first_seen_at;
  if (isFirst && !existing?.opened_notified_at) crossed.push("opened the deck");
  if (reachedCta && !existing?.cta_notified_at) crossed.push("reached the call-to-action");
  if (artifactOpened && !existing?.artifact_notified_at) crossed.push("opened the data/example page");

  return {
    row: {
      deck_seconds: deckSeconds,
      artifact_seconds: artifactSeconds,
      per_slide: perSlide,
      furthest_index: furthest,
      reached_cta: reachedCta,
      first_seen_at: existing?.first_seen_at ?? now,
      opened_notified_at: existing?.opened_notified_at ?? null,
      cta_notified_at: existing?.cta_notified_at ?? null,
      artifact_notified_at: existing?.artifact_notified_at ?? null,
      updated_at: now,
    },
    crossed,
    artifactOpened,
  };
}
