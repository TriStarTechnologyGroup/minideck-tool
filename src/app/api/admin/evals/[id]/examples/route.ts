import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAdmin } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

const jsonObj = z.record(z.string(), z.unknown());
const exampleFields = z.object({ input: jsonObj.optional(), expected: jsonObj.nullish(), status: z.enum(["unlabeled", "labeled", "skipped"]).optional(), notes: z.string().nullish() });
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), data: exampleFields }),
  z.object({ action: z.literal("update"), exampleId: z.string().uuid(), data: exampleFields }),
  z.object({ action: z.literal("delete"), exampleId: z.string().uuid() }),
  z.object({ action: z.literal("bulk"), rows: z.array(exampleFields).min(1).max(5000) }),
]);

// POST /api/admin/evals/[id]/examples — add / update / delete / bulk-import examples (admin).
export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;
  const { id: datasetId } = await params;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  const d = parsed.data;
  const admin = createAdminClient();
  const now = new Date().toISOString();

  if (d.action === "add") {
    const { error } = await admin.from("eval_examples").insert({ dataset_id: datasetId, input: d.data.input ?? {}, expected: d.data.expected ?? null, status: d.data.status ?? (d.data.expected ? "labeled" : "unlabeled"), notes: d.data.notes ?? null, source: "manual" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (d.action === "update") {
    const patch: Record<string, unknown> = { updated_at: now };
    if (d.data.input !== undefined) patch.input = d.data.input;
    if (d.data.expected !== undefined) patch.expected = d.data.expected;
    if (d.data.status !== undefined) patch.status = d.data.status;
    if (d.data.notes !== undefined) patch.notes = d.data.notes;
    const { error } = await admin.from("eval_examples").update(patch).eq("id", d.exampleId).eq("dataset_id", datasetId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (d.action === "delete") {
    const { error } = await admin.from("eval_examples").delete().eq("id", d.exampleId).eq("dataset_id", datasetId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    const rows = d.rows.map((r) => ({ dataset_id: datasetId, input: r.input ?? {}, expected: r.expected ?? null, status: r.status ?? (r.expected ? "labeled" : "unlabeled"), notes: r.notes ?? null, source: "csv" }));
    const { error } = await admin.from("eval_examples").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, inserted: rows.length });
  }
  return NextResponse.json({ ok: true });
}
