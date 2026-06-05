import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/api";
import { serverEnv } from "@/lib/env.server";
import { isHubspotConfigured, upsertContact, buildContactUrl } from "@/lib/hubspot";

// POST /api/contacts/sync { contactId } — retry the HubSpot contact upsert.
export async function POST(req: NextRequest) {
  const guard = await requireApiUser();
  if (guard.error) return guard.error;
  if (!isHubspotConfigured()) {
    return NextResponse.json({ error: "HubSpot is not configured" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const contactId = typeof body?.contactId === "string" ? body.contactId : null;
  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: c } = await admin
    .from("contacts")
    .select("id, first_name, last_name, position, company, email")
    .eq("id", contactId)
    .single();
  if (!c) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  try {
    const hubspotId = await upsertContact(c);
    const hubspot_url = buildContactUrl(serverEnv.HUBSPOT_PORTAL_ID, hubspotId);
    await admin.from("contacts").update({ hubspot_id: hubspotId, hubspot_url }).eq("id", contactId);
    return NextResponse.json({ hubspot_id: hubspotId, hubspot_url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sync failed" }, { status: 502 });
  }
}
