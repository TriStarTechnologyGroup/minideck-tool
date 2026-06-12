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
  } catch (err) {
    console.error("[hubspot] owner lookup failed for", key, err);
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

// ───────────────────────── Products (catalog ↔ HubSpot bridge) ─────────────────────────
// Each app catalog item mirrors to a HubSpot Product (identity only — no price; pricing is
// per-deal). `app_catalog_id` (tma:<uuid> / cap:<uuid>) is the reconcile key; hs_sku carries
// the human SKU / capability id. We never hard-delete (historical line items reference them).

export interface ProductFields {
  appCatalogId: string;          // stable reconcile key, e.g. "tma:<uuid>"
  name: string;
  description?: string | null;
  sku?: string | null;           // human SKU (TMA) or capability id → hs_sku
  hubspotProductId?: string | null; // known/resolved back-link (PATCH straight to it)
  skipSearch?: boolean;          // caller already resolved the id (bulk map) → don't search
}

/** Pull the whole product library once into lookup maps (hs_sku → id, app_catalog_id → id).
 *  Used by the bulk catalog sync to adopt existing WooCommerce-synced products deterministically
 *  — the list endpoint is read-consistent, unlike search (which lags a few seconds after writes). */
export async function fetchProductIndex(): Promise<{ byHsSku: Map<string, string>; byAppId: Map<string, string> }> {
  const byHsSku = new Map<string, string>();
  const byAppId = new Map<string, string>();
  let after: string | undefined;
  do {
    const u = new URL(`${BASE}/crm/v3/objects/products`);
    u.searchParams.set("limit", "100");
    u.searchParams.set("properties", "hs_sku,app_catalog_id");
    if (after) u.searchParams.set("after", after);
    const res = await fetch(u, { headers: headers() });
    if (!res.ok) throw new Error(`product index: ${res.status} ${await res.text()}`);
    const j = await res.json();
    for (const p of j.results ?? []) {
      const sku = p.properties?.hs_sku, appId = p.properties?.app_catalog_id;
      if (sku) byHsSku.set(String(sku).trim(), String(p.id));
      if (appId) byAppId.set(String(appId), String(p.id));
    }
    after = j.paging?.next?.after;
  } while (after);
  return { byHsSku, byAppId };
}

async function findProductId(prop: "app_catalog_id" | "hs_sku", value: string): Promise<string | null> {
  const res = await fetch(`${BASE}/crm/v3/objects/products/search`, {
    method: "POST", headers: headers(),
    body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: prop, operator: "EQ", value }] }], properties: ["hs_object_id"], limit: 1 }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.results?.[0]?.id ? String(json.results[0].id) : null;
}

/** Create or update the HubSpot product for a catalog item. Adopts a pre-existing product by
 *  app_catalog_id, then (for SKU'd items) by hs_sku, before creating. Returns the product id. */
