import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { slideCount } from "@/lib/slides";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hot leads — Minideck" };

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

function fmtDuration(s: number): string {
  if (!s) return "0s";
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
}
function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

export default async function LeadsPage() {
  await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("link_engagement")
    .select(
      "deck_seconds, artifact_seconds, furthest_index, reached_cta, cta_clicks, updated_at, link:links(token, deck:decks(id, name, slug), contact:contacts(first_name, last_name, company, email, hubspot_url))",
    )
    .order("updated_at", { ascending: false })
    .limit(200);

  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.link?.contact && r.link?.deck);

  // Score = intent (artifact/CTA/time) + depth + recency decay.
  function score(r: Row): number {
    const total = r.link?.deck ? slideCount(r.link.deck.slug) : 0;
    const depthPct = total ? r.furthest_index / total : 0;
    const recency = Math.max(0, 1 - daysAgo(r.updated_at) / 14); // 1.0 today → 0 at ~2 weeks
    let s = 0;
    s += Math.min(r.deck_seconds, 300) / 300; // engaged time, capped
    s += depthPct;
    if (r.reached_cta) s += 0.6;
    if (r.artifact_seconds > 0) s += 0.8;
    if (r.cta_clicks?.cta_inquire) s += 1.2; // inquired
    if (r.cta_clicks?.cta_book_meeting) s += 2.0; // booked a meeting — top of the list
    return (s + 0.2) * (0.4 + 0.6 * recency); // recency multiplier
  }
  const ranked = rows
    .map((r) => ({ r, s: score(r) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.r);

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

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <header>
        <p className="eyebrow">Sales intelligence</p>
        <h1 className="mt-1 text-3xl">Hot leads</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Every engaged prospect across all decks, ranked by intent × depth × recency. Start your day here.
        </p>
      </header>

      {ranked.length === 0 ? (
        <p className="card px-6 py-12 text-center text-sm text-ink-muted">
          No engagement yet. Generate links and they’ll appear here as prospects open them.
        </p>
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
                      <Link href={`/links/${r.link!.token}`} className="font-medium text-ink hover:text-link">
                        {`${r.link!.contact!.first_name} ${r.link!.contact!.last_name}`.trim()} →
                      </Link>
                      <div className="text-xs text-ink-muted">{r.link!.contact!.email}</div>
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">{r.link!.contact!.company ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/decks/${r.link!.deck!.id}`} className="text-link hover:underline">
                        {r.link!.deck!.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`chip ${sig.cls}`}>{sig.label}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink">{fmtDuration(r.deck_seconds)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink">
                      {total ? `${r.furthest_index}/${total}` : r.furthest_index}
                    </td>
                    <td className="px-4 py-2.5 text-ink">{r.artifact_seconds > 0 ? "Yes" : "No"}</td>
                    <td className="px-4 py-2.5">
                      {r.cta_clicks?.cta_book_meeting ? (
                        <span className="chip bg-primary text-white">📅 Meeting</span>
                      ) : r.cta_clicks?.cta_inquire ? (
                        <span className="chip bg-surface-blue-soft text-link">Inquire</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-muted">
                      {d === 0 ? "today" : `${d}d ago`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-muted/70">
        Engaged time + depth + artifact from the engagement collector. Click a prospect for the full view.
      </p>
    </main>
  );
}
