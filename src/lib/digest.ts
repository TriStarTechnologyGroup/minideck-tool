import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import { startEvalRun } from "@/lib/evals";

type Admin = ReturnType<typeof createAdminClient>;
const APP = serverEnv.APP_BASE_URL || "https://decks.tristargroup.us";

export type DigestPayload = {
  generated_at: string;
  companies: number; verified: number; untyped: number; opps: number; tier1: number; inbound_to_triage: number;
  hot_leads: { name: string; company: string | null; deck: string | null; seconds: number; cta: string | null }[];
  guardrails: { area: string; accuracy: number | null; correct: number | null; n: number | null }[];
};

type EngRow = { deck_seconds: number; artifact_seconds: number; reached_cta: boolean; cta_clicks: Record<string, number> | null; link: { deck: { name: string } | null; contact: { first_name: string; last_name: string; company: string | null } | null } | null };

/** Compose the weekly digest. Also RUNS the deterministic guardrail assertion evals (free, no API) so
 *  the digest doubles as a weekly guardrail regression check — the "eval activation" half. */
export async function composeDigest(admin: Admin): Promise<{ payload: DigestPayload; text: string }> {
  const n = (r: { count: number | null }) => r.count ?? 0;
  const [companies, verified, untyped, opps, tier1, inboundTriage, eng, gds] = await Promise.all([
    admin.from("companies").select("id", { count: "exact", head: true }),
    admin.from("companies").select("id", { count: "exact", head: true }).eq("verified", true),
    admin.from("companies").select("id", { count: "exact", head: true }).eq("type", "Needs Type Defined"),
    admin.from("opportunities").select("id", { count: "exact", head: true }),
    admin.from("opportunities").select("id", { count: "exact", head: true }).ilike("fit_tier", "Tier 1%"),
    admin.from("inbound_inquiries").select("id", { count: "exact", head: true }).eq("prospect_eligible", true).in("status", ["new", "classified"]),
    admin.from("link_engagement").select("deck_seconds, artifact_seconds, reached_cta, cta_clicks, link:links(deck:decks(name), contact:contacts(first_name, last_name, company))").order("updated_at", { ascending: false }).limit(100),
    admin.from("eval_datasets").select("id, area").eq("eval_type", "assertion"),
  ]);

  // Top hot leads (light intent score — no slide totals needed here).
  const rows = ((eng.data ?? []) as unknown as EngRow[]).filter((r) => r.link?.contact && r.link?.deck);
  const score = (r: EngRow) => (r.cta_clicks?.cta_book_meeting ? 2 : 0) + (r.cta_clicks?.cta_inquire ? 1.2 : 0) + Math.min(r.deck_seconds, 300) / 300 + (r.artifact_seconds > 0 ? 0.8 : 0) + (r.reached_cta ? 0.4 : 0);
  const hot_leads = rows.map((r) => ({ r, s: score(r) })).sort((a, b) => b.s - a.s).slice(0, 5).map(({ r }) => ({
    name: `${r.link!.contact!.first_name} ${r.link!.contact!.last_name}`.trim(),
    company: r.link!.contact!.company ?? null, deck: r.link!.deck!.name ?? null, seconds: Math.round(r.deck_seconds),
    cta: r.cta_clicks?.cta_book_meeting ? "Meeting" : r.cta_clicks?.cta_inquire ? "Inquire" : null,
  }));

  // Run the guardrail assertion evals now (deterministic) and read their pass rates.
  const guardrails: DigestPayload["guardrails"] = [];
  for (const d of gds.data ?? []) {
    try {
      const runId = await startEvalRun(admin, d.id as string, "deterministic");
      const { data: run } = await admin.from("eval_runs").select("metrics").eq("id", runId).maybeSingle();
      const m = (run?.metrics ?? {}) as { accuracy?: number; correct?: number; n?: number };
      guardrails.push({ area: d.area as string, accuracy: m.accuracy ?? null, correct: m.correct ?? null, n: m.n ?? null });
    } catch { guardrails.push({ area: d.area as string, accuracy: null, correct: null, n: null }); }
  }

  const payload: DigestPayload = {
    generated_at: new Date().toISOString(),
    companies: n(companies), verified: n(verified), untyped: n(untyped), opps: n(opps), tier1: n(tier1), inbound_to_triage: n(inboundTriage),
    hot_leads, guardrails,
  };

  const gtxt = guardrails.map((g) => `${g.area} ${g.accuracy != null ? `${Math.round(g.accuracy * 100)}%` : "—"}`).join(", ");
  const text = [
    "*TriStar weekly digest*",
    `🔥 Hot leads: ${hot_leads.length ? hot_leads.map((h) => `${h.name}${h.company ? ` (${h.company})` : ""}${h.cta ? ` [${h.cta}]` : ""}`).join(", ") : "none yet"}`,
    `🎯 ${payload.tier1} Tier-1 opportunities ready · ${payload.opps} total`,
    `📥 ${payload.inbound_to_triage} industry inquiries to triage`,
    `🏷️ Data quality: ${payload.verified} verified · ${payload.untyped} untyped of ${payload.companies}`,
    `✅ Guardrails: ${gtxt || "no eval sets"}`,
    `→ ${APP}/`,
  ].join("\n");

  return { payload, text };
}
