import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAdmin } from "@/lib/api";
import { harvestCandidates } from "@/lib/eval-harvest";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const input = z.object({ limit: z.number().int().min(1).max(200).optional() });

// POST /api/admin/evals/[id]/candidates — pull recent app records for the dataset's area into
// unlabeled candidate examples (admin). De-duplicates against existing example inputs.
export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;
  const { id: datasetId } = await params;
  const parsed = input.safeParse(await req.json().catch(() => ({})));
  const limit = (parsed.success && parsed.data.limit) || 25;

  const admin = createAdminClient();
  const { data: ds } = await admin.from("eval_datasets").select("area").eq("id", datasetId).maybeSingle();
  if (!ds) return NextResponse.json({ error: "Dataset not found" }, { status: 404 });

  const candidates = await harvestCandidates(admin, ds.area as string, limit);
  if (!candidates.length) return NextResponse.json({ error: `No harvester for area '${ds.area}' (or no rows found).`, harvested: 0, inserted: 0 }, { status: 400 });

  // Dedup against existing inputs (exact JSON match) so re-pulling doesn't pile up duplicates.
  const { data: existing } = await admin.from("eval_examples").select("input").eq("dataset_id", datasetId).limit(5000);
  const seen = new Set((existing ?? []).map((e) => JSON.stringify(e.input)));
  const fresh = candidates.filter((c) => !seen.has(JSON.stringify(c)));
  if (fresh.length) {
    const { error } = await admin.from("eval_examples").insert(fresh.map((input) => ({ dataset_id: datasetId, input, status: "unlabeled", source: "candidate" })));
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, harvested: candidates.length, inserted: fresh.length, skipped: candidates.length - fresh.length });
}
