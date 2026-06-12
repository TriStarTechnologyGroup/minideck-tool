"use client";

import Link from "next/link";
import { useState } from "react";

const LINKS: [string, string][] = [
  ["/decks", "Decks"],
  ["/leads", "Leads"],
  ["/campaigns", "Campaigns"],
  ["/inbound", "Inbound"],
  ["/prospecting", "Prospecting"],
  ["/companies", "Companies"],
  ["/catalog", "Catalog"],
];
const ADMIN_LINKS: [string, string][] = [
  ["/admin/users", "Users"],
  ["/admin/audit", "Audit"],
  ["/admin/scoring", "Scoring"],
];

// Hamburger nav for narrow screens (below lg, where the inline nav is hidden).
export default function MobileMenu({ isAdmin, email }: { isAdmin: boolean; email: string }) {
  const [open, setOpen] = useState(false);
  const links = isAdmin ? [...LINKS, ...ADMIN_LINKS] : LINKS;

  return (
    <div className="relative lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
        aria-expanded={open}
        className="flex items-center rounded-none border border-white/25 p-1.5 text-white/90 transition-colors hover:bg-white/10"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? (<><line x1="6" y1="6" x2="18" y2="18" /><line x1="6" y1="18" x2="18" y2="6" /></>) : (<><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></>)}
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
          <nav className="absolute right-0 z-40 mt-2 w-52 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-lg">
            <p className="truncate border-b border-line px-4 py-2 text-xs text-ink-muted">{email}</p>
            {links.map(([href, label]) => (
              <Link key={href} href={href} onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-ink hover:bg-surface-subtle">
                {label}
              </Link>
            ))}
            <form action="/auth/signout" method="post" className="border-t border-line">
              <button type="submit" className="block w-full px-4 py-2 text-left text-sm text-ink hover:bg-surface-subtle">Sign out</button>
            </form>
          </nav>
        </>
      )}
    </div>
  );
}
