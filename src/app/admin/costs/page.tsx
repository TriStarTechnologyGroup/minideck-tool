import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AREA_LABEL, type LlmArea } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Spend — Minideck" };

// Clay cost is estimated (Clay bills data credits, not per-contact dollars). Growth plan ≈ $495 / 6,000
// credits/mo ≈ $0.0825/credit; a People row ≈ ~9 credits (find + email/LinkedIn waterfalls). Tune here.
const CLAY_CREDITS_PER_PERSON = 9;
const CLAY_USD_PER_CREDIT = 495 / 6000;
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Call = { area: string | null; model: string | null; cost_usd: number | null; input_tokens: number | null; output_tokens: number | null; latency_ms: number | null; ok: boolean; created_at: string };

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <div className="text-[0.7rem] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="text-2xl text-ink">{value}</div>
      {sub && <div className="text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}

export default async function CostsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const since = new Date(now.getTime() - 60 * 86400_000).toISOString();

  const [{ data: callRows }, { count: clayAll }, { count: clayMonth }] = await Promise.all([
    supabase.from("llm_calls").select("area, model, cost_usd, input_tokens, output_tokens, latency_ms, ok, created_at").gte("created_at", since).limit(20000),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("source", "clay"),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("source", "clay").gte("enriched_at", monthStart),
  ]);
  const calls = (callRows ?? []) as Call[];

  // ── Aggregate Anthropic spend ──
  const sum = (rows: Call[]) => rows.reduce((s, c) => s + (c.cost_usd ?? 0), 0);
  const monthCalls = calls.filter((c) => c.created_at >= monthStart);
  const anthropicMonth = sum(monthCalls);
  const anthropic60 = sum(calls);
  const errorRate = calls.length ? calls.filter((c) => !c.ok).length / calls.length : 0;
  const avgLatency = calls.length ? Math.round(calls.reduce((s, c) => s + (c.latency_ms ?? 0), 0) / calls.length) : 0;

  const byArea = new Map<string, { calls: number; cost: number; inTok: number; outTok: number }>();
  for (const c of calls) {
    const k = c.area ?? "—";
    const a = byArea.get(k) ?? { calls: 0, cost: 0, inTok: 0, outTok: 0 };
    a.calls++; a.cost += c.cost_usd ?? 0; a.inTok += c.input_tokens ?? 0; a.outTok += c.output_tokens ?? 0;
    byArea.set(k, a);
  }
  const byModel = new Map<string, { calls: number; cost: number }>();
  for (const c of calls) { const k = c.model ?? "—"; const m = byModel.get(k) ?? { calls: 0, cost: 0 }; m.calls++; m.cost += c.cost_usd ?? 0; byModel.set(k, m); }

  // last 14 days, daily
  const days: { day: string; cost: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400_000); const key = d.toISOString().slice(0, 10);
    days.push({ day: key, cost: sum(calls.filter((c) => c.created_at.slice(0, 10) === key)) });
  }
  const maxDay = Math.max(0.0001, ...days.map((d) => d.cost));

  const clayMonthUsd = (clayMonth ?? 0) * CLAY_CREDITS_PER_PERSON * CLAY_USD_PER_CREDIT;
  const clayAllUsd = (clayAll ?? 0) * CLAY_CREDITS_PER_PERSON * CLAY_USD_PER_CREDIT;
  const totalMonth = anthropicMonth + clayMonthUsd;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <header>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-1 text-3xl">Spend</h1>
        <p className="mt-1 text-sm text-ink-muted">Paid-API cost across the app. Anthropic is exact (from the LLM call log); Clay is estimated from people enriched.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="This month — total" value={usd(totalMonth)} sub="Anthropic + Clay (est.)" />
        <Card label="Anthropic — month" value={usd(anthropicMonth)} sub={`${monthCalls.length} calls`} />
        <Card label="Clay — month (est.)" value={usd(clayMonthUsd)} sub={`${(clayMonth ?? 0).toLocaleString()} people`} />
        <Card label="Anthropic — 60d" value={usd(anthropic60)} sub={`${(errorRate * 100).toFixed(1)}% errors · ${avgLatency}ms avg`} />
      </div>

      <section>
        <h2 className="mb-2 font-display text-lg font-medium text-ink">Anthropic — last 14 days</h2>
        <div className="card flex items-end gap-1 p-4" style={{ height: 120 }}>
          {days.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${d.day}: ${usd(d.cost)}`}>
              <div className="w-full rounded-sm bg-primary/70" style={{ height: `${Math.max(2, (d.cost / maxDay) * 90)}px` }} />
              <div className="text-[0.55rem] text-ink-muted">{d.day.slice(5)}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-display text-lg font-medium text-ink">Anthropic by feature <span className="font-sans text-sm font-normal text-ink-muted">(60d)</span></h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr><th className="px-4 py-2.5 font-medium">Feature</th><th className="px-4 py-2.5 text-right font-medium">Calls</th><th className="px-4 py-2.5 text-right font-medium">Tokens (in/out)</th><th className="px-4 py-2.5 text-right font-medium">Cost</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...byArea.entries()].sort((a, b) => b[1].cost - a[1].cost).map(([area, a]) => (
                <tr key={area}>
                  <td className="px-4 py-2.5 text-ink">{AREA_LABEL[area as LlmArea] ?? area}</td>
                  <td className="px-4 py-2.5 text-right text-ink-muted">{a.calls.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-ink-muted">{(a.inTok / 1000).toFixed(0)}k / {(a.outTok / 1000).toFixed(0)}k</td>
                  <td className="px-4 py-2.5 text-right text-ink">{usd(a.cost)}</td>
                </tr>
              ))}
              {byArea.size === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-ink-muted">No LLM calls logged yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-display text-lg font-medium text-ink">By model <span className="font-sans text-sm font-normal text-ink-muted">(60d)</span></h2>
        <div className="flex flex-wrap gap-2">
          {[...byModel.entries()].sort((a, b) => b[1].cost - a[1].cost).map(([model, m]) => (
            <span key={model} className="chip bg-surface-muted text-nav">{model}: {usd(m.cost)} · {m.calls}</span>
          ))}
          {byModel.size === 0 && <span className="text-sm text-ink-muted">—</span>}
        </div>
      </section>

      <p className="text-xs text-ink-muted/70">
        Clay estimate: {(clayAll ?? 0).toLocaleString()} people enriched all-time ≈ {usd(clayAllUsd)} (@ ~{CLAY_CREDITS_PER_PERSON} credits/person, {usd(CLAY_USD_PER_CREDIT)}/credit). Adjust the constants in the page as your Clay plan / waterfalls change. HubSpot service key isn&rsquo;t per-call metered.
      </p>
    </main>
  );
}
