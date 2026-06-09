import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import {
  createEngagementTask,
  updateContactProperties,
  getOwnerIdByEmail,
  isHubspotConfigured,
} from "@/lib/hubspot";

type Admin = ReturnType<typeof createAdminClient>;
const APP = serverEnv.APP_BASE_URL || "https://decks.tristargroup.us";

/**
 * Resolve the HubSpot owner for an engagement task: the link creator's owner
 * (matched by their app-login email), else HUBSPOT_DEFAULT_OWNER_ID, else null.
 */
export async function resolveOwner(admin: Admin, createdBy: string | null): Promise<string | null> {
  let ownerId: string | null = null;
  if (createdBy) {
    const { data: prof } = await admin.from("profiles").select("email").eq("id", createdBy).maybeSingle();
    if (prof?.email) ownerId = await getOwnerIdByEmail(prof.email as string);
  }
  if (!ownerId && serverEnv.HUBSPOT_DEFAULT_OWNER_ID) ownerId = serverEnv.HUBSPOT_DEFAULT_OWNER_ID;
  return ownerId;
}

export interface MilestoneAlert {
  token: string;
  deck: { slug: string; name: string };
  contact: { first_name: string; last_name: string; hubspot_id: string | null };
  createdBy: string | null;
  crossed: string[];
  furthest: number;
  total: number;
  deckSeconds: number;
  artifactOpened: boolean;
  reachedCta: boolean;
}

/**
 * Fire the HubSpot engagement task + contact-property write-back for the crossed
 * milestones, and return the `*_notified_at` flag patch the caller should persist.
 * Throws if HubSpot rejects (the caller decides whether to swallow + retry). Returns
 * an empty patch (no-op) when there's nothing to send or HubSpot isn't usable.
 *
 * Shared by /api/ingest (live beacons) and the cron backstop sweep so both produce
 * identical alerts.
 */
export async function sendMilestoneAlert(admin: Admin, a: MilestoneAlert, now: string): Promise<Record<string, string>> {
  if (!a.crossed.length || !isHubspotConfigured() || !a.contact.hubspot_id) return {};

  const name = `${a.contact.first_name} ${a.contact.last_name}`.trim() || "A prospect";
  const subject = `🔔 ${name} engaged with ${a.deck.name}`;
  const body =
    `${name} ${a.crossed.join("; ")} (${a.deck.name}).\n` +
    `Furthest slide ${a.furthest}${a.total ? `/${a.total}` : ""} · engaged ${Math.round(a.deckSeconds)}s` +
    `${a.artifactOpened ? " · opened data page" : ""}.\n` +
    `Full view: ${APP}/links/${a.token}`;

  await createEngagementTask(a.contact.hubspot_id, subject, body, await resolveOwner(admin, a.createdBy));
  await updateContactProperties(a.contact.hubspot_id, {
    minideck_last_deck: a.deck.name,
    minideck_last_viewed: String(Date.now()),
    minideck_slide_depth: String(a.furthest),
    minideck_engaged_seconds: String(Math.round(a.deckSeconds)),
    minideck_reached_cta: a.reachedCta ? "true" : "false",
    minideck_artifact_opened: a.artifactOpened ? "true" : "false",
  });

  const patch: Record<string, string> = {};
  if (a.crossed.some((c) => c.startsWith("opened the deck"))) patch.opened_notified_at = now;
  if (a.reachedCta) patch.cta_notified_at = now;
  if (a.artifactOpened) patch.artifact_notified_at = now;
  return patch;
}
