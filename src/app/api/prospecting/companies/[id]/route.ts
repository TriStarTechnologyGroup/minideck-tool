import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProspectingAccess } from "@/lib/api";

// JSON detail + cascading delete for a prospecting company. Auth: bearer or admin.

// GET /api/prospecting/companies/[id] — company + its drug_programs + opportunities (JSON).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireProspectingAccess(req);
  if (denied) return denied;
  const { id } = await params;
  const admin = createAdminClient();
  const { data: company, error } = await admin.from("companies").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [{ data: programs }, { data: opportunities }] = await Promise.all([
    admin.from("drug_programs").select("id, asset_name, modality, target, highest_phase").eq("company_id", id).order("asset_name"),
    admin.from("opportunities").select("id, asset_name, asset_key, run_label, fit_score, fit_tier").eq("company_id", id).order("fit_score", { ascending: false }),
  ]);
  return NextResponse.json({ company, drug_programs: programs ?? [], opportunities: opportunities ?? [] });
}

// DELETE /api/prospecting/companies/[id] — delete the company and all dependent rows
// (drug_programs + opportunities + their children all cascade from the company row).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireProspectingAccess(req);
  if (denied) return denied;
  const { id } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin.from("companies").delete().eq("id", id).select("id, name");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data?.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, deleted: data[0] });
}
