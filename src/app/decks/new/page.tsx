import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import DeckForm from "../deck-form";

export const dynamic = "force-dynamic";

export default async function NewDeckPage() {
  await requireAdmin();
  return (
    <main className="mx-auto flex max-w-lg flex-1 flex-col gap-6 px-6 py-12">
      <div className="space-y-1">
        <Link href="/decks" className="text-sm text-neutral-500 hover:underline">
          ← Decks
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Add deck</h1>
        <p className="text-sm text-neutral-500">
          A thumbnail is captured automatically from the base URL on save.
        </p>
      </div>
      <DeckForm />
    </main>
  );
}