export async function upsertProduct(p: ProductFields): Promise<string> {
  const properties: Record<string, string> = { name: p.name, app_catalog_id: p.appCatalogId };
  if (p.description) properties.description = p.description.slice(0, 65000);
  if (p.sku) properties.hs_sku = p.sku;

  let id = p.hubspotProductId || (p.skipSearch ? null : (await findProductId("app_catalog_id", p.appCatalogId)) || (p.sku ? await findProductId("hs_sku", p.sku) : null));
  if (id) {
    const res = await fetch(`${BASE}/crm/v3/objects/products/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ properties }) });
    if (!res.ok) throw new Error(`product update: ${res.status} ${await res.text()}`);
    return id;
  }
  const res = await fetch(`${BASE}/crm/v3/objects/products`, { method: "POST", headers: headers(), body: JSON.stringify({ properties }) });
  if (!res.ok) throw new Error(`product create: ${res.status} ${await res.text()}`);
  id = String((await res.json()).id);
  return id;
}

/** Archive (soft-delete) a HubSpot product — keeps historical deal line-item references intact. */
export async function archiveProduct(productId: string): Promise<void> {
  const res = await fetch(`${BASE}/crm/v3/objects/products/${productId}`, { method: "DELETE", headers: headers() });
  if (!res.ok && res.status !== 404) throw new Error(`product archive: ${res.status} ${await res.text()}`);
}

// ───────────────────────── Companies (sync) ─────────────────────────

export const COMPANY_TYPE_PROPERTY = "tristar_company_type";

/** Normalize a domain for matching: strip protocol, www., path, lowercase. */
export function normalizeDomain(d: string | null | undefined): string {
  if (!d) return "";
  return d.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].replace(/\.$/, "");
}

/** Normalize a company name for fallback matching: lowercase, drop legal-entity suffixes +
 *  punctuation. Conservative — only strips entity suffixes (inc/llc/ltd…), NOT industry words,
 *  so distinct firms ("Acme Therapeutics" vs "Acme Bio") never collapse together. */
export function normalizeCompanyName(n: string | null | undefined): string {
  if (!n) return "";
  let s = n.toLowerCase().replace(/[.,]/g, " ");
  s = s.replace(/\b(inc|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|gmbh|ag|plc|s\.a|sa|s\.r\.l|srl|bv|nv|kk|oy|ab|as|holdings?|group)\b/g, " ");
  s = s.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  return s;
}

export type HsCompany = { id: string; name: string | null; domain: string | null; website: string | null; industry: string | null };

/** Pull the whole company library once into lookup maps (id, domain → id, normalized name → id).
 *  The list endpoint is read-consistent (unlike search). Used by the dedup-safe company sync. */
export async function fetchCompanyIndex(): Promise<{ byId: Map<string, HsCompany>; byDomain: Map<string, string>; byName: Map<string, string> }> {
  const byId = new Map<string, HsCompany>();
  const byDomain = new Map<string, string>();
  const byName = new Map<string, string>();
  let after: string | undefined;
  do {
    const u = new URL(`${BASE}/crm/v3/objects/companies`);
    u.searchParams.set("limit", "100");
    u.searchParams.set("properties", "name,domain,website,industry");
    if (after) u.searchParams.set("after", after);
    const res = await fetch(u, { headers: headers() });
    if (!res.ok) throw new Error(`company index: ${res.status} ${await res.text()}`);
    const j = await res.json();
    for (const c of j.results ?? []) {
      const id = String(c.id);
      const p = c.properties ?? {};
      const co: HsCompany = { id, name: p.name ?? null, domain: p.domain ?? null, website: p.website ?? null, industry: p.industry ?? null };
      byId.set(id, co);
      const dom = normalizeDomain(p.domain || p.website);
      if (dom && !byDomain.has(dom)) byDomain.set(dom, id); // first wins (oldest id)
      const nm = normalizeCompanyName(p.name);
      if (nm && !byName.has(nm)) byName.set(nm, id);
    }
    after = j.paging?.next?.after;
  } while (after);
  return { byId, byDomain, byName };
}

/** Ensure the custom `tristar_company_type` company property exists (string). Idempotent.
 *  Needs the crm.schemas.companies.write scope. */
export async function ensureCompanyTypeProperty(): Promise<void> {
  const check = await fetch(`${BASE}/crm/v3/properties/companies/${COMPANY_TYPE_PROPERTY}`, { headers: headers() });
  if (check.ok) return;
  const res = await fetch(`${BASE}/crm/v3/properties/companies`, {
    method: "POST", headers: headers(),
    body: JSON.stringify({ name: COMPANY_TYPE_PROPERTY, label: "TriStar Company Type", type: "string", fieldType: "text", groupName: "companyinformation", description: "TriStar internal company classification (synced from the minideck app)." }),
  });
  if (!res.ok && res.status !== 409) throw new Error(`create company-type property: ${res.status} ${await res.text()}`);
}

/** Update a HubSpot company's properties (PATCH). Needs crm.objects.companies.write. */
export async function updateCompany(id: string, properties: Record<string, string>): Promise<void> {
  const res = await fetch(`${BASE}/crm/v3/objects/companies/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ properties }) });
  if (!res.ok) throw new Error(`company update: ${res.status} ${await res.text()}`);
}

/** Create a HubSpot company. Returns the new id. Needs crm.objects.companies.write. */
export async function createCompany(properties: Record<string, string>): Promise<string> {
  const res = await fetch(`${BASE}/crm/v3/objects/companies`, { method: "POST", headers: headers(), body: JSON.stringify({ properties }) });
  if (!res.ok) throw new Error(`company create: ${res.status} ${await res.text()}`);
  return String((await res.json()).id);
}

/** Batch-update companies (≤100 per request; chunks internally). Needs crm.objects.companies.write. */
export async function batchUpdateCompanies(inputs: { id: string; properties: Record<string, string> }[]): Promise<void> {
  for (let i = 0; i < inputs.length; i += 100) {
    const chunk = inputs.slice(i, i + 100);
    const res = await fetch(`${BASE}/crm/v3/objects/companies/batch/update`, { method: "POST", headers: headers(), body: JSON.stringify({ inputs: chunk }) });
    if (!res.ok) throw new Error(`company batch update: ${res.status} ${await res.text()}`);
  }
}

