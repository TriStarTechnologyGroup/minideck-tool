import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProspectingAccess } from "@/lib/api";

// GET /api/prospecting/runs — distinct run_label values with their opportunity + company
// counts, so superseded runs can be spotted and cleaned (delete via
// DELETE /api/prospecting/opportunities { run_label }). Auth: bearer or admin.
export async function GET(req: NextRequest) {
  const denied = await requireProspectingAccess(req);
  if (denied) return denied;
  const admin = createAdminClient();
  const { data, error } = await admin.from("opportunities").select("run_label, company_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const runs = new Map<string, { run_label: string | null; opportunities: number; companies: Set<string> }>();
  for (const r of data ?? []) {
    const label = (r.run_label as string | null) ?? "(none)";
    const e = runs.get(label) ?? { run_label: r.run_label as string | null, opportunities: 0, companies: new Set<string>() };
    e.opportunities++;
    if (r.company_id) e.companies.add(r.company_id as string);
    runs.set(label, e);
  }
  const list = [...runs.values()]
    .map((r) => ({ run_label: r.run_label, opportunities: r.opportunities, companies: r.companies.size }))
    .sort((a, b) => b.opportunities - a.opportunities);
  return NextResponse.json({ count: list.length, runs: list });
}
