import Link from "next/link";
import { integrationStatus } from "@/lib/env.server";

export const dynamic = "force-dynamic";

const INTEGRATIONS: { key: keyof typeof integrationStatus; label: string; note: string }[] = [
  { key: "supabase", label: "Supabase", note: "Postgres + Auth + Storage" },
  { key: "hubspot", label: "HubSpot", note: "Contact upsert + timeline note" },
  { key: "plausible", label: "Plausible", note: "Per-link stats (Stats API v2)" },
  { key: "screenshots", label: "Screenshots", note: "Microlink (free tier, no key)" },
];

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-2">
        <p className="text-sm font-medium text-neutral-500">TriStar Technology Group</p>
        <h1 className="text-2xl font-semibold tracking-tight">Minideck Link &amp; Tracking Tool</h1>
        <p className="text-sm text-neutral-500">
          Milestone 1 scaffold. Configure the integrations below, then build out auth,
          decks, contacts/links, and stats.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Integration readiness
        </h2>
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {INTEGRATIONS.map(({ key, label, note }) => {
            const ok = integrationStatus[key];
            return (
              <li key={key} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-neutral-500">{note}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    ok
                      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                  }`}
                >
                  {ok ? "Configured" : "Not configured"}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-neutral-500">
          The tracker is served at{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-800">/track.js</code>.
          See <code>../SETUP.md</code> for provisioning steps.
        </p>
      </section>

      <Link
        href="/decks"
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-neutral-900 underline-offset-4 hover:underline dark:text-white"
      >
        Go to app →
      </Link>
    </main>
  );
}
