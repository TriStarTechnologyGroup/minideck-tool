import "server-only";
import { serverEnv } from "@/lib/env.server";

const BASE = "https://api.hubapi.com";

export function isHubspotConfigured(): boolean {
  return Boolean(serverEnv.HUBSPOT_TOKEN);
}

function headers() {
  return {
    Authorization: `Bearer ${serverEnv.HUBSPOT_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export interface ContactFields {
  first_name: string;
  last_name: string;
  position: string | null;
  company: string | null;
  email: string;
}

function toProperties(c: ContactFields): Record<string, string> {
  const p: Record<string, string> = {
    email: c.email,
    firstname: c.first_name,
    lastname: c.last_name,
  };
  if (c.position) p.jobtitle = c.position;
  if (c.company) p.company = c.company;
  return p;
}

/** Upsert a contact by email (search → update, else create). Returns the HubSpot contact id. */
export async function upsertContact(c: ContactFields): Promise<string> {
  const properties = toProperties(c);

  const search = await fetch(`${BASE}/crm/v3/objects/contacts/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: c.email }] }],
      properties: ["email"],
      limit: 1,
    }),
  });

  if (search.ok) {
    const found = (await search.json())?.results?.[0];
    if (found?.id) {
      await fetch(`${BASE}/crm/v3/objects/contacts/${found.id}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ properties }),
      });
      return String(found.id);
    }
  }

  const create = await fetch(`${BASE}/crm/v3/objects/contacts`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ properties }),
  });
  if (create.ok) return String((await create.json()).id);

  // Race: created between our search and create → HubSpot returns the existing id.
  if (create.status === 409) {
    const txt = await create.text();
    const id = txt.match(/Existing ID:\s*(\d+)/)?.[1];
    if (id) {
      await fetch(`${BASE}/crm/v3/objects/contacts/${id}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ properties }),
      });
      return id;
    }
  }
  throw new Error(`HubSpot contact upsert failed: ${create.status} ${await create.text()}`);
}

/** Create a Note engagement associated to the contact (note→contact association type 202). */
export async function createLinkNote(
  contactId: string,
  note: { deckName: string; fullUrl: string; date: string; userEmail: string },
): Promise<string> {
  const body = `Minideck link (${note.deckName}): ${note.fullUrl} — created ${note.date} by ${note.userEmail}`;
  const res = await fetch(`${BASE}/crm/v3/objects/notes`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      properties: { hs_note_body: body, hs_timestamp: new Date().toISOString() },
      associations: [
        {
          to: { id: contactId },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`HubSpot note failed: ${res.status} ${await res.text()}`);
  return String((await res.json()).id);
}

export function buildContactUrl(portalId: string, contactId: string): string {
  return `https://app.hubspot.com/contacts/${portalId}/contact/${contactId}`;
}

/** Create a high-priority Task associated to the contact (task→contact assoc = 204). */
export async function createEngagementTask(
  contactId: string,
  subject: string,
  body: string,
  ownerId?: string | null,
): Promise<void> {
  const properties: Record<string, string> = {
    hs_task_subject: subject,
    hs_task_body: body,
    hs_timestamp: new Date().toISOString(),
    hs_task_status: "NOT_STARTED",
    hs_task_priority: "HIGH",
  };
  // Assign to a rep so the task lands in their queue / notifies them.
  if (ownerId) properties.hubspot_owner_id = ownerId;

  const res = await fetch(`${BASE}/crm/v3/objects/tasks`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      properties,
      associations: [
        { to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 204 }] },
      ],
    }),
  });
  if (!res.ok) throw new Error(`HubSpot task failed: ${res.status} ${(await res.text()).slice(0, 160)}`);
}

// Resolve a HubSpot owner id from an email (the link creator's app-login email).
// Cached per process — owner lists change rarely. Returns null if no match.
const ownerCache = new Map<string, string | null>();
export async function getOwnerIdByEmail(email: string): Promise<string | null> {
  const key = email.trim().toLowerCase();
  if (!key) return null;
  if (ownerCache.has(key)) return ownerCache.get(key) ?? null;
  let id: string | null = null;
  try {
    const res = await fetch(`${BASE}/crm/v3/owners?email=${encodeURIComponent(key)}&limit=1`, { headers: headers() });
    if (res.ok) id = (await res.json()).results?.[0]?.id ?? null;
  } catch {
    id = null;
  }
  ownerCache.set(key, id);
  return id;
}

/** Patch Minideck engagement properties on the contact (see scripts/setup-hubspot-properties.mjs). */
export async function updateContactProperties(contactId: string, properties: Record<string, string>): Promise<void> {
  const res = await fetch(`${BASE}/crm/v3/objects/contacts/${contactId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) throw new Error(`HubSpot props failed: ${res.status} ${(await res.text()).slice(0, 160)}`);
}

export interface HubspotContactResult {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  jobtitle: string;
  company: string;
}

/** Full-text contact search for the New Link typeahead (name/email). */
export async function searchContacts(q: string, limit = 7): Promise<HubspotContactResult[]> {
  const res = await fetch(`${BASE}/crm/v3/objects/contacts/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      query: q,
      properties: ["firstname", "lastname", "email", "jobtitle", "company"],
      limit,
    }),
  });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.results ?? []).map((r: { id: string | number; properties?: Record<string, string> }) => ({
    id: String(r.id),
    firstname: r.properties?.firstname ?? "",
    lastname: r.properties?.lastname ?? "",
    email: r.properties?.email ?? "",
    jobtitle: r.properties?.jobtitle ?? "",
    company: r.properties?.company ?? "",
  }));
}
