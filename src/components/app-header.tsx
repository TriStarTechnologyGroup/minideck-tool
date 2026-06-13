import Link from "next/link";
import { getProfile } from "@/lib/auth";
import MobileMenu from "./mobile-menu";
import { NavDropdown, AccountMenu } from "./nav-menus";

const RESEARCH_NAV = [
  { href: "/prospecting", label: "Prospecting" },
  { href: "/companies", label: "Companies" },
  { href: "/contacts", label: "Contacts" },
  { href: "/research/roles", label: "Decision-maker roles" },
];
const SALES_NAV = [
  { href: "/inbound", label: "Inbound" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/decks", label: "Decks" },
  { href: "/digest", label: "Digest" },
];
const CATALOG_NAV = [
  { href: "/catalog/tma", label: "TMAs" },
  { href: "/catalog/capabilities", label: "Capabilities" },
];
const ADMIN_NAV = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/scoring", label: "Scoring model" },
  { href: "/admin/models", label: "AI models" },
  { href: "/admin/costs", label: "Spend" },
  { href: "/admin/evals", label: "Evals" },
];

export default async function AppHeader() {
  const profile = await getProfile();
  if (!profile) return null; // hidden on /login and when signed out

  const isAdmin = profile.role === "admin";

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-ink-deep">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-7">
          <Link href="/" className="flex items-center" aria-label="TriStar — Home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/tristar-logo.svg"
              alt="TriStar Technology Group"
              className="h-7 w-auto [filter:brightness(0)_invert(1)]"
            />
          </Link>
          <nav className="hidden items-center gap-5 text-sm lg:flex">
            <NavDropdown label="Research" items={RESEARCH_NAV} />
            <NavDropdown label="Sales" items={SALES_NAV} />
            <NavDropdown label="Catalog" items={CATALOG_NAV} />
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
