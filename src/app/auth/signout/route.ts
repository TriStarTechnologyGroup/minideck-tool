import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 so the browser issues a GET to /login after the POST.
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
