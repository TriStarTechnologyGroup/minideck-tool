"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";

function useDismiss(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [onClose]);
  return ref;
}

const chevron = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/** A top-bar dropdown of links (e.g. Admin). */
export function NavDropdown({ label, items }: { label: string; items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(() => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open}
        className="flex items-center gap-1 font-medium text-white/90 transition-colors hover:text-primary">
        {label} {chevron}
      </button>
      {open && (
        <div className="absolute left-0 mt-2 min-w-[11rem] rounded-md border border-white/10 bg-ink-deep py-1 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)]">
          {items.map((i) => (
            <Link key={i.href} href={i.href} onClick={() => setOpen(false)}
              className="block px-3.5 py-2 text-sm text-white/90 transition-colors hover:bg-white/10 hover:text-primary">
              {i.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Account menu on the right: email + role + sign-out, tucked behind an avatar/role chip. */
export function AccountMenu({ email, role }: { email: string; role: string }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(() => setOpen(false));
  const initial = email.trim().charAt(0).toUpperCase() || "?";
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open} aria-label="Account menu"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm font-medium text-white/90 transition-colors hover:bg-white/20">
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 min-w-[14rem] rounded-md border border-white/10 bg-ink-deep p-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)]">
          <div className="px-2.5 py-2">
            <div className="truncate text-sm text-white/90">{email}</div>
            <span className={`mt-1 inline-block chip ${role === "admin" ? "bg-primary/20 text-primary-light" : "bg-white/10 text-white/70"}`}>{role}</span>
          </div>
          <form action="/auth/signout" method="post" className="border-t border-white/10 pt-1">
            <button type="submit" className="block w-full rounded-sm px-2.5 py-2 text-left text-sm text-white/90 transition-colors hover:bg-white/10">
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
