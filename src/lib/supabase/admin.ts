import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env.server";
import { publicEnv } from "@/lib/env.public";

/**
 * Service-role Supabase client — BYPASSES RLS. Server-side only, behind validated
 * API routes. Use for privileged writes (link/contact/deck mutations) where the
 * route has already enforced the caller's role.
 */
export function createAdminClient() {
  if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createSupabaseClient(
    publicEnv.supabaseUrl,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
