import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import { normalizeDomain } from "@/lib/hubspot";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/contacts/clay-webhook — Clay posts enriched people back here (Bearer CLAY_WEBHOOK_SECRET).
// Accepts a batch { company_id, opportunity_id, contacts: [...] } OR a single flat contact row
// (Clay's per-row HTTP action). Upserts by email; sets source 'clay' + enriched_at; preserves
// do_not_contact + hubspot_id; links to the opportunity when given. Respects do-not-contact (a
// flagged person is updated but never re-surfaced for outreach by downstream features).
const contactSchema = z.object({
  email: z.string().trim().email().optional().or(z.literal("")),
  full_name: z.string().trim().nullish(),
  first_name: z.string().trim().nullish(),
  last_name: z.string().trim().nullish(),
  title: z.string().trim().nullish(),
  seniority: z.string().trim().nullish(),
  function: z.string().trim().nullish(),
  linkedin_url: z.string().trim().nullish(),
  location: z.string().trim().nullish(),
  confidence: z.coerce.number().nullish(),
  // Accept any string; we null out non-UUIDs below so a malformed/test company id never drops the
  // person (they save unlinked) or trips the FK.
  company_id: z.string().nullish(),
  opportunity_id: z.string().nullish(),
  // Generic linkage: a person's company domain (native to Clay's People table). When no valid
  // company_id is passed, we resolve the company by matching this domain → companies.domain. Works
  // for ANY company without carrying the app's UUID through Clay.
  company_domain: z.string().nullish(),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asUuid = (v: unknown): string | null => (typeof v === "string" && UUID.test(v) ? v : null);

export async function POST(req: NextRequest) {
  const secret = serverEnv.CLAY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Clay webhook not configured" }, { status: 400 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const topCompany = typeof body.company_id === "string" ? body.company_id : null;
  const topOpp = typeof body.opportunity_id === "string" ? body.opportunity_id : null;
  const topDomain = typeof body.company_domain === "string" ? body.company_domain : null;
  const raw = Array.isArray(body.contacts) ? body.contacts : [body];

  const admin = createAdminClient();
  const now = new Date().toISOString();
  // Resolve a company_id from a domain, memoized so a batch only queries each domain once.
  const domainCache = new Map<string, string | null>();
  const companyIdForDomain = async (raw: string | null | undefined): Promise<string | null> => {
    const dom = normalizeDomain(raw);
    if (!dom) return null;
    if (domainCache.has(dom)) return domainCache.get(dom)!;
    const { data } = await admin.from("companies").select("id").ilike("domain", dom).limit(1).maybeSingle();
    const id = (data?.id as string) ?? null;
    domainCache.set(dom, id);
    return id;
  };
  let upserted = 0, linked = 0, companyLinked = 0; const errors: string[] = [];

  for (const item of raw) {
    const parsed = contactSchema.safeParse(item);
    if (!parsed.success) { errors.push(`row: ${parsed.error.issues[0]?.message}`); continue; }
    const c = parsed.data;
    const email = (c.email || "").toLowerCase().trim();
    if (!email) { errors.push("row without email skipped"); continue; }
    // company_id wins if valid; else resolve by the person's company domain (works for any company).
    const company_id = asUuid(c.company_id) ?? asUuid(topCompany) ?? await companyIdForDomain(c.company_domain ?? topDomain);
    const opportunity_id = asUuid(c.opportunity_id) ?? asUuid(topOpp);

    const row: Record<string, unknown> = {
      email, source: "clay", enriched_at: now, updated_at: now,
      full_name: c.full_name ?? (c.first_name || c.last_name ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : undefined),
      first_name: c.first_name ?? undefined, last_name: c.last_name ?? undefined,
      position: c.title ?? undefined, seniority: c.seniority ?? undefined, function: c.function ?? undefined,
      linkedin_url: c.linkedin_url ?? undefined, location: c.location ?? undefined,
      confidence: c.confidence ?? undefined, company_id: company_id ?? undefined,
    };
    // Strip undefined so an upsert never nulls existing values.
    for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k];

    const { data: up, error } = await admin.from("contacts").upsert(row, { onConflict: "email" }).select("id").maybeSingle();
    if (error) { errors.push(`${email}: ${error.message}`); continue; }
    upserted++;
    if (company_id) companyLinked++;
    if (opportunity_id && up?.id) {
      const { error: le } = await admin.from("opportunity_contacts").upsert(
        { opportunity_id, contact_id: up.id, role: c.function ?? null, source: "clay" },
        { onConflict: "opportunity_id,contact_id" });
      if (le) errors.push(`link ${email}: ${le.message}`); else linked++;
    }
  }

  return NextResponse.json({ ok: true, upserted, companyLinked, linked, errors });
}
