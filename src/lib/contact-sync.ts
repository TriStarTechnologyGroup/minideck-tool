import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import { isHubspotConfigured, fetchContactIndex, createContact, updateContactById, buildContactUrl } from "@/lib/hubspot";

type Admin = ReturnType<typeof createAdminClient>;

export type ContactSyncReport = {
  dryRun: boolean;
  total: number;            // app contacts with an email
  matched: { byId: number; byEmail: number };
  unmatched: number;        // would-create in HubSpot
  wouldCreateSample: string[];
  adoptedHubspotId: number;
  enrichedApp: number;
  pushed: number;           // contacts whose fields we pushed to HubSpot
  created: number;
  errors: string[];
};

type AppContact = { id: string; email: string | null; full_name: string | null; first_name: string | null; last_name: string | null; position: string | null; company: string | null; hubspot_id: string | null };

const nameParts = (c: AppContact) => {
  if (c.first_name || c.last_name) return { firstname: c.first_name ?? "", lastname: c.last_name ?? "" };
  const n = (c.full_name ?? "").trim();
  if (!n) return { firstname: "", lastname: "" };
  const i = n.indexOf(" ");
  return i === -1 ? { firstname: n, lastname: "" } : { firstname: n.slice(0, i), lastname: n.slice(i + 1) };
};

/**
 * Two-way contact sync. Matches every app contact (with an email) to a HubSpot contact by
 * hubspot_id → email. Matches: adopt the id, enrich missing app fields from HS, push the app's
 * name/title/company to HS. Non-matches: candidates to CREATE in HubSpot.
 *
 * NOTE (scope): this LINKS + pushes app contacts; it does NOT bulk-import every HubSpot contact into
 * the app (HS has far more contacts than are relevant). Net-new HS contacts are pulled per-company,
 * on-demand, by enrichment — not flooded in here. DEFAULTS TO DRY-RUN; creates only with
 * { dryRun:false, createMissing:true }.
 */
export async function syncContactsToHubspot(admin: Admin, opts: { dryRun?: boolean; createMissing?: boolean } = {}): Promise<ContactSyncReport> {
  if (!isHubspotConfigured()) throw new Error("HubSpot not configured");
  const dryRun = opts.dryRun === false ? false : true;
  const report: ContactSyncReport = { dryRun, total: 0, matched: { byId: 0, byEmail: 0 }, unmatched: 0, wouldCreateSample: [], adoptedHubspotId: 0, enrichedApp: 0, pushed: 0, created: 0, errors: [] };

  const index = await fetchContactIndex();
  const { data } = await admin.from("contacts").select("id, email, full_name, first_name, last_name, position, company, hubspot_id").not("email", "is", null).limit(10000);
  const contacts = (data ?? []) as AppContact[];
  report.total = contacts.length;

  for (const c of contacts) {
    const email = (c.email ?? "").toLowerCase().trim();
    let hsId: string | null = null; let how: "byId" | "byEmail" | null = null;
    if (c.hubspot_id && index.byId.has(c.hubspot_id)) { hsId = c.hubspot_id; how = "byId"; }
    if (!hsId && email && index.byEmail.has(email)) { hsId = index.byEmail.get(email)!; how = "byEmail"; }

    if (hsId && how) {
      report.matched[how]++;
      if (!dryRun) {
        const hs = index.byId.get(hsId);
        // Adopt id + a HubSpot URL when missing/changed.
        if (c.hubspot_id !== hsId) {
          const { error } = await admin.from("contacts").update({ hubspot_id: hsId, hubspot_url: buildContactUrl(serverEnv.HUBSPOT_PORTAL_ID, hsId), updated_at: new Date().toISOString() }).eq("id", c.id);
          if (error) report.errors.push(`adopt ${c.email}: ${error.message}`); else report.adoptedHubspotId++;
        }
        // Enrich missing app fields from HS.
        const patch: Record<string, unknown> = {};
        if (!c.position && hs?.jobtitle) patch.position = hs.jobtitle;
        if (!c.company && hs?.company) patch.company = hs.company;
        if (Object.keys(patch).length) {
          const { error } = await admin.from("contacts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", c.id);
          if (error) report.errors.push(`enrich ${c.email}: ${error.message}`); else report.enrichedApp++;
        }
        // Push app fields to HS.
        const { firstname, lastname } = nameParts(c);
        const props: Record<string, string> = { email: c.email! };
        if (firstname) props.firstname = firstname;
        if (lastname) props.lastname = lastname;
        if (c.position) props.jobtitle = c.position;
        if (c.company) props.company = c.company;
        try { await updateContactById(hsId, props); report.pushed++; } catch (e) { report.errors.push(`push ${c.email}: ${e instanceof Error ? e.message : String(e)}`); }
      }
    } else {
      report.unmatched++;
      if (report.wouldCreateSample.length < 50) report.wouldCreateSample.push(c.full_name || c.email || c.id);
      if (!dryRun && opts.createMissing) {
        try {
          const { firstname, lastname } = nameParts(c);
          const props: Record<string, string> = { email: c.email! };
          if (firstname) props.firstname = firstname;
          if (lastname) props.lastname = lastname;
          if (c.position) props.jobtitle = c.position;
          if (c.company) props.company = c.company;
          const newId = await createContact(props);
          await admin.from("contacts").update({ hubspot_id: newId, hubspot_url: buildContactUrl(serverEnv.HUBSPOT_PORTAL_ID, newId), updated_at: new Date().toISOString() }).eq("id", c.id);
          report.created++;
        } catch (e) { report.errors.push(`create ${c.email}: ${e instanceof Error ? e.message : String(e)}`); }
      }
    }
  }
  return report;
}
