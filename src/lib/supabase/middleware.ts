import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv, hasSupabasePublicEnv } from "@/lib/env.public";

// Paths reachable without a session.
const PUBLIC_PREFIXES = ["/login", "/auth"];
function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Refreshes the Supabase auth cookies on every request and gates protected routes.
 * Called from src/proxy.ts (Next 16 renamed `middleware` → `proxy`).
 */
export async function updateSession(request: NextRequest) {
  // If Supabase isn't configured yet, don't gate anything.
  if (!hasSupabasePublicEnv()) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not insert logic between client creation and getUser() — it refreshes tokens.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // API routes enforce their own auth and return JSON status codes — never redirect them.
  const isApi = pathname.startsWith("/api");
  if (!user && !isApi && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
