import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Deck } from "@/lib/decks";

export const dynamic = "force-dynamic";

export default async function DecksPage() {
  const profile = await requireUser();
  const isAdmin = profile.role === "admin";
  const supabase = await createClient();

  const { data: decks } = await supabase
    .from("decks")
    .select("*")
    .order("archived", { ascending: true })
    .order("created_at", { ascending: true });

  const { data: links } = await supabase.from("links").select("deck_id");
  const linkCounts = new Map<string, number>();
  (links ?? []).forEach((l: { deck_id: string }) =>
    linkCounts.set(l.deck_id, (linkCounts.get(l.deck_id) ?? 0) + 1),
  );

  const all = (decks ?? []) as Deck[];
  const active = all.filter((d) => !d.archived);
  const archived = all.filter((d) => d.archived);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Sales enablement</p>
          <h1 className="mt-1 text-3xl">Decks</h1>
        </div>
        {isAdmin && (
          <Link href="/decks/new" className="btn btn-primary">
            + Add deck
          </Link>
        )}
      </header>

      {active.length === 0 ? (
        <div className="card px-6 py-14 text-center text-sm text-ink-muted">
          No decks yet.{isAdmin ? " Click “Add deck” to create one." : " An admin hasn’t added any yet."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((deck) => (
            <DeckCard key={deck.id} deck={deck} count={linkCounts.get(deck.id) ?? 0} isAdmin={isAdmin} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-ink-muted transition-colors hover:text-ink">
            Archived ({archived.length})
          </summary>
          <div className="mt-4 grid grid-cols-1 gap-5 opacity-70 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map((deck) => (
              <DeckCard key={deck.id} deck={deck} count={linkCounts.get(deck.id) ?? 0} isAdmin={isAdmin} />
            ))}
          </div>
        </details>
      )}
    </main>
  );
}

function DeckCard({ deck, count, isAdmin }: { deck: Deck; count: number; isAdmin: boolean }) {
  // PDF leave-behind lives next to the deck at <base_url>/<slug>.pdf (generated in minideck-decks).
  const pdfUrl = `${deck.base_url.replace(/\/$/, "")}/${deck.slug}.pdf`;
  return (
    <div className="card group flex flex-col overflow-hidden transition-shadow hover:shadow-[var(--shadow-pop)]">
      <Link href={`/decks/${deck.id}`} className="block aspect-[16/10] w-full overflow-hidden bg-surface-blue">
        {deck.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={deck.thumbnail_url}
            alt={`${deck.name} preview`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-ink-muted/60">No thumbnail</div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link href={`/decks/${deck.id}`} className="font-display text-lg font-medium text-ink hover:text-link">
              {deck.name}
            </Link>
            <p className="text-xs text-ink-muted">{deck.slug}</p>
          </div>
          {deck.archived && <span className="chip bg-surface-muted text-ink-muted">archived</span>}
        </div>
        <a
          href={deck.base_url}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-xs text-link underline-offset-2 hover:underline"
        >
          {deck.base_url}
        </a>
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="text-sm font-medium text-ink">
            {count} link{count === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-3">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={`TriStar Technology Group — ${deck.name}.pdf`}
              className="inline-flex items-center gap-1 text-xs font-medium text-link hover:underline"
              aria-label={`Download the ${deck.name} deck as a PDF`}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12" /><polyline points="7 10 12 15 17 10" /><path d="M5 21h14" />
              </svg>
              PDF
            </a>
            {isAdmin && (
              <Link href={`/decks/${deck.id}/edit`} className="text-xs font-medium text-link hover:underline">
                Edit
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
