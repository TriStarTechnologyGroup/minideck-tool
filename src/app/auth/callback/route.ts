import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Only honor same-origin, root-relative redirect targets. Rejects absolute URLs
// (https://evil.com) and protocol-relative ones (//evil.com) to prevent an open
// redirect via ?redirect=. Falls back to /decks.
function safeRedirect(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/decks";
  return raw;
}

// OAuth (Google SSO) redirect target. Supabase sends ?code=… here; we exchange it for a
// session (sets auth cookies) then bounce to the intended page.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const redirect = safeRedirect(url.searchParams.get("redirect"));

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(redirect, url.origin));
}
