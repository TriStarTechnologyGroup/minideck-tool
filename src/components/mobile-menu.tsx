"use client";

import Link from "next/link";
import { useState } from "react";

type Group = { label: string; items: [string, string][] };
const GROUPS: Group[] = [
  { label: "Research", items: [["/prospecting", "Prospecting"], ["/companies", "Companies"], ["/contacts", "Contacts"], ["/research/roles", "Decision-maker roles"]] },
  { label: "Sales", items: [["/inbound", "Inbound"], ["/campaigns", "Campaigns"], ["/decks", "Decks"], ["/leads", "Leads"]] },
  { label: "Catalog", items: [["/catalog/tma", "TMAs"], ["/catalog/capabilities", "Capabilities"]] },
];
const ADMIN_GROUP: Group = { label: "Admin", items: [["/admin/users", "Users"], ["/admin/audit", "Audit"], ["/admin/scoring", "Scoring"], ["/admin/models", "AI models"], ["/admin/costs", "Spend"], ["/admin/evals", "Evals"]] };

// Hamburger nav for narrow screens (below lg, where the inline nav is hidden).
export default function MobileMenu({ isAdmin, email }: { isAdmin: boolean; email: string }) {
  const [open, setOpen] = useState(false);
  const groups = isAdmin ? [...GROUPS, ADMIN_GROUP] : GROUPS;

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
            {groups.map((g, gi) => (
              <div key={g.label || gi} className={gi > 0 ? "border-t border-line pt-1" : ""}>
                {g.label && <p className="px-4 pt-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-muted/70">{g.label}</p>}
                {g.items.map(([href, label]) => (
                  <Link key={href} href={href} onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-ink hover:bg-surface-subtle">
                    {label}
                  </Link>
                ))}
              </div>
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
