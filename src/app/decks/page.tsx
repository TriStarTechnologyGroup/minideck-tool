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
    <main className="mx-auto flex max-w-4xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Decks</h1>
          <p className="text-sm text-neutral-500">
            {profile.email}
            <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {profile.role}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link
              href="/decks/new"
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              + Add Deck
            </Link>
          )}
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {active.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center text-sm text-neutral-500 dark:border-neutral-700">
          No decks yet.{isAdmin ? " Click “Add Deck” to create one." : " An admin hasn’t added any yet."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((deck) => (
            <DeckCard key={deck.id} deck={deck} count={linkCounts.get(deck.id) ?? 0} isAdmin={isAdmin} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
            Archived ({archived.length})
          </summary>
          <div className="mt-4 grid grid-cols-1 gap-4 opacity-70 sm:grid-cols-2 lg:grid-cols-3">
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
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="aspect-[16/10] w-full bg-neutral-100 dark:bg-neutral-900">
        {deck.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={deck.thumbnail_url} alt={`${deck.name} preview`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-neutral-400">No thumbnail</div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link href={`/decks/${deck.id}`} className="font-medium leading-tight hover:underline">
              {deck.name}
            </Link>
            <p className="text-xs text-neutral-500">{deck.slug}</p>
          </div>
          {deck.archived && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              archived
            </span>
          )}
        </div>
        <a
          href={deck.base_url}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-xs text-neutral-500 underline-offset-2 hover:underline"
        >
          {deck.base_url}
        </a>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-xs text-neutral-500">{count} link{count === 1 ? "" : "s"}</span>
          {isAdmin && (
            <Link
              href={`/decks/${deck.id}/edit`}
              className="text-xs font-medium text-neutral-700 underline-offset-2 hover:underline dark:text-neutral-300"
            >
              Edit
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
