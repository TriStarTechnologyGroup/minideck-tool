import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";

const BUCKET = "deck-thumbnails";

/**
 * Capture a screenshot of `url` via Microlink, store it in the deck-thumbnails bucket
 * under `<slug>.png`, and return its public URL (cache-busted). Returns null on failure
 * so callers can degrade gracefully (deck still created without a thumbnail).
 */
export async function captureAndStore(slug: string, url: string): Promise<string | null> {
  const bytes = await fetchScreenshot(url);
  if (!bytes) return null;

  const admin = createAdminClient();
  const path = `${slug}.png`;
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: true });
  if (error) return null;

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  // Cache-bust so an updated screenshot for the same slug isn't served stale.
  return `${data.publicUrl}?v=${Date.now()}`;
}

async function fetchScreenshot(target: string): Promise<Buffer | null> {
  const params = new URLSearchParams({
    url: target,
    screenshot: "true",
    meta: "false",
    "viewport.width": "1280",
    "viewport.height": "800",
    type: "png",
  });
  const endpoint = `https://api.microlink.io/?${params.toString()}`;
  const headers: Record<string, string> = serverEnv.SCREENSHOT_API_KEY
    ? { "x-api-key": serverEnv.SCREENSHOT_API_KEY }
    : {};

  const res = await fetch(endpoint, { headers });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: { screenshot?: { url?: string } } };
  const shotUrl = json?.data?.screenshot?.url;
  if (!shotUrl) return null;

  const img = await fetch(shotUrl);
  if (!img.ok) return null;
  return Buffer.from(await img.arrayBuffer());
}
