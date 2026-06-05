import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { isHubspotConfigured, searchContacts } from "@/lib/hubspot";

// GET /api/hubspot/contacts/search?q=... — typeahead search over HubSpot contacts.
export async function GET(req: NextRequest) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!isHubspotConfigured() || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchContacts(q);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
