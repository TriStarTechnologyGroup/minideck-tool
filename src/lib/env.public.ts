// Client-safe public environment.
// Referenced literally (process.env.NEXT_PUBLIC_*) so Next inlines these at build time.
// NEVER put secrets here — anything in this file may ship to the browser.

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
} as const;

/** True when the public Supabase config needed to talk to Auth/DB from the client exists. */
export function hasSupabasePublicEnv(): boolean {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
}
