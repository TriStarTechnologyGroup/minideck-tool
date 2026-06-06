import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMergedStats } from "@/lib/link-stats";
import { SLIDE_SLUGS, slideCount, slideLabel } from "@/lib/slides";
import CopyButton from "@/components/copy-button";

export const dynamic = "force-dynamic";

function fmtDuration(s: number): string {
  if (!s) return "0s";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m ? `${m}m ${sec}s` : `${sec}s`;
}
function daysAgo(dateStr: string): number {
  const d = new Date(dateStr.length <= 10 ? dateStr + "T00:00:00Z" : dateStr).getTime();
  return Math.max(0, Math.floor((Date.now() - d) / 86_400_000));
}

type DeckRef = { id: string; name: string; slug: string; base_url: string; plausible_site_id: string };
type ContactRef = {
  first_name: string;
  last_name: string;
  position: string | null;
  company: string | null;
  email: string;
  hubspot_url: string | null;
};

export default async function LinkDetailPage({ params }: { params: Promise<{ token: string }> }) {
  await requireUser();
  const { token } = await params;
  const supabase = await createClient();

  const { data: linkRow } = await supabase
    .from("links")
    .select(
      "token, full_url, created_at, contact:contacts(first_name, last_name, position, company, email, hubspot_url), deck:decks(id, name, slug, base_url, plausible_site_id)",
    )
    .eq("token", token)
    .single();
  if (!linkRow) notFound();

  const deck = linkRow.deck as unknown as DeckRef;
  const contact = linkRow.contact as unknown as ContactRef | null;
  const stats = await getMergedStats(deck.plausible_site_id, token);

  const name = contact ? `${contact.first_name} ${contact.last_name}`.trim() : "Unknown contact";
  const N = slideCount(deck.slug);
  const depthPct = N ? Math.round((stats.furthestSlide / N) * 100) : 0;
  const reachedCta = N > 0 && stats.furthestSlide >= N;
  const dropoffSlug = stats.furthestSlide > 0 ? SLIDE_SLUGS[deck.slug]?.[stats.furthestSlide - 1] : undefined;

  const signal = computeSignal();
  function computeSignal() {
    if (!stats.opened)
      return { level: "Not opened", cls: "bg-surface-muted text-ink-muted", action: "Hasn’t opened the link yet. Consider a follow-up nudge or confirm it reached them." };
    const hot = stats.artifactViews > 0 || (reachedCta && stats.timeSeconds >= 60) || stats.timeSeconds >= 120;
    const warm = stats.timeSeconds >= 30 || depthPct >= 50 || stats.views >= 3;
    if (hot) return { level: "Hot", cls: "bg-primary text-white", action: "High intent — reach out now while it’s top of mind." };
    if (warm) return { level: "Warm", cls: "bg-surface-blue-soft text-link", action: "Engaged — a timely, tailored follow-up is worthwhile." };
    return { level: "Opened — light", cls: "bg-surface-muted text-nav", action: "Took a quick look. A short, value-led nudge may re-engage them." };
  }

  const insights: string[] = [];
  // CTA clicks are the strongest signal — surface first.
  if (stats.ctaClicks?.cta_book_meeting) insights.push("Clicked “Book a meeting” — top intent. Prioritize this follow-up.");
  else if (stats.ctaClicks?.cta_inquire) insights.push("Clicked “Inquire” — strong intent; respond promptly.");
  if (stats.lastSeen) {
    const d = daysAgo(stats.lastSeen);
    insights.push(d === 0 ? "Engaged today — strike while it’s fresh." : `Last engaged ${d} day${d === 1 ? "" : "s"} ago.${d >= 7 ? " Going cold — worth a nudge." : ""}`);
  }
  if (stats.views >= 3) insights.push(`Returned multiple times (${stats.views} page loads) — strong, sustained interest.`);
  if (stats.artifactViews > 0) insights.push(`Opened the example/data page${stats.artifactSeconds ? ` (${fmtDuration(stats.artifactSeconds)})` : ""} — ready for a deeper, data-driven conversation.`);
  const topSlide = Object.entries(stats.perSlideSeconds).sort((a, b) => b[1] - a[1])[0];
  if (topSlide && topSlide[1] > 0) insights.push(`Spent the most time on “${slideLabel(topSlide[0])}” — lead with that topic.`);
  if (reachedCta) insights.push("Reached the call-to-action slide.");
  else if (dropoffSlug) insights.push(`Dropped off around “${slideLabel(dropoffSlug)}” (slide ${stats.furthestSlide} of ${N}).`);
  if (insights.length === 0) insights.push("No engagement recorded yet.");

  const order = SLIDE_SLUGS[deck.slug] ?? [];
  const viewsBySlug = new Map(stats.slides.map((s) => [s.slide, s.views]));
  const maxSecs = Math.max(1, ...Object.values(stats.perSlideSeconds));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link href={`/decks/${deck.id}`} className="text-sm text-link hover:underline">
          ← {deck.name}
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl">{name}</h1>
            <p className="text-sm text-ink-muted">{[contact?.position, contact?.company].filter(Boolean).join(" · ") || "—"}</p>
            <p className="text-sm text-ink-muted">{contact?.email}</p>
          </div>
          {contact?.hubspot_url && (
            <a href={contact.hubspot_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              Open in HubSpot ↗
            </a>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <span className="chip bg-surface-muted text-ink-muted">{deck.name}</span>
          <code className="max-w-[20rem] truncate">{linkRow.full_url}</code>
          <CopyButton value={linkRow.full_url} />
          <span>· created {new Date(linkRow.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Signal */}
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <span className={`chip text-sm ${signal.cls}`} style={{ padding: "0.25rem 0.75rem" }}>
          {signal.level}
        </span>
        <p className="text-sm text-ink-muted">{signal.action}</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card label="Opened" value={stats.opened ? "Yes" : "No"} sub={stats.opened ? `${stats.views} page load${stats.views === 1 ? "" : "s"}` : undefined} />
        <Card label="Last seen" value={stats.lastSeen ? `${daysAgo(stats.lastSeen)}d ago` : "—"} sub={stats.lastSeen ?? undefined} />
        <Card label="Engaged time" value={fmtDuration(stats.timeSeconds)} sub="visible-only" />
        <Card label="Slide depth" value={N ? `${stats.furthestSlide} / ${N}` : String(stats.furthestSlide)} sub={N ? `${depthPct}%` : undefined} />
        <Card label="Reached CTA" value={reachedCta ? "Yes" : "No"} />
        <Card label="Artifact page" value={stats.artifactViews > 0 ? "Yes" : "No"} sub={stats.artifactSeconds ? fmtDuration(stats.artifactSeconds) : undefined} />
        <Card
          label="CTA clicked"
          value={stats.ctaClicks?.cta_book_meeting ? "Book meeting" : stats.ctaClicks?.cta_inquire ? "Inquire" : "—"}
        />
      </div>

      {/* Follow-up insights */}
      <section>
        <h2 className="mb-2 font-display text-lg font-medium text-ink">Follow-up insights</h2>
        <ul className="card space-y-2 p-4 text-sm text-ink-muted">
          {insights.map((t, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-primary">•</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Slide-by-slide */}
      <section>
        <h2 className="mb-2 font-display text-lg font-medium text-ink">Slide-by-slide engagement</h2>
        {order.length === 0 ? (
          <p className="text-sm text-ink-muted">No slide taxonomy for this deck.</p>
        ) : (
          <div className="card space-y-2 p-4">
            {order.map((slug, i) => {
              const views = viewsBySlug.get(slug) ?? 0;
              const secs = stats.perSlideSeconds[slug] ?? 0;
              const seen = views > 0 || secs > 0;
              return (
                <div key={slug} className={`flex items-center gap-3 text-sm ${seen ? "" : "opacity-40"}`}>
                  <span className="w-5 text-right text-xs text-ink-muted/60">{i + 1}</span>
                  <span className="w-44 shrink-0 truncate text-ink">{slideLabel(slug)}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((secs / maxSecs) * 100)}%` }} />
                  </div>
                  <span className="w-28 shrink-0 text-right text-xs text-ink-muted">
                    {seen ? `${views} view${views === 1 ? "" : "s"} · ${fmtDuration(secs)}` : "not viewed"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-xs text-ink-muted/70">
          Counts (views, depth, opened, artifact) from Plausible; time is engaged (visible-only) from our collector.
        </p>
      </section>
    </main>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-ink-muted/70">{label}</p>
      <p className="mt-1 font-display text-xl font-medium text-ink">{value}</p>
      {sub && <p className="text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}