// ───────────────────────── Contacts (sync) ─────────────────────────

export type HsContact = { id: string; email: string | null; firstname: string | null; lastname: string | null; jobtitle: string | null; company: string | null };

/** Pull the whole contact library once into lookup maps (id, lowercased email → id). Read-consistent
 *  list endpoint. Used by the dedup-safe contact sync. */
export async function fetchContactIndex(): Promise<{ byId: Map<string, HsContact>; byEmail: Map<string, string> }> {
  const byId = new Map<string, HsContact>();
  const byEmail = new Map<string, string>();
  let after: string | undefined;
  do {
    const u = new URL(`${BASE}/crm/v3/objects/contacts`);
    u.searchParams.set("limit", "100");
    u.searchParams.set("properties", "email,firstname,lastname,jobtitle,company");
    if (after) u.searchParams.set("after", after);
    const res = await fetch(u, { headers: headers() });
    if (!res.ok) throw new Error(`contact index: ${res.status} ${await res.text()}`);
    const j = await res.json();
    for (const c of j.results ?? []) {
      const id = String(c.id), p = c.properties ?? {};
      byId.set(id, { id, email: p.email ?? null, firstname: p.firstname ?? null, lastname: p.lastname ?? null, jobtitle: p.jobtitle ?? null, company: p.company ?? null });
      const e = (p.email ?? "").toLowerCase().trim();
      if (e && !byEmail.has(e)) byEmail.set(e, id);
    }
    after = j.paging?.next?.after;
  } while (after);
  return { byId, byEmail };
}

/** Create a HubSpot contact. Returns the new id. */
export async function createContact(properties: Record<string, string>): Promise<string> {
  const res = await fetch(`${BASE}/crm/v3/objects/contacts`, { method: "POST", headers: headers(), body: JSON.stringify({ properties }) });
  if (!res.ok) throw new Error(`contact create: ${res.status} ${await res.text()}`);
  return String((await res.json()).id);
}

