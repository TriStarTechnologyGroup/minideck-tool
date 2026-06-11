import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProspectingAccess } from "@/lib/api";

// DELETE /api/prospecting/opportunities/[id] — remove a single opportunity (its
// score_components, cohorts, trials, capabilities, feedback cascade). Auth: bearer or admin.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireProspectingAccess(req);
  if (denied) return denied;
  const { id } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin.from("opportunities").delete().eq("id", id).select("id, asset_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data?.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, deleted: data[0] });
}
