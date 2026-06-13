import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAdmin } from "@/lib/api";

// POST /api/admin/evals — create a golden dataset (admin).
const input = z.object({
  name: z.string().trim().min(1),
  area: z.string().trim().min(1),
  eval_type: z.enum(["classification", "match", "judge", "assertion"]),
  description: z.string().trim().nullish(),
});

export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin();
  if (guard.error) return guard.error;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  const { data, error } = await createAdminClient()
    .from("eval_datasets")
    .insert({ ...parsed.data, created_by: guard.profile.id })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}
