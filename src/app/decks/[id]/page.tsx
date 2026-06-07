import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Deck } from "@/lib/decks";
import { isHubspotConfigured } from "@/lib/hubspot";
import { isPlausibleConfigured } from "@/lib/plausible";
import { slideCount } from "@/lib/slides";
import NewLinkForm from "./new-link-form";
import LinkTable, { type LinkRow } from "./link-table";
import DeckHeatmap from "./deck-heatmap";

export const dynamic = "force-dynamic";

type DbRow = {
  id: string;
  token: string;
  full_url: string;
  created_at: string;
  contact: {
    id: string;
    first_name: string;
    last_name: string;
    company: string | null;
    email: string;
    hubspot_id: string | null;
    hubspot_url: string | null;
  } | null;
};

export default async function DeckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireUser();
  const isAdmin = profile.role === "admin";
  const { id } = await params;
  const supabase = await createClient();

  const { data: deckData } = await supabase.from("decks").select("*").eq("id", id).single();
  if (!deckData) notFound();
  const deck = deckData as Deck;

  const { data } = await supabase
    .from("links")
    .select(
      "id, token, full_url, created_at, contact:contacts(id, first_name, last_name, company, email, hubspot_id, hubspot_url)",
    )
    .eq("deck_id", id)
    .order("created_at", { ascending: false });

  const dbRows = (data ?? []) as unknown as DbRow[];
  const rows: LinkRow[] = dbRows.map((r) => ({
    id: r.id,
    token: r.token,
    full_url: r.full_url,
    created_at: r.created_at,
    contact: r.contact
      ? {
          id: r.contact.id,
          name: `${r.contact.first_name} ${r.contact.last_name}`.trim(),
          email: r.contact.email,
          company: r.contact.company,
          hubspot_id: r.contact.hubspot_id,
          hubspot_url: r.contact.hubspot_url,
        }
      : null,
  }));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/decks" className="text-sm text-link hover:underline">
          ← Decks
        </Link>
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {deck.thumbnail_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={deck.thumbnail_url}
                alt=""
                className="h-14 w-24 rounded-sm border border-line object-cover"
              />
            )}
            <div>
              <h1 className="text-2xl">{deck.name}</h1>
              <a
                href={deck.base_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-link hover:underline"
              >
                {deck.base_url}
              </a>
            </div>
          </div>
          {isAdmin && (
            <Link href={`/decks/${deck.id}/edit`} className="btn btn-ghost btn-xs">
              Edit deck
            </Link>
          )}
        </div>
      </div>

      <NewLinkForm deckId={deck.id} />

      <section>
        <LinkTable
          rows={rows}
          hubspotOn={isHubspotConfigured()}
          plausibleOn={isPlausibleConfigured()}
          slideTotal={slideCount(deck.slug)}
          isAdmin={isAdmin}
        />
      </section>

      <details className="group">
        <summary className="cursor-pointer font-display text-lg font-medium text-ink">
          Audience engagement{" "}
          <span className="font-sans text-sm font-normal text-ink-muted">(all prospects · slide heatmap)</span>
        </summary>
        <div className="mt-3">
          <DeckHeatmap deckId={deck.id} deckSlug={deck.slug} />
        </div>
      </details>
    </main>
  );
}
