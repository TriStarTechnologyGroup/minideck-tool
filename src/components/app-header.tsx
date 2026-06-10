import Link from "next/link";
import { getProfile } from "@/lib/auth";

export default async function AppHeader() {
  const profile = await getProfile();
  if (!profile) return null; // hidden on /login and when signed out

  const isAdmin = profile.role === "admin";

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-ink-deep">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-7">
          <Link href="/decks" className="flex items-center" aria-label="TriStar — Decks">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/tristar-logo.svg"
              alt="TriStar Technology Group"
              className="h-7 w-auto [filter:brightness(0)_invert(1)]"
            />
          </Link>
          <nav className="hidden items-center gap-5 text-sm sm:flex">
            <Link href="/decks" className="font-medium text-white/90 transition-colors hover:text-primary">
              Decks
            </Link>
            <Link href="/leads" className="font-medium text-white/90 transition-colors hover:text-primary">
              Leads
            </Link>
            <Link href="/campaigns" className="font-medium text-white/90 transition-colors hover:text-primary">
              Campaigns
            </Link>
            <Link href="/prospecting" className="font-medium text-white/90 transition-colors hover:text-primary">
              Prospecting
            </Link>
            {isAdmin && (
              <>
                <Link href="/admin/users" className="font-medium text-white/90 transition-colors hover:text-primary">
                  Users
                </Link>
                <Link href="/admin/audit" className="font-medium text-white/90 transition-colors hover:text-primary">
                  Audit
                </Link>
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-white/60 sm:inline">{profile.email}</span>
          <span className={`chip ${isAdmin ? "bg-primary/20 text-primary-light" : "bg-white/10 text-white/70"}`}>
            {profile.role}
          </span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-none border border-white/25 px-2.5 py-1 text-xs font-medium text-white/90 transition-colors hover:bg-white/10"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
