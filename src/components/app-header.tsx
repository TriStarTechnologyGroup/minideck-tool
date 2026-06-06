import Link from "next/link";
import { getProfile } from "@/lib/auth";

export default async function AppHeader() {
  const profile = await getProfile();
  if (!profile) return null; // hidden on /login and when signed out

  const isAdmin = profile.role === "admin";

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-7">
          <Link href="/decks" className="flex items-center" aria-label="TriStar — Decks">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/tristar-logo.svg" alt="TriStar Technology Group" className="h-7 w-auto" />
          </Link>
          <nav className="hidden items-center gap-5 text-sm sm:flex">
            <Link href="/decks" className="font-medium text-ink transition-colors hover:text-link">
              Decks
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-ink-muted sm:inline">{profile.email}</span>
          <span className={`chip ${isAdmin ? "bg-surface-blue text-nav" : "bg-surface-muted text-ink-muted"}`}>
            {profile.role}
          </span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn btn-ghost btn-xs">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
