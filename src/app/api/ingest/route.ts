import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/ingest — PUBLIC engagement beacon from track.js on the deck sites.
// Called cross-origin via navigator.sendBeacon (Content-Type text/plain → simple request,
// no CORS preflight). Body is JSON text: { token, surface:"deck"|"artifact", seconds, perSlide }.
// Cumulative values; we keep the max seen per token so missed/out-of-order beacons are fine.

const MAX_SECONDS = 86_400; // 24h sanity cap
const clamp = (n: unknown) =>
  Math.min(MAX_SECONDS, Math.max(0, Math.floor(Number(n) || 0)));
const noContent = () => new NextResponse(null, { status: 204 });

export async function POST(req: NextRequest) {
  let body: {
    token?: unknown;
    surface?: unknown;
    seconds?: unknown;
    perSlide?: Record<string, unknown>;
  };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return noContent();
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!/^[0-9A-Za-z]{4,32}$/.test(token)) return noContent();
  const surface = body.surface === "artifact" ? "artifact" : "deck";
  const seconds = clamp(body.seconds);

  const admin = createAdminClient();

  // Only accept beacons for tokens that exist (limits abuse to real links).
  const { data: link } = await admin.from("links").select("token").eq("token", token).maybeSingle();
  if (!link) return noContent();

  const { data: existing } = await admin
    .from("link_engagement")
    .select("deck_seconds, artifact_seconds, per_slide")
    .eq("token", token)
    .maybeSingle();

  const row: Record<string, unknown> = {
    token,
    deck_seconds: existing?.deck_seconds ?? 0,
    artifact_seconds: existing?.artifact_seconds ?? 0,
    per_slide: (existing?.per_slide as Record<string, number>) ?? {},
    updated_at: new Date().toISOString(),
  };

  if (surface === "artifact") {
    row.artifact_seconds = Math.max(row.artifact_seconds as number, seconds);
  } else {
    row.deck_seconds = Math.max(row.deck_seconds as number, seconds);
    const merged = { ...(row.per_slide as Record<string, number>) };
    if (body.perSlide && typeof body.perSlide === "object") {
      for (const [slug, v] of Object.entries(body.perSlide)) {
        if (/^[a-z0-9-]{1,64}$/.test(slug)) merged[slug] = Math.max(merged[slug] ?? 0, clamp(v));
      }
    }
    row.per_slide = merged;
  }

  await admin.from("link_engagement").upsert(row, { onConflict: "token" });
  return noContent();
}
