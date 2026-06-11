import Link from "next/link";
import { getProfile } from "@/lib/auth";
import MobileMenu from "./mobile-menu";
import { NavDropdown, AccountMenu } from "./nav-menus";

const PRIMARY_NAV = [
  { href: "/decks", label: "Decks" },
  { href: "/leads", label: "Leads" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/prospecting", label: "Prospecting" },
  { href: "/catalog", label: "Catalog" },
];
const ADMIN_NAV = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/scoring", label: "Scoring model" },
];

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
          <nav className="hidden items-center gap-5 text-sm lg:flex">
            {PRIMARY_NAV.map((i) => (
              <Link key={i.href} href={i.href} className="font-medium text-white/90 transition-colors hover:text-primary">
                {i.label}
              </Link>
            ))}
            {isAdmin && <NavDropdown label="Admin" items={ADMIN_NAV} />}
          </nav>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <div className="hidden lg:block">
            <AccountMenu email={profile.email} role={profile.role} />
          </div>
          <MobileMenu isAdmin={isAdmin} email={profile.email} />
        </div>
      </div>
    </header>
  );
}
