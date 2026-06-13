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

export default async function Home() {
  const profile = await requireUser();
  const supabase = await createClient();
  const n = (r: { count: number | null }) => r.count ?? 0;

  // At-a-glance counts (cheap head counts, in parallel) + the hot-leads engagement feed + the
  // per-user "new since last visit" baseline.
  const [
    companies, industry, needsType, opps, tier1, contacts, inbound, inboundInd, decks, accounts,
    { data: me }, { data: engagement },
  ] = await Promise.all([
    supabase.from("companies").select("id", { count: "exact", head: true }),
    supabase.from("companies").select("id", { count: "exact", head: true }).in("type", ["Pharma", "Biotech", "Early Stage Startup"]),
    supabase.from("companies").select("id", { count: "exact", head: true }).eq("type", "Needs Type Defined"),
    supabase.from("opportunities").select("id", { count: "exact", head: true }),
    supabase.from("opportunities").select("id", { count: "exact", head: true }).ilike("fit_tier", "Tier 1%"),
    supabase.from("contacts").select("id", { count: "exact", head: true }),
    supabase.from("inbound_inquiries").select("id", { count: "exact", head: true }),
    supabase.from("inbound_inquiries").select("id", { count: "exact", head: true }).eq("prospect_eligible", true),
    supabase.from("decks").select("id", { count: "exact", head: true }),
    supabase.from("accounts").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("leads_seen_at").eq("id", profile.id).maybeSingle(),
    supabase.from("link_engagement").select("deck_seconds, artifact_seconds, furthest_index, reached_cta, cta_clicks, updated_at, link:links(token, deck:decks(id, name, slug), contact:contacts(first_name, last_name, company, email, hubspot_url))").order("updated_at", { ascending: false }).limit(200),
  ]);

  const prevSeen = (me as { leads_seen_at?: string | null } | null)?.leads_seen_at ? new Date((me as { leads_seen_at: string }).leads_seen_at).getTime() : 0;
  const rows = ((engagement ?? []) as unknown as Row[]).filter((r) => r.link?.contact && r.link?.deck);

  // Score = intent (artifact/CTA/time) + depth + recency decay.
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
  const newTokens = new Set(ranked.filter((r) => new Date(r.updated_at).getTime() > prevSeen).map((r) => r.link!.token));
  // Re-baseline "seen" for this user (profiles writes go through the service role).
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

  const stats: { href: string; label: string; value: number; sub?: string }[] = [
    { href: "/companies", label: "Companies", value: n(companies), sub: `${n(industry).toLocaleString()} industry · ${n(needsType)} unclassified` },
    { href: "/prospecting", label: "Opportunities", value: n(opps), sub: `${n(tier1)} Tier-1` },
    { href: "/contacts", label: "Contacts", value: n(contacts) },
    { href: "/inbound", label: "Inbound", value: n(inbound), sub: `${n(inboundInd)} industry` },
    { href: "/campaigns", label: "Campaign accounts", value: n(accounts) },
    { href: "/decks", label: "Decks", value: n(decks) },
  ];

  const alerts: { href: string; head: string; desc: string; hot?: boolean }[] = [];
  if (newTokens.size) alerts.push({ href: "#hot-leads", head: `${newTokens.size} new lead signal${newTokens.size === 1 ? "" : "s"}`, desc: "Engagement since your last visit", hot: true });
  if (n(tier1)) alerts.push({ href: "/prospecting", head: `${n(tier1)} Tier-1 opportunities`, desc: "Strong-fit accounts ready to engage" });
  if (n(needsType)) alerts.push({ href: "/companies", head: `${n(needsType)} companies need a type`, desc: "Classify to include them in prospecting" });
  if (n(inboundInd)) alerts.push({ href: "/inbound", head: `${n(inboundInd)} industry inquiries`, desc: "Inbound from prospect-eligible orgs" });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-7 px-6 py-10">
      <header>
        <p className="eyebrow">Sales intelligence</p>
        <h1 className="mt-1 text-3xl">Home</h1>
        <p className="mt-1 text-sm text-ink-muted">Your pipeline at a glance — start with hot leads, then work the queues.</p>
      </header>

      {/* Launchpad: counts that double as section links */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Link key={s.href} href={s.href} className="card flex flex-col gap-1 p-4 transition-colors hover:bg-surface-subtle">
            <span className="text-[0.7rem] uppercase tracking-wide text-ink-muted">{s.label}</span>
            <span className="text-2xl text-ink">{s.value.toLocaleString()}</span>
            {s.sub && <span className="text-xs text-ink-muted/80">{s.sub}</span>}
          </Link>
        ))}
      </div>

      {/* Needs attention */}
      {alerts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-ink">Needs attention</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {alerts.map((a) => (
              <Link key={a.head} href={a.href} className={`card flex flex-col gap-0.5 border-l-2 p-3.5 transition-colors hover:bg-surface-subtle ${a.hot ? "border-l-primary" : "border-l-line-strong"}`}>
                <span className="text-sm font-medium text-ink">{a.head}</span>
                <span className="text-xs text-ink-muted">{a.desc}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Hot leads (merged from the former Leads page) */}
      <section id="hot-leads" className="flex flex-col gap-3 scroll-mt-20">
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
