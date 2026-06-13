import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";
import { serverEnv } from "@/lib/env.server";
import { getModelFor, logLlmCall } from "@/lib/llm";
import { redactPii } from "@/lib/guardrails";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };
const input = z.object({ prompt: z.string().trim().optional() });
const Result = z.object({ subject: z.string(), body: z.string() });

const SYSTEM = `You draft the FIRST email reply from TriStar Technology Group to an inbound inquiry. TriStar is an oncology-focused biospecimen repository + CRO: 2.5M+ consented, annotated human tissue samples (FFPE, plasma), tumor microarrays (TMAs), and lab services (IHC, RNAScope, NGS, RNA-Seq, Digital Spatial Profiling, digital pathology).
Write a reply the rep can send with light edits. Rules:
- Professional, warm, concise (roughly 120–180 words). Plain text body, no markdown. Address the contact by first name if known.
- Acknowledge their specific request (reference the products/specimens or the message). If matched cohorts/capabilities are provided, mention the most relevant ones concretely.
- Offer a clear next step: a short call, or to put together a tailored quote/feasibility. Propose, don't pressure.
- NEVER invent prices, turnaround times, sample counts, or availability — we have no pricing data here. If they asked about price/quantities, say the team will follow up with a tailored quote.
- No fabricated claims or stats. Don't add a physical signature block or placeholders unless asked; end with a simple sign-off line.
- Tone by org type:
  - industry (pharma/biotech/diagnostics/AI-pathology): peer-to-peer, translational/BD framing, suggest a working call.
  - academia / non_profit / government: collaborative and helpful; offer a quote/feasibility; do not push a sales call.
  - other/unknown: courteous and clarifying.`;

// POST /api/inbound/[id]/reply — draft a brand-appropriate reply for an inquiry (no send, no DB write;
// the rep reviews + opens it in Gmail). Tone adapts to the inquiry's classification.
export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  if (!serverEnv.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 400 });
  const { id } = await params;
  const parsed = input.safeParse(await req.json().catch(() => ({})));
  const extra = parsed.success ? parsed.data.prompt : undefined;

  const admin = createAdminClient();
  const { data: inq } = await admin.from("inbound_inquiries").select("source, company_name, contact_name, contact_email, subject, message, requested_products, amount, classification, opportunity_id").eq("id", id).maybeSingle();
  if (!inq) return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });

  let oppLine = "";
  if (inq.opportunity_id) {
    const { data: opp } = await admin.from("opportunities").select("asset_name, matched_tma_skus, suggested_capabilities, rationale").eq("id", inq.opportunity_id as string).maybeSingle();
    if (opp) oppLine = `\nMatched on our side — assets: ${opp.matched_tma_skus ?? "—"}; capabilities: ${opp.suggested_capabilities ?? "—"}. Rationale: ${redactPii(String(opp.rationale ?? "")).slice(0, 600)}`;
  }
  const products = (inq.requested_products as { sku?: string | null; name?: string | null; quantity?: number | null }[] | null) ?? [];
  const cart = products.length ? `\nRequested items: ${products.map((p) => `${p.name ?? p.sku ?? "item"}${p.quantity ? ` ×${p.quantity}` : ""}`).join("; ")}` : "";

  const firstName = (inq.contact_name as string | null)?.trim().split(/\s+/)[0] ?? null;
  const userMsg = [
    `Inquiry type: ${inq.source === "rfq" ? "RFQ (request for quote)" : "contact-form message"}`,
    `Org classification: ${inq.classification}`,
    `Company: ${inq.company_name ?? "(unknown)"}`,
    `Contact: ${inq.contact_name ?? "(unknown)"}${firstName ? ` (first name: ${firstName})` : ""}`,
    inq.subject ? `Subject: ${inq.subject}` : "",
    inq.message ? `Their message:\n${redactPii(String(inq.message)).slice(0, 1500)}` : "",
    cart,
    inq.amount != null ? `Stated budget/amount: $${Number(inq.amount).toLocaleString()}` : "",
    oppLine,
    extra ? `\nExtra instruction from the rep: ${extra}` : "",
  ].filter(Boolean).join("\n");

  const { model } = await getModelFor("reply_draft");
  const t0 = Date.now();
  try {
    const client = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });
    const res = await client.messages.parse({ model, max_tokens: 1200, system: SYSTEM, messages: [{ role: "user", content: userMsg }], output_config: { format: zodOutputFormat(Result) } });
    await logLlmCall({ area: "reply_draft", model, inputTokens: res.usage?.input_tokens, outputTokens: res.usage?.output_tokens, latencyMs: Date.now() - t0, ref: id });
    const out = res.parsed_output;
    if (!out) return NextResponse.json({ error: "No draft produced" }, { status: 502 });
    return NextResponse.json({ subject: out.subject, body: out.body });
  } catch (e) {
    await logLlmCall({ area: "reply_draft", model, latencyMs: Date.now() - t0, ok: false, error: e instanceof Error ? e.message : String(e), ref: id });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Reply draft failed" }, { status: 500 });
  }
}
