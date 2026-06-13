import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { slideCount } from "@/lib/slides";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home — Minideck" };

type Row = {
  deck_seconds: number;
  artifact_seconds: number;
  furthest_index: number;
  reached_cta: boolean;
  cta_clicks: Record<string, number> | null;
  updated_at: string;
  link: {
    token: string;
    deck: { id: string; name: string; slug: string } | null;
    contact: { first_name: string; last_name: string; company: string | null; email: string; hubspot_url: string | null } | null;
  } | null;
};

const fmtDuration = (s: number) => (!s ? "0s" : Math.floor(s / 60) ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);
const daysAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
// Time-dependent helpers live at module scope (the react-hooks/purity rule forbids Date.now in render).
const cutoffIso = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
function weekBucketsFrom(isos: string[], weeks: number): number[] {
  const now = Date.now();
  const b = new Array(weeks).fill(0);
  for (const iso of isos) { const wk = Math.floor((now - new Date(iso).getTime()) / (7 * 86_400_000)); if (wk >= 0 && wk < weeks) b[wk]++; }
  return b;
}

export default async function Home() {
  const profile = await requireUser();
  const supabase = await createClient();
  const since56 = cutoffIso(56);

  const [
    { data: companyRows }, { data: oppRows }, inbound, inboundInd, { data: inboundDates },
    contacts, decks, accounts, { data: me }, { data: engagement },
  ] = await Promise.all([
    supabase.from("companies").select("type, verified").limit(5000),
    supabase.from("opportunities").select("fit_tier").limit(5000),
    supabase.from("inbound_inquiries").select("id", { count: "exact", head: true }),
    supabase.from("inbound_inquiries").select("id", { count: "exact", head: true }).eq("prospect_eligible", true),
    supabase.from("inbound_inquiries").select("received_at").gte("received_at", since56).limit(5000),
    supabase.from("contacts").select("id", { count: "exact", head: true }),
    supabase.from("decks").select("id", { count: "exact", head: true }),
    supabase.from("accounts").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("leads_seen_at").eq("id", profile.id).maybeSingle(),
    supabase.from("link_engagement").select("deck_seconds, artifact_seconds, furthest_index, reached_cta, cta_clicks, updated_at, link:links(token, deck:decks(id, name, slug), contact:contacts(first_name, last_name, company, email, hubspot_url))").order("updated_at", { ascending: false }).limit(200),
  ]);

  // ── Aggregate ──────────────────────────────────────────────────────────────────────────────
  const companiesTotal = (companyRows ?? []).length;
  const segTally: Record<string, number> = {};
  let verified = 0;
  for (const c of companyRows ?? []) { const t = (c.type as string) ?? "Needs Type Defined"; segTally[t] = (segTally[t] ?? 0) + 1; if (c.verified) verified++; }
  const needsType = segTally["Needs Type Defined"] ?? 0;
  const industry = (segTally["Pharma"] ?? 0) + (segTally["Biotech"] ?? 0) + (segTally["Early Stage Startup"] ?? 0);

  const tier = { 1: 0, 2: 0, 3: 0 };
  for (const o of oppRows ?? []) {
    const t = ((o.fit_tier as string) ?? "").toLowerCase();
    if (t.startsWith("tier 1") || t.startsWith("strong")) tier[1]++;
    else if (t.startsWith("tier 2")) tier[2]++;
    else if (t.startsWith("tier 3")) tier[3]++;
  }
  const oppsTotal = (oppRows ?? []).length;
  const n = (r: { count: number | null }) => r.count ?? 0;

  // Inbound activity — the one series with real time spread (opps/companies are bulk-imported).
  const WEEKS = 8;
  const weekBuckets = weekBucketsFrom((inboundDates ?? []).map((r) => r.received_at as string), WEEKS);
  const trend = weekBuckets.slice().reverse(); // oldest → newest
  const trendMax = Math.max(...trend, 1);
  const inboundThisWeek = weekBuckets[0];

  // ── Hot leads (merged from the former Leads page) ────────────────────────────────────────────
  const prevSeen = (me as { leads_seen_at?: string | null } | null)?.leads_seen_at ? new Date((me as { leads_seen_at: string }).leads_seen_at).getTime() : 0;
  const rows = ((engagement ?? []) as unknown as Row[]).filter((r) => r.link?.contact && r.link?.deck);
  function score(r: Row): number {
    const total = r.link?.deck ? slideCount(r.link.deck.slug) : 0;
    const depthPct = total ? r.furthest_index / total : 0;
    const recency = Math.max(0, 1 - daysAgo(r.updated_at) / 14);
    let s = 0;
    s += Math.min(r.deck_seconds, 300) / 300;
    s += depthPct;
    if (r.reached_cta) s += 0.6;
    if (r.artifact_seconds > 0) s += 0.8;
    if (r.cta_clicks?.cta_inquire) s += 1.2;
    if (r.cta_clicks?.cta_book_meeting) s += 2.0;
    return (s + 0.2) * (0.4 + 0.6 * recency);
  }
  const ranked = rows.map((r) => ({ r, s: score(r) })).sort((a, b) => b.s - a.s).map((x) => x.r);
  const engaged = ranked.length;
  const newTokens = new Set(ranked.filter((r) => new Date(r.updated_at).getTime() > prevSeen).map((r) => r.link!.token));
  await createAdminClient().from("profiles").update({ leads_seen_at: new Date().toISOString() }).eq("id", profile.id);

  function signal(r: Row): { label: string; cls: string } {
    const total = r.link?.deck ? slideCount(r.link.deck.slug) : 0;
    const depthPct = total ? r.furthest_index / total : 0;
    if (r.cta_clicks?.cta_book_meeting || r.cta_clicks?.cta_inquire) return { label: "Hot", cls: "bg-primary text-white" };
    const hot = r.artifact_seconds > 0 || (r.reached_cta && r.deck_seconds >= 60) || r.deck_seconds >= 120;
    const warm = r.deck_seconds >= 30 || depthPct >= 0.5;
    if (hot) return { label: "Hot", cls: "bg-primary text-white" };
    if (warm) return { label: "Warm", cls: "bg-surface-blue-soft text-link" };
    return { label: "Light", cls: "bg-surface-muted text-nav" };
  }

  // ── View models ──────────────────────────────────────────────────────────────────────────────
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const summaryBits = [
    newTokens.size ? `${newTokens.size} new signal${newTokens.size === 1 ? "" : "s"}` : null,
    tier[1] ? `${tier[1]} Tier-1 ready to engage` : null,
    n(inboundInd) ? `${n(inboundInd)} inquiries to triage` : null,
  ].filter(Boolean);

  const actions = [
    { href: "/prospecting", value: tier[1], label: "Tier-1 opps to engage", color: "#1bbdf4" },
    { href: "/companies", value: needsType, label: "Companies to classify", color: "#d98a14" },
    { href: "/inbound", value: n(inboundInd), label: "Industry inquiries to triage", color: "#028ec0" },
    { href: "#hot-leads", value: newTokens.size, label: "Hot leads to follow up", color: "#1bbdf4" },
  ].filter((a) => a.value > 0);

  const funnel = [
    { label: "Companies", v: companiesTotal, color: "#06384a", text: "#fff" },
    { label: "Industry", v: industry, color: "#028ec0", text: "#fff" },
    { label: "Opportunities", v: oppsTotal, color: "#1bbdf4", text: "#06283a" },
    { label: "Tier-1", v: tier[1], color: "#9cddf6", text: "#06283a" },
    { label: "Engaged", v: engaged, color: "#028ec0", text: "#fff" },
  ];
  const funnelMax = Math.max(companiesTotal, 1);

  const tierData = [
    { label: "Tier 1", v: tier[1], color: "#028ec0" },
    { label: "Tier 2", v: tier[2], color: "#1bbdf4" },
    { label: "Tier 3", v: tier[3], color: "#9cddf6" },
  ];
  const tierMax = Math.max(tier[1], tier[2], tier[3], 1);

  const typeColor = (t: string) => t === "Needs Type Defined" ? "#d98a14" : ({ Pharma: "#28367a", Biotech: "#49578f", "Early Stage Startup": "#3c4a93", "Non-Profit": "#6b74a6", Other: "#8b93bd", Academia: "#c0c6dd" } as Record<string, string>)[t] ?? "#8b93bd";
  const segments = Object.entries(segTally).sort((a, b) => b[1] - a[1]).map(([t, v]) => ({ label: t === "Needs Type Defined" ? "Unclassified" : t, v, color: typeColor(t) }));
  const segMax = Math.max(...segments.map((s) => s.v), 1);

  const stat = (label: string, value: number, href: string) => (
    <Link href={href} className="rounded-md bg-surface-muted px-3 py-2 transition-colors hover:bg-surface-hover">
      <div className="text-[0.65rem] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="text-lg text-ink">{value.toLocaleString()}</div>
    </Link>
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      {/* Masthead */}
      <section className="rounded-xl bg-ink-deep px-6 py-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.12em] text-primary-light">TriStar · Sales intelligence</p>
            <h1 className="mt-1 text-2xl font-medium text-white">{greeting}</h1>
            <p className="mt-1 text-sm text-white/70">{summaryBits.length ? summaryBits.join(" · ") : "You're all caught up — nothing in the queue."}</p>
          </div>
          {newTokens.size > 0 && <Link href="#hot-leads" className="rounded-md bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary-light transition-colors hover:bg-primary/30">{newTokens.size} new lead{newTokens.size === 1 ? "" : "s"} →</Link>}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className="whitespace-nowrap text-[0.65rem] uppercase tracking-wide text-white/45">Data quality</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-md bg-white/10"><div className="h-full rounded-md bg-primary" style={{ width: `${Math.max(pct(verified, companiesTotal), 1)}%` }} /></div>
          <span className="whitespace-nowrap text-[0.65rem] text-white/55">{verified.toLocaleString()} verified · {needsType} untyped of {companiesTotal.toLocaleString()}</span>
        </div>
      </section>

      {/* Do this today */}
      {actions.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-xs uppercase tracking-wide text-ink-muted">Do this today</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {actions.map((a) => (
              <Link key={a.label} href={a.href} className="card p-4 transition-colors hover:bg-surface-subtle">
                <div className="h-1 w-7 rounded-full" style={{ background: a.color }} />
                <div className="mt-2.5 text-2xl text-ink">{a.value.toLocaleString()}</div>
                <div className="text-sm text-ink-muted">{a.label}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Prospecting funnel */}
      <section className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-medium text-ink">Prospecting funnel</h2>
          <span className="text-xs text-ink-muted">From sourced companies to engaged prospects</span>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {funnel.map((f, i) => (
            <div key={f.label} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm text-ink-muted">{f.label}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium" style={{ width: `max(${pct(f.v, funnelMax)}%, 64px)`, background: f.color, color: f.text }}>
                  <span>{f.v.toLocaleString()}</span>
                  {i > 0 && <span className="opacity-75">{pct(f.v, funnel[i - 1].v)}%</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Distributions + inbound trend */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="mb-3 font-display text-base font-medium text-ink">Opportunities by tier</h2>
          <div className="flex flex-col gap-2.5 text-sm">
            {tierData.map((t) => (
              <div key={t.label}>
                <div className="flex justify-between"><span className="text-ink">{t.label}</span><span className="text-ink-muted">{t.v}</span></div>
                <div className="mt-1 h-2 rounded-md bg-surface-muted"><div className="h-full rounded-md" style={{ width: `${pct(t.v, tierMax)}%`, background: t.color }} /></div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-display text-base font-medium text-ink">Companies by segment</h2>
          <div className="flex flex-col gap-2.5 text-sm">
            {segments.map((s) => (
              <div key={s.label}>
                <div className="flex justify-between"><span className={s.label === "Unclassified" ? "text-[#9a6207]" : "text-ink"}>{s.label}</span><span className="text-ink-muted">{s.v}</span></div>
                <div className="mt-1 h-2 rounded-md bg-surface-muted"><div className="h-full rounded-md" style={{ width: `${pct(s.v, segMax)}%`, background: s.color }} /></div>
              </div>
            ))}
          </div>
        </section>

        <section className="card flex flex-col p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-base font-medium text-ink">Inbound activity</h2>
            <Link href="/inbound" className="text-xs text-link hover:underline">{inboundThisWeek} this week →</Link>
          </div>
          <p className="mb-3 text-xs text-ink-muted">Inquiries per week · last 8 weeks</p>
          <div className="mt-auto flex h-20 items-end gap-1.5">
            {trend.map((v, i) => (
              <div key={i} className="flex-1 rounded-sm bg-primary/80" style={{ height: `${Math.max((v / trendMax) * 100, 3)}%` }} title={`${v} inquir${v === 1 ? "y" : "ies"}`} />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[0.65rem] text-ink-muted/70"><span>8 wks ago</span><span>this week</span></div>
        </section>
      </div>

      {/* At a glance */}
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        {stat("Companies", companiesTotal, "/companies")}
        {stat("Opportunities", oppsTotal, "/prospecting")}
        {stat("Contacts", n(contacts), "/contacts")}
        {stat("Inbound", n(inbound), "/inbound")}
        {stat("Campaigns", n(accounts), "/campaigns")}
        {stat("Decks", n(decks), "/decks")}
      </div>

      {/* Hot leads (merged from the former Leads page) */}
      <section id="hot-leads" className="flex scroll-mt-20 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="font-display text-lg font-medium text-ink">Hot leads</h2>
          {newTokens.size > 0 && <span className="chip bg-primary text-white">{newTokens.size} new</span>}
          <span className="text-xs text-ink-muted">Every engaged prospect, ranked by intent × depth × recency.</span>
        </div>

        {ranked.length === 0 ? (
          <p className="card px-6 py-12 text-center text-sm text-ink-muted">No engagement yet. Generate <Link href="/decks" className="text-link hover:underline">deck links</Link> and prospects appear here as they open them.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">#</th>
                  <th className="px-4 py-2.5 font-medium">Prospect</th>
                  <th className="px-4 py-2.5 font-medium">Company</th>
                  <th className="px-4 py-2.5 font-medium">Deck</th>
                  <th className="px-4 py-2.5 font-medium">Signal</th>
                  <th className="px-4 py-2.5 font-medium">Engaged</th>
                  <th className="px-4 py-2.5 font-medium">Depth</th>
                  <th className="px-4 py-2.5 font-medium">Artifact</th>
                  <th className="px-4 py-2.5 font-medium">CTA</th>
                  <th className="px-4 py-2.5 font-medium">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ranked.map((r, i) => {
                  const total = r.link!.deck ? slideCount(r.link!.deck!.slug) : 0;
                  const sig = signal(r);
                  const d = daysAgo(r.updated_at);
                  return (
                    <tr key={r.link!.token} className="align-middle transition-colors hover:bg-surface-subtle">
                      <td className="px-4 py-2.5 text-ink-muted">{i + 1}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Link href={`/links/${r.link!.token}`} className="font-medium text-ink hover:text-link">{`${r.link!.contact!.first_name} ${r.link!.contact!.last_name}`.trim()} →</Link>
                          {newTokens.has(r.link!.token) && <span className="chip bg-primary text-white text-[0.6rem]">New</span>}
                        </div>
                        <div className="text-xs text-ink-muted">{r.link!.contact!.email}</div>
                      </td>
                      <td className="px-4 py-2.5 text-ink-muted">{r.link!.contact!.company ?? "—"}</td>
                      <td className="px-4 py-2.5"><Link href={`/decks/${r.link!.deck!.id}`} className="text-link hover:underline">{r.link!.deck!.name}</Link></td>
                      <td className="px-4 py-2.5"><span className={`chip ${sig.cls}`}>{sig.label}</span></td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink">{fmtDuration(r.deck_seconds)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink">{total ? `${r.furthest_index}/${total}` : r.furthest_index}</td>
                      <td className="px-4 py-2.5 text-ink">{r.artifact_seconds > 0 ? "Yes" : "No"}</td>
                      <td className="px-4 py-2.5">{r.cta_clicks?.cta_book_meeting ? <span className="chip bg-primary text-white">📅 Meeting</span> : r.cta_clicks?.cta_inquire ? <span className="chip bg-surface-blue-soft text-link">Inquire</span> : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-muted">{d === 0 ? "today" : `${d}d ago`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
