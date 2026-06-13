import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DigestPayload } from "@/lib/digest";
import GenerateButton from "./generate-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Weekly digest — Minideck" };

type DigestRow = { id: string; payload: DigestPayload; created_at: string };
const fmt = (s: string) => new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export default async function DigestPage() {
  const profile = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("digests").select("id, payload, created_at").order("created_at", { ascending: false }).limit(12);
  const digests = (data ?? []) as DigestRow[];
  const latest = digests[0]?.payload;
  const isAdmin = profile.role === "admin";

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Sales intelligence</p>
          <h1 className="mt-1 text-3xl">Weekly digest</h1>
          <p className="mt-1 text-sm text-ink-muted">Hot leads, Tier-1 pipeline, inbound to triage, data quality, and guardrail health — generated weekly{digests[0] ? `. Latest: ${fmt(digests[0].created_at)}.` : "."}</p>
        </div>
        {isAdmin && <GenerateButton />}
      </header>

      {!latest ? (
        <div className="card px-6 py-12 text-center text-sm text-ink-muted">No digest yet. {isAdmin ? "Click “Generate now”, or it runs automatically each Monday." : "It runs automatically each Monday."}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Tier-1 ready", value: latest.tier1, href: "/prospecting" },
              { label: "Inbound to triage", value: latest.inbound_to_triage, href: "/inbound" },
              { label: "Verified", value: latest.verified, href: "/companies/verify" },
              { label: "Untyped", value: latest.untyped, href: "/companies" },
            ].map((s) => (
              <Link key={s.label} href={s.href} className="rounded-md bg-surface-muted px-3 py-2 transition-colors hover:bg-surface-hover">
                <div className="text-[0.65rem] uppercase tracking-wide text-ink-muted">{s.label}</div>
                <div className="text-lg text-ink">{s.value.toLocaleString()}</div>
              </Link>
            ))}
          </div>

          <section className="card p-5">
            <h2 className="mb-2 font-display text-base font-medium text-ink">🔥 Hot leads</h2>
            {latest.hot_leads.length === 0 ? <p className="text-sm text-ink-muted">No engaged prospects yet.</p> : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {latest.hot_leads.map((h, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="text-ink-muted">{i + 1}.</span>
                    <span className="font-medium text-ink">{h.name}</span>
                    {h.company && <span className="text-ink-muted">· {h.company}</span>}
                    {h.deck && <span className="text-ink-muted/70">· {h.deck}</span>}
                    {h.cta && <span className="chip bg-primary text-white text-[0.6rem]">{h.cta}</span>}
                    <span className="ml-auto text-xs text-ink-muted">{h.seconds}s</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-2 font-display text-base font-medium text-ink">✅ Guardrail health</h2>
            {latest.guardrails.length === 0 ? <p className="text-sm text-ink-muted">No guardrail eval sets.</p> : (
              <div className="flex flex-wrap gap-2">
                {latest.guardrails.map((g) => {
                  const ok = g.accuracy === 1;
                  return <span key={g.area} className={`chip ${g.accuracy == null ? "bg-surface-muted text-ink-muted" : ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{g.area}: {g.accuracy != null ? `${Math.round(g.accuracy * 100)}% (${g.correct}/${g.n})` : "—"}</span>;
                })}
              </div>
            )}
            <p className="mt-2 text-[0.7rem] text-ink-muted/70">Deterministic guardrail assertions, re-run with each digest. Anything below 100% is a regression — <Link href="/admin/evals" className="text-link hover:underline">open evals</Link>.</p>
          </section>

          {digests.length > 1 && (
            <section className="flex flex-col gap-1.5">
              <h2 className="text-xs uppercase tracking-wide text-ink-muted">History</h2>
              {digests.slice(1).map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-md border border-line px-3 py-1.5 text-xs text-ink-muted">
                  <span>{fmt(d.created_at)}</span>
                  <span>{d.payload.tier1} Tier-1 · {d.payload.inbound_to_triage} to triage · {d.payload.hot_leads?.length ?? 0} hot</span>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}
