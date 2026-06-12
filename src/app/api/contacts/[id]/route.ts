import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

// Editable contact fields (the unified people record). HubSpot id/url + name come from sync/lead capture.
const patchInput = z.object({
  position: z.string().trim().nullable().optional(),      // = title
  function: z.string().trim().nullable().optional(),
  seniority: z.string().trim().nullable().optional(),
  is_decision_maker: z.boolean().optional(),
  do_not_contact: z.boolean().optional(),
  linkedin_url: z.string().trim().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// PATCH /api/contacts/[id] — edit a contact (signed-in users).
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
    .from("contacts")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, full_name, position, function, seniority, is_decision_maker, do_not_contact, company_id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  return NextResponse.json({ contact: data });
}