/** Update a HubSpot contact by id. */
export async function updateContactById(id: string, properties: Record<string, string>): Promise<void> {
  const res = await fetch(`${BASE}/crm/v3/objects/contacts/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ properties }) });
  if (!res.ok) throw new Error(`contact update: ${res.status} ${await res.text()}`);
}

// ───────────────────────── Inbound reads (RFQ deals + contact forms) ─────────────────────────

export type RfqDeal = {
  id: string; dealname: string | null; dealstage: string | null; pipeline: string | null;
  amount: number | null; createdate: string | null;
  contact: { id: string; email: string | null; firstname: string | null; lastname: string | null; company: string | null } | null;
  lineItems: { sku: string | null; name: string | null; quantity: number | null; price: number | null; hubspot_product_id: string | null }[];
};

async function batchReadContacts(ids: string[]): Promise<Map<string, RfqDeal["contact"]>> {
  const out = new Map<string, RfqDeal["contact"]>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = await fetch(`${BASE}/crm/v3/objects/contacts/batch/read`, { method: "POST", headers: headers(),
      body: JSON.stringify({ properties: ["email", "firstname", "lastname", "company"], inputs: chunk.map((id) => ({ id })) }) });
    if (!res.ok) continue;
    for (const c of (await res.json()).results ?? []) out.set(String(c.id), { id: String(c.id), email: c.properties?.email ?? null, firstname: c.properties?.firstname ?? null, lastname: c.properties?.lastname ?? null, company: c.properties?.company ?? null });
  }
  return out;
}

async function batchReadLineItems(ids: string[]): Promise<Map<string, RfqDeal["lineItems"][number]>> {
  const out = new Map<string, RfqDeal["lineItems"][number]>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = await fetch(`${BASE}/crm/v3/objects/line_items/batch/read`, { method: "POST", headers: headers(),
      body: JSON.stringify({ properties: ["name", "hs_sku", "quantity", "price", "hs_product_id"], inputs: chunk.map((id) => ({ id })) }) });
    if (!res.ok) continue;
    for (const li of (await res.json()).results ?? []) out.set(String(li.id), { sku: li.properties?.hs_sku ?? null, name: li.properties?.name ?? null, quantity: li.properties?.quantity != null ? Number(li.properties.quantity) : null, price: li.properties?.price != null ? Number(li.properties.price) : null, hubspot_product_id: li.properties?.hs_product_id ?? null });
  }
  return out;
}

/** RFQ deals in a pipeline modified since `sinceIso`, with their contact + line items (the cart). */
export async function fetchRfqDeals(pipelineId: string, sinceIso: string): Promise<RfqDeal[]> {
  const sinceMs = String(Date.parse(sinceIso));
  // 1. find candidate deal ids via search (pipeline + last-modified filter)
  const deals: { id: string; props: Record<string, string>; contactIds: string[]; lineItemIds: string[] }[] = [];
  let after: string | undefined;
  do {
    const res = await fetch(`${BASE}/crm/v3/objects/deals/search`, { method: "POST", headers: headers(), body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "pipeline", operator: "EQ", value: pipelineId }, { propertyName: "hs_lastmodifieddate", operator: "GTE", value: sinceMs }] }],
      properties: ["dealname", "dealstage", "pipeline", "amount", "createdate"], sorts: [{ propertyName: "hs_lastmodifieddate", direction: "ASCENDING" }], limit: 100, after,
    }) });
    if (!res.ok) throw new Error(`deals search: ${res.status} ${await res.text()}`);
    const json = await res.json();
    for (const d of json.results ?? []) deals.push({ id: String(d.id), props: d.properties ?? {}, contactIds: [], lineItemIds: [] });
    after = json.paging?.next?.after;
  } while (after);

  // 2. associations per deal (contacts + line items)
  for (const d of deals) {
    const res = await fetch(`${BASE}/crm/v3/objects/deals/${d.id}?associations=contacts,line_items`, { headers: headers() });
    if (!res.ok) continue;
    const j = await res.json();
    // HubSpot keys association groups by their LABEL, not the requested name: contacts → "contacts",
    // but line_items → "line items" (with a space). Read both forms so the cart isn't silently dropped.
    const assoc = (j.associations ?? {}) as Record<string, { results?: { id?: string; toObjectId?: string }[] }>;
    const idsOf = (...keys: string[]) => keys.flatMap((k) => (assoc[k]?.results ?? []).map((a) => String(a.id ?? a.toObjectId)));
    d.contactIds = idsOf("contacts");
    d.lineItemIds = idsOf("line_items", "line items");
  }

  // 3. batch-read the referenced contacts + line items
  const contacts = await batchReadContacts([...new Set(deals.flatMap((d) => d.contactIds))]);
  const items = await batchReadLineItems([...new Set(deals.flatMap((d) => d.lineItemIds))]);

  return deals.map((d) => ({
    id: d.id, dealname: d.props.dealname ?? null, dealstage: d.props.dealstage ?? null, pipeline: d.props.pipeline ?? null,
    amount: d.props.amount != null ? Number(d.props.amount) : null, createdate: d.props.createdate ?? null,
    contact: d.contactIds.length ? contacts.get(d.contactIds[0]) ?? null : null,
    lineItems: d.lineItemIds.map((id) => items.get(id)).filter(Boolean) as RfqDeal["lineItems"],
  }));
}

/** Fetch the cart (line items) for one deal by id. Used to backfill inquiries whose cart was dropped
 *  by the earlier `line_items` vs `"line items"` association-key bug. */
export async function fetchDealLineItems(dealId: string): Promise<RfqDeal["lineItems"]> {
  const res = await fetch(`${BASE}/crm/v3/objects/deals/${dealId}?associations=line_items`, { headers: headers() });
  if (!res.ok) return [];
  const assoc = ((await res.json()).associations ?? {}) as Record<string, { results?: { id?: string; toObjectId?: string }[] }>;
  const ids = [...new Set(["line_items", "line items"].flatMap((k) => (assoc[k]?.results ?? []).map((a) => String(a.id ?? a.toObjectId))))];
  if (!ids.length) return [];
  const items = await batchReadLineItems(ids);
  return ids.map((id) => items.get(id)).filter(Boolean) as RfqDeal["lineItems"];
}

export type FormSubmission = { submittedAt: string; values: Record<string, string>; pageUrl: string | null };

/** Recent submissions for a form (Forms API), newest first. Caller filters by `since`. */
export async function fetchFormSubmissions(formGuid: string, limit = 50): Promise<FormSubmission[]> {
  const res = await fetch(`${BASE}/form-integrations/v1/submissions/forms/${formGuid}?limit=${limit}`, { headers: headers() });
  if (!res.ok) throw new Error(`form submissions: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return (json.results ?? []).map((s: { submittedAt?: number; pageUrl?: string; values?: { name: string; value: string }[] }) => ({
    submittedAt: s.submittedAt ? new Date(s.submittedAt).toISOString() : "",
    pageUrl: s.pageUrl ?? null,
    values: Object.fromEntries((s.values ?? []).map((v) => [v.name, v.value])),
  }));
}
