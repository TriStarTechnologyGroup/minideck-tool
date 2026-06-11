// Server-only environment. Do NOT import this from client components.
// Holds secrets (service role key, HubSpot/Plausible/Microlink) — these must never
// reach the browser bundle.
import { z } from "zod";

if (typeof window !== "undefined") {
  throw new Error("env.server.ts was imported in client code — this leaks secrets.");
}

// Everything is optional with safe defaults so the scaffold builds/runs before the
// external services are provisioned. Each integration checks its own keys at call time.
const schema = z.object({
  // Supabase
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(""),
  // HubSpot
  HUBSPOT_TOKEN: z.string().default(""),
  HUBSPOT_PORTAL_ID: z.string().default(""),
  // Optional fallback owner for engagement tasks when the link creator can't be
  // matched to a HubSpot owner. Leave unset to leave such tasks unassigned.
  HUBSPOT_DEFAULT_OWNER_ID: z.string().default(""),
  // Plausible
  PLAUSIBLE_API_KEY: z.string().default(""),
  // Screenshots (Microlink) — optional even in prod (free tier needs no key)
  SCREENSHOT_API_KEY: z.string().default(""),
  // App
  APP_BASE_URL: z.string().default("http://localhost:3000"),
  // Shared secret for the scheduled cron backstop (/api/cron/sweep). Vercel Cron
  // sends it as a Bearer token when set. Leave blank to disable bearer auth (the
  // route then requires an admin session).
  CRON_SECRET: z.string().default(""),
  // Bearer token the prospecting skill uses to POST run output to /api/prospecting/ingest.
  // Leave blank to require an admin session instead.
  PROSPECTING_INGEST_SECRET: z.string().default(""),
  // Anthropic API key — in-app classification + reply drafting for inbound inquiries.
  // Blank → in-app AI disabled (contact-form orgs stay 'unknown' until set).
  ANTHROPIC_API_KEY: z.string().default(""),
  // Public values are also readable server-side
  NEXT_PUBLIC_SUPABASE_URL: z.string().default(""),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().default(""),
});

export const serverEnv = schema.parse(process.env);

/** Per-integration readiness — used by the landing/health page (never exposes values). */
export const integrationStatus = {
  supabase: Boolean(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL &&
      serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      serverEnv.SUPABASE_SERVICE_ROLE_KEY,
  ),
  hubspot: Boolean(serverEnv.HUBSPOT_TOKEN && serverEnv.HUBSPOT_PORTAL_ID),
  plausible: Boolean(serverEnv.PLAUSIBLE_API_KEY),
  screenshots: true, // Microlink free tier needs no key
} as const;
