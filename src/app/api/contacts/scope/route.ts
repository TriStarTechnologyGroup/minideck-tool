import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import { requireApiUser } from "@/lib/api";

export const dynamic = "force-dynamic";

// POST /api/contacts/scope { company_id, opportunity_id? } — push a scope request to Clay (the
// intake webhook). Clay finds + enriches decision-makers matching our active ICP roles and posts
// them back to /api/contacts/clay-webhook. On-demand only (cost-conscious): you trigger this for a
// company/opportunity you specifically want to engage.
const input = z.object({
  company_id: z.string().uuid(),
  opportunity_id: z.string().uuid().nullish(),
  limit: z.number().int().min(1).max(2000).optional(),
});

export async function POST(req: NextRequest) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  if (!serverEnv.CLAY_INTAKE_WEBHOOK_URL) return NextResponse.json({ error: "Clay is not configured (CLAY_INTAKE_WEBHOOK_URL unset)." }, { status: 400 });

  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { company_id, opportunity_id } = parsed.data;
  const limit = parsed.data.limit ?? 100;

  const admin = createAdminClient();
  const [{ data: company }, { data: roles }] = await Promise.all([
    admin.from("companies").select("id, name, domain, website, type, verified").eq("id", company_id).maybeSingle(),
    admin.from("target_roles").select("function, title_keywords, seniority_floor").eq("active", true).order("priority", { ascending: false }),
  ]);
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // Curated, capped title set: round-robin ONE keyword per active role (priority order) per pass,
  // deduped, capped. Dumping all ~30 ICP keywords over-constrains Clay's people search → 0 results;
  // a tight high-signal set (one term per function first) returns the right people. Tune via /research/roles.
  const MAX_TITLE_TERMS = 12;
  const roleKeywords = (roles ?? []).map((r) => (r.title_keywords ?? "").split(",").map((s: string) => s.trim()).filter(Boolean));
  const titleTerms: string[] = [];
  const seenKw = new Set<string>();
  for (let pass = 0; titleTerms.length < MAX_TITLE_TERMS; pass++) {
    let added = false;
    for (const kws of roleKeywords) {
      if (pass >= kws.length) continue;
      const k = kws[pass], key = k.toLowerCase();
      if (seenKw.has(key)) continue;
      seenKw.add(key); titleTerms.push(k); added = true;
      if (titleTerms.length >= MAX_TITLE_TERMS) break;
    }
    if (!added) break; // every role exhausted
  }

  const payload = {
    request_id: crypto.randomUUID(),
    company_id: company.id,
    company_name: company.name,
    domain: company.domain || company.website || null,
    company_type: company.type,
    verified: company.verified,
    opportunity_id: opportunity_id ?? null,
    // Max people per company for Clay's Find People (cost control + the expandable dataset).
    limit,
    // Curated title set (≤12 high-signal terms) for Clay's people search; structured roles still sent too.
    title_keywords: titleTerms.join(", "),
    functions: (roles ?? []).map((r) => r.function).filter(Boolean).join(", "),
    target_roles: (roles ?? []).map((r) => ({ function: r.function, title_keywords: r.title_keywords, seniority_floor: r.seniority_floor })),
    callback_url: `${serverEnv.APP_BASE_URL}/api/contacts/clay-webhook`,
  };

  try {
    const res = await fetch(serverEnv.CLAY_INTAKE_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) return NextResponse.json({ error: `Clay intake responded ${res.status}: ${(await res.text()).slice(0, 300)}` }, { status: 502 });
    // Remember the cap requested so the company page can show "more available" + offer to expand.
    await admin.from("companies").update({ contacts_scope_limit: limit }).eq("id", company_id);
    return NextResponse.json({ ok: true, request_id: payload.request_id, roles: payload.target_roles.length, limit });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "scope request failed" }, { status: 502 });
  }
}
