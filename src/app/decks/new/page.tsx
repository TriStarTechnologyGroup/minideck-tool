import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import DeckForm from "../deck-form";

export const dynamic = "force-dynamic";

export default async function NewDeckPage() {
  await requireAdmin();
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/decks" className="text-sm text-link hover:underline">
          ← Decks
        </Link>
        <h1 className="mt-2 text-2xl">Add deck</h1>
        <p className="mt-1 text-sm text-ink-muted">A thumbnail is captured automatically from the base URL on save.</p>
      </div>
      <DeckForm />
    </main>
  );
}
