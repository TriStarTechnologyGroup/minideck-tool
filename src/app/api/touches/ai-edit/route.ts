import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";
import { serverEnv } from "@/lib/env.server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const input = z.object({
  accountId: z.string().min(1),
  touchIds: z.array(z.string().min(1)).min(1),
  prompt: z.string().trim().min(1),
});

const Result = z.object({
  touches: z.array(z.object({ id: z.string(), subject: z.string(), body: z.string() })),
});

const SYSTEM = `You revise outbound sales emails for TriStar Technology Group, an oncology-focused biospecimen repository + CRO (FFPE/TMA biospecimens with clinical+molecular annotation; lab services: IHC, RNAScope, NGS, RNA-Seq, DSP, digital pathology). The recipients are pharma/biotech translational, BD, and companion-diagnostics leaders.
You are given an account's research/context/angle and one or more email "touches" (a multi-step cadence), plus an instruction describing the change the user wants and why.
Rules:
- Apply the user's instruction to EVERY selected touch. Return one revised {id, subject, body} per touch id given — keep the same ids.
- Preserve each touch's role in the cadence (Touch 1 = intro, later touches = follow-ups/bumps) unless told otherwise.
- Professional, concise, specific, credible — no hype, no fabricated claims or stats. Ground hooks in the provided research/angle. Plain text body (no markdown). Keep subjects short.
- Keep it human and senders' voice; don't add signatures or placeholders unless asked.`;

// POST /api/touches/ai-edit — generate revised drafts for the selected touches (no DB write).
// The client reviews/edits the drafts, then applies them via PATCH /api/touches/[id].
export async function POST(req: NextRequest) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  if (!serverEnv.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 400 });

  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  const { accountId, touchIds, prompt } = parsed.data;

  const admin = createAdminClient();
  const [{ data: account }, { data: touchRows }] = await Promise.all([
    admin.from("accounts").select("name, research, context, angle").eq("id", accountId).maybeSingle(),
    admin.from("touches").select("id, seq, day_offset, subject, body").eq("account_id", accountId).in("id", touchIds).order("seq"),
  ]);
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const touches = touchRows ?? [];
  if (!touches.length) return NextResponse.json({ error: "No matching touches" }, { status: 404 });

  const userMsg = [
    `Account: ${account.name}`,
    account.research ? `Verified research:\n${account.research}` : "",
    account.context ? `Context:\n${account.context}` : "",
    account.angle ? `Angle & hooks:\n${account.angle}` : "",
    "",
    "Touches to revise:",
    ...touches.map((t) => `--- Touch ${t.seq} (id: ${t.id}, day +${t.day_offset}) ---\nSubject: ${t.subject ?? "(empty)"}\nBody:\n${t.body ?? "(empty)"}`),
    "",
    `Instruction: ${prompt}`,
  ].filter(Boolean).join("\n");

  try {
    const client = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });
    const res = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 6000,
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
      output_config: { format: zodOutputFormat(Result) },
    });
    const out = res.parsed_output;
    if (!out) return NextResponse.json({ error: "No draft produced" }, { status: 502 });
    // Only return drafts for the requested touches, carrying the seq for display.
    const seqById = new Map(touches.map((t) => [t.id, t.seq]));
    const drafts = out.touches.filter((d) => seqById.has(d.id)).map((d) => ({ ...d, seq: seqById.get(d.id)! }));
    return NextResponse.json({ drafts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI edit failed" }, { status: 500 });
  }
}
