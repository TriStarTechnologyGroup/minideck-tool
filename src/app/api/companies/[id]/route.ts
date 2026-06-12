import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { COMPANY_TYPES } from "@/lib/company-types";

type Ctx = { params: Promise<{ id: string }> };

// Editable company fields. `type` is the primary one (the classification enum); the rest are
// convenience edits for the directory. HubSpot-derived fields stay read-mostly here.
const patchInput = z.object({
  type: z.enum(COMPANY_TYPES).optional(),
  name: z.string().trim().min(1).optional(),
  domain: z.string().trim().nullable().optional(),
  website: z.string().trim().nullable().optional(),
  industry: z.string().trim().nullable().optional(),
  owner: z.string().trim().nullable().optional(),
  notes: z.string().nullable().optional(),
  relevant: z.boolean().optional(),
});

// PATCH /api/companies/[id] — edit a company (signed-in users). Primarily used to set/correct the
// company `type`. Writes go through the service-role client; HubSpot sync of `type` is handled by
// the company-sync job, not here.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  const { id } = await params;
  const parsed = patchInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Invalid or empty update", issues: parsed.success ? undefined : parsed.error.issues }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("companies")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, name, type, domain, industry, owner, relevant")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  await logAudit({ actorId: guard.profile.id, actorEmail: guard.profile.email, action: "company.update", targetType: "company", target: id });
  return NextResponse.json({ company: data });
}
