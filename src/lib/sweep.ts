import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { slideCount } from "@/lib/slides";
import { pendingMilestones, type ExistingEngagement } from "@/lib/engagement";
import { sendMilestoneAlert } from "@/lib/alerts";

type Admin = ReturnType<typeof createAdminClient>;

export interface SweepResult {
  scanned: number; // rows with at least one pending milestone
  sent: number; // rows for which an alert fired and flags were set
  failed: number; // rows where HubSpot rejected (left for the next sweep)
  skipped: number; // rows without a usable deck/contact/hubspot_id
}

interface EngRow extends ExistingEngagement {
  token: string;
}

/**
 * Backstop for milestone alerts that the live /api/ingest path never delivered —
 * e.g. HubSpot was down when the beacon arrived and no later beacon retried it.
 *
 * Considers only rows last updated before `now - graceMs` so it never races an
 * in-flight session, and caps the batch with `limit`. Idempotent: a row whose
 * alert already fired has its `*_notified_at` set, so `pendingMilestones` skips it.
 */
export async function sweepStaleAlerts(
  admin: Admin,
  opts: { now: string; graceMs?: number; limit?: number },
): Promise<SweepResult> {
  const graceMs = opts.graceMs ?? 10 * 60 * 1000; // 10 min — let live beacons settle first
  const limit = opts.limit ?? 200;
  const cutoff = new Date(Date.parse(opts.now) - graceMs).toISOString();

  const { data: rows } = await admin
    .from("link_engagement")
    .select(
      "token, deck_seconds, artifact_seconds, furthest_index, reached_cta, first_seen_at, opened_notified_at, cta_notified_at, artifact_notified_at",
    )
    .lt("updated_at", cutoff)
    .or("opened_notified_at.is.null,cta_notified_at.is.null,artifact_notified_at.is.null")
    .order("updated_at", { ascending: true })
    .limit(limit);

  const result: SweepResult = { scanned: 0, sent: 0, failed: 0, skipped: 0 };

  for (const row of (rows ?? []) as EngRow[]) {
    const crossed = pendingMilestones(row);
    if (!crossed.length) continue;
    result.scanned++;

    const { data: link } = await admin
      .from("links")
      .select("created_by, deck:decks(slug, name), contact:contacts(first_name, last_name, hubspot_id)")
      .eq("token", row.token)
      .maybeSingle();
    const deck = link?.deck as unknown as { slug: string; name: string } | null;
    const contact = link?.contact as unknown as
      | { first_name: string; last_name: string; hubspot_id: string | null }
      | null;
    if (!deck || !contact?.hubspot_id) {
      result.skipped++;
      continue;
    }

    try {
      const patch = await sendMilestoneAlert(
        admin,
        {
          token: row.token,
          deck,
          contact,
          createdBy: (link as { created_by: string | null }).created_by,
          crossed,
          furthest: row.furthest_index ?? 0,
          total: slideCount(deck.slug),
          deckSeconds: row.deck_seconds ?? 0,
          artifactOpened: (row.artifact_seconds ?? 0) > 0,
          reachedCta: row.reached_cta ?? false,
        },
        opts.now,
      );
      if (Object.keys(patch).length) {
        await admin.from("link_engagement").update(patch).eq("token", row.token);
        result.sent++;
      } else {
        result.skipped++;
      }
    } catch (err) {
      console.error("[sweep] milestone alert failed for token", row.token, err);
      result.failed++;
    }
  }

  return result;
}
