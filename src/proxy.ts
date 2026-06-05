import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next 16: the `middleware` convention was renamed to `proxy` (nodejs runtime).
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Run on everything except static assets, the image optimizer, and the public
  // tracker (track.js must be reachable cross-origin without auth gating).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|track.js|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
