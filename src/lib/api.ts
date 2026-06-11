import { NextResponse, type NextRequest } from "next/server";
import { getProfile, type Profile } from "@/lib/auth";
import { serverEnv } from "@/lib/env.server";

type Guard =
  | { profile: Profile; error?: undefined }
  | { profile?: undefined; error: NextResponse };

/** Require a signed-in user in an API route. Returns the profile or a 401 Response. */
export async function requireApiUser(): Promise<Guard> {
  const profile = await getProfile();
  if (!profile) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { profile };
}

/** Require an admin in an API route. Returns the profile or a 401/403 Response. */
export async function requireApiAdmin(): Promise<Guard> {
  const profile = await getProfile();
  if (!profile) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (profile.role !== "admin")
    return { error: NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 }) };
  return { profile };
}

/**
 * Auth for prospecting endpoints: the headless skill's bearer PROSPECTING_INGEST_SECRET,
 * or an admin session (manual use). Returns null when authorized, else a 401/403 Response.
 */
export async function requireProspectingAccess(req: NextRequest): Promise<NextResponse | null> {
  const secret = serverEnv.PROSPECTING_INGEST_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return null;
  const guard = await requireApiAdmin();
  return guard.error ?? null;
}
