import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import { SLIDE_SLUGS, slideCount } from "@/lib/slides";
import {
  isHubspotConfigured,
  createEngagementTask,
  updateContactProperties,
  getOwnerIdByEmail,
} from "@/lib/hubspot";
import { rateLimit } from "@/lib/rate-limit";
import { clampSeconds as clamp, computeEngagement } from "@/lib/engagement";

// POST /api/ingest — PUBLIC engagement beacon from track.js (sendBeacon, text/plain).
// Body: { token, surface:"deck"|"artifact", seconds, perSlide }. Cumulative (max-seen).
// On milestone crossings (opened / reached CTA / opened artifact) it fires a HubSpot
// task + writes engagement back to the contact's Minideck properties (best-effort).
// The max-seen merge + milestone logic lives in @/lib/engagement (pure, unit-tested).

const noContent = () => new NextResponse(null, { status: 204 });
const APP = serverEnv.APP_BASE_URL || "https://decks.tristargroup.us";

export async function POST(req: NextRequest) {
  let body: { token?: unknown; surface?: unknown; seconds?: unknown; perSlide?: Record<string, unknown>; kind?: unknown; event?: unknown };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return noContent();
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!/^[0-9A-Za-z]{4,32}$/.test(token)) return noContent();
  // Basic abuse protection: cap beacons per token (heartbeat is ~4/min; this allows bursts).
  if (!rateLimit(`ingest:${token}`, 60, 60_000)) return noContent();
  const surface = body.surface === "artifact" ? "artifact" : "deck";
  const seconds = clamp(body.seconds);

  const admin = createAdminClient();

  // Resolve link → deck + contact (for milestone math + HubSpot).
  const { data: link } = await admin
    .from("links")
    .select(
      "token, created_by, deck:decks(slug, name), contact:contacts(id, first_name, last_name, hubspot_id)",
    )
    .eq("token", token)
    .maybeSingle();
  if (!link) return noContent();
  const deck = link.deck as unknown as { slug: string; name: string } | null;
  const contact = link.contact as unknown as
    | { id: string; first_name: string; last_name: string; hubspot_id: string | null }
    | null;
  const createdBy = (link as unknown as { created_by: string | null }).created_by;

  // Resolve the task owner once (lazily): the link creator's HubSpot owner, matched
  // by their app-login email; falls back to HUBSPOT_DEFAULT_OWNER_ID, else unassigned.
  let _ownerResolved = false;
  let _ownerId: string | null = null;
  async function ownerFor(): Promise<string | null> {
    if (_ownerResolved) return _ownerId;
    _ownerResolved = true;
    if (createdBy) {
      const { data: prof } = await admin.from("profiles").select("email").eq("id", createdBy).maybeSingle();
      if (prof?.email) _ownerId = await getOwnerIdByEmail(prof.email);
    }
    if (!_ownerId && serverEnv.HUBSPOT_DEFAULT_OWNER_ID) _ownerId = serverEnv.HUBSPOT_DEFAULT_OWNER_ID;
    return _ownerId;
  }

  // ── CTA-click beacon (book-a-meeting / inquire / etc.) — strongest intent signal ──
  if (body.kind === "cta") {
    const event = typeof body.event === "string" ? body.event : "";
    if (!/^cta_[a-z0-9_]+$/.test(event)) return noContent();

    const { data: ex } = await admin
      .from("link_engagement")
      .select("cta_clicks, first_seen_at")
      .eq("token", token)
      .maybeSingle();

    const clicks: Record<string, number> = { ...((ex?.cta_clicks as Record<string, number>) ?? {}) };
    const wasFirst = !clicks[event];
    clicks[event] = (clicks[event] ?? 0) + 1;
    const nowTs = new Date().toISOString();
    const highIntent = event === "cta_book_meeting" || event === "cta_inquire";

    if (wasFirst && highIntent && isHubspotConfigured() && contact?.hubspot_id && deck) {
      const name = `${contact.first_name} ${contact.last_name}`.trim() || "A prospect";
      const label = event === "cta_book_meeting" ? "clicked “Book a meeting”" : "clicked “Inquire”";
      try {
        await createEngagementTask(
          contact.hubspot_id,
          `🔥 ${name} ${label} — ${deck.name}`,
          `${name} ${label} on ${deck.name}. This is a top-priority follow-up.\n${APP}/links/${token}`,
          await ownerFor(),
        );
        await updateContactProperties(contact.hubspot_id, {
          minideck_last_cta: event,
          minideck_last_viewed: String(Date.now()),
          minideck_last_deck: deck.name,
        });
      } catch (err) {
        console.error("[ingest] CTA HubSpot alert failed for token", token, err);
      }
    }

    await admin
      .from("link_engagement")
      .upsert({ token, cta_clicks: clicks, first_seen_at: ex?.first_seen_at ?? nowTs, updated_at: nowTs }, { onConflict: "token" });
    return noContent();
  }

  const { data: existing } = await admin
    .from("link_engagement")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  const order = deck ? SLIDE_SLUGS[deck.slug] ?? [] : [];
  const total = deck ? slideCount(deck.slug) : 0;
  const { row: computed, crossed, artifactOpened } = computeEngagement(
    existing,
    { surface, seconds, perSlide: body.perSlide ?? null },
    order,
    total,
    new Date().toISOString(),
  );
  const now = computed.updated_at;
  const row: Record<string, unknown> = { token, ...computed };

  // Fire HubSpot alert + write-back on milestone crossings (best-effort, bounded).
  if (crossed.length && isHubspotConfigured() && contact?.hubspot_id && deck) {
    const name = `${contact.first_name} ${contact.last_name}`.trim() || "A prospect";
    const subject = `🔔 ${name} engaged with ${deck.name}`;
    const bodyText =
      `${name} ${crossed.join("; ")} (${deck.name}).\n` +
      `Furthest slide ${computed.furthest_index}${total ? `/${total}` : ""} · engaged ${Math.round(computed.deck_seconds)}s` +
      `${artifactOpened ? " · opened data page" : ""}.\n` +
      `Full view: ${APP}/links/${token}`;
    try {
      await createEngagementTask(contact.hubspot_id, subject, bodyText, await ownerFor());
      await updateContactProperties(contact.hubspot_id, {
        minideck_last_deck: deck.name,
        minideck_last_viewed: String(Date.now()),
        minideck_slide_depth: String(computed.furthest_index),
        minideck_engaged_seconds: String(Math.round(computed.deck_seconds)),
        minideck_reached_cta: computed.reached_cta ? "true" : "false",
        minideck_artifact_opened: artifactOpened ? "true" : "false",
      });
      // Mark notified so we don't repeat.
      if (crossed.some((c) => c.startsWith("opened the deck"))) row.opened_notified_at = now;
      if (computed.reached_cta) row.cta_notified_at = now;
      if (artifactOpened) row.artifact_notified_at = now;
    } catch (err) {
      // leave *_notified_at unset → retried on the next beacon
      console.error("[ingest] milestone HubSpot alert failed for token", token, err);
    }
  }

  await admin.from("link_engagement").upsert(row, { onConflict: "token" });
  return noContent();
}
