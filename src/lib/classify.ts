import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { serverEnv } from "@/lib/env.server";
import { getModelFor, logLlmCall } from "@/lib/llm";

// In-app org classification for inbound contact-form inquiries (RFQ inquiries are classified
// by HubSpot pipeline, no AI needed). Cheap/fast Haiku tier; structured JSON via output_config.
// Gracefully returns 'unknown' when ANTHROPIC_API_KEY is unset.

export type OrgCategory = "industry" | "academia" | "non_profit" | "government" | "other" | "unknown";

/** Cheap, deterministic classification from the email domain — no AI, no credits needed.
 *  Catches the common academic/gov cases (.edu / .ac.* / .gov / .mil). Returns null when the
 *  domain doesn't decide it (→ caller falls back to the AI classifier). */
export function classifyByDomain(domain: string | null | undefined): OrgCategory | null {
  const d = (domain ?? "").toLowerCase().trim();
  if (!d) return null;
  if (d.endsWith(".edu") || d.includes(".edu.") || /\.ac\.[a-z]{2,}$/.test(d)) return "academia";
  if (d.endsWith(".gov") || d.includes(".gov.") || d.endsWith(".mil")) return "government";
  return null;
}

const Result = z.object({
  category: z.enum(["industry", "academia", "non_profit", "government", "other"]),
  reason: z.string().max(280),
});

const SYSTEM = `You classify the ORGANIZATION behind an inbound inquiry to TriStar Technology Group, an oncology-focused biospecimen/CRO.
Categories:
- "industry": a for-profit company — pharma, biotech, diagnostics, or AI/computational-pathology. These are TriStar's prospecting targets.
- "academia": a university, academic medical center, or research institute (incl. .edu / .ac.* domains).
- "non_profit": a non-profit, foundation, or charity.
- "government": a government or public agency.
- "other": anything else, or genuinely unclear.
A name like "Acme Therapeutics / Stanford University" that mixes a company and a university is "industry" if a real company is involved (the company is the buyer). Decide from the company name, email domain, and message. Keep the reason to one sentence.`;

export async function classifyOrg(input: { company?: string | null; domain?: string | null; message?: string | null }, opts: { model?: string; logArea?: string } = {}): Promise<{ category: OrgCategory; reason: string | null }> {
  if (!serverEnv.ANTHROPIC_API_KEY) return { category: "unknown", reason: "ANTHROPIC_API_KEY not set" };
  const client = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });
  const model = opts.model ?? (await getModelFor("org_classify")).model;
  const logArea = opts.logArea ?? "org_classify";
  const t0 = Date.now();
  try {
    const res = await client.messages.parse({
      model,
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: "user", content: `Company: ${input.company ?? "(unknown)"}\nEmail domain: ${input.domain ?? "(unknown)"}\nMessage: ${(input.message ?? "").slice(0, 1500)}` }],
      output_config: { format: zodOutputFormat(Result) },
    });
    await logLlmCall({ area: logArea, model, inputTokens: res.usage?.input_tokens, outputTokens: res.usage?.output_tokens, latencyMs: Date.now() - t0 });
    const out = res.parsed_output;
    return out ? { category: out.category, reason: out.reason } : { category: "unknown", reason: "no structured output" };
  } catch (e) {
    await logLlmCall({ area: logArea, model, latencyMs: Date.now() - t0, ok: false, error: e instanceof Error ? e.message : String(e) });
    return { category: "unknown", reason: `classify error: ${e instanceof Error ? e.message : String(e)}` };
  }
}
