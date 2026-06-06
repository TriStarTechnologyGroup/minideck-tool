import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth (Google SSO) redirect target. Supabase sends ?code=… here; we exchange it for a
// session (sets auth cookies) then bounce to the intended page.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const redirect = url.searchParams.get("redirect") || "/decks";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(redirect, url.origin));
}
