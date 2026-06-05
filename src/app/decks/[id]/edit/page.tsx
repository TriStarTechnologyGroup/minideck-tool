import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Deck } from "@/lib/decks";
import DeckForm from "../../deck-form";

export const dynamic = "force-dynamic";

export default async function EditDeckPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const supabase = await createClient();
  const { data: deck } = await supabase.from("decks").select("*").eq("id", id).single();
  if (!deck) notFound();

  return (
    <main className="mx-auto flex max-w-lg flex-1 flex-col gap-6 px-6 py-12">
      <div className="space-y-1">
        <Link href="/decks" className="text-sm text-neutral-500 hover:underline">
          ← Decks
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Edit deck</h1>
      </div>
      <DeckForm deck={deck as Deck} />
    </main>
  );
}
