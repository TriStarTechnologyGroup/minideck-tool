import { describe, it, expect, beforeEach, vi } from "vitest";

// HubSpot is unconfigured in tests (no HUBSPOT_TOKEN), so the sync path is skipped.
// Stub the audit logger so it doesn't try to build a real service-role client.
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { createOrReuseLink, type DeckRef, type Actor } from "./create-link";
import { logAudit } from "./audit";

const DECK: DeckRef = { id: "deck-1", name: "HBS", base_url: "https://hbs.tristargroup.us" };
const ACTOR: Actor = { id: "user-1", email: "rep@tristargroup.us" };
const FIELDS = { first_name: "Ada", last_name: "Lovelace", position: "CSO", company: "Analytical Engines", email: "ada@example.com" };

type Row = Record<string, unknown>;
type InsertErr = { code: string; message: string } | null;

/**
 * Minimal in-memory Supabase-shaped fake: supports the exact chains
 * createOrReuseLink uses (select/eq/maybeSingle, insert/select/single, update/eq).
 * `linkInsertErrors` lets a test inject failures on the links insert to exercise
 * the token-clash retry and (deck,contact) race branches.
 */
function makeAdmin(opts: { contacts?: Row[]; links?: Row[]; linkInsertErrors?: InsertErr[] } = {}) {
  const contacts: Row[] = opts.contacts ?? [];
  const links: Row[] = opts.links ?? [];
  const linkInsertErrors = opts.linkInsertErrors ?? [];
  let cSeq = contacts.length + 1;
  let lSeq = links.length + 1;

  function from(table: string) {
    const store = table === "contacts" ? contacts : links;
    const filters: [string, unknown][] = [];
    let op: "select" | "insert" | "update" = "select";
    let payload: Row = {};
    const match = (r: Row) => filters.every(([c, v]) => r[c] === v);

    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (c: string, v: unknown) => {
        filters.push([c, v]);
        return builder;
      },
      insert: (obj: Row) => {
        op = "insert";
        payload = obj;
        return builder;
      },
      update: (obj: Row) => {
        op = "update";
        payload = obj;
        return builder;
      },
      maybeSingle: () => Promise.resolve({ data: store.find(match) ?? null, error: null }),
      single: () => {
        if (op === "insert") {
          if (table === "links" && linkInsertErrors.length) {
            const err = linkInsertErrors.shift();
            if (err) {
              // Simulate a concurrent writer for the non-token unique-violation (race).
              if (err.code === "23505" && !/token/.test(err.message)) {
                links.push({ id: "link-raced", ...payload });
              }
              return Promise.resolve({ data: null, error: err });
            }
          }
          const id = table === "contacts" ? `contact-${cSeq++}` : `link-${lSeq++}`;
          const row = { id, ...payload };
          store.push(row);
          return Promise.resolve({ data: row, error: null });
        }
        const row = store.find(match) ?? null;
        return Promise.resolve({ data: row, error: row ? null : { message: "not found" } });
      },
      // The update path is awaited directly (no terminal select).
      then: (resolve: (v: unknown) => void) => {
        if (op === "update") {
          const row = store.find(match);
          if (row) Object.assign(row, payload);
        }
        resolve({ data: null, error: null });
      },
    };
    return builder;
  }

  return { admin: { from } as never, contacts, links };
}

beforeEach(() => vi.clearAllMocks());

describe("createOrReuseLink", () => {
  it("creates a new contact + new link and audits it", async () => {
    const { admin, contacts, links } = makeAdmin();
    const res = await createOrReuseLink(admin, DECK, FIELDS, ACTOR);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.reused).toBe(false);
    expect(res.link.full_url).toBe(`https://hbs.tristargroup.us/?t=${res.link.token}`);
    expect(contacts).toHaveLength(1);
    expect(links).toHaveLength(1);
    expect(logAudit).toHaveBeenCalledTimes(1);
  });

  it("reuses the existing (deck, contact) link instead of minting a new token", async () => {
    const { admin, links } = makeAdmin({
      contacts: [{ id: "contact-1", email: FIELDS.email }],
      links: [{ id: "link-1", token: "EXISTING1", deck_id: DECK.id, contact_id: "contact-1", full_url: "https://hbs.tristargroup.us/?t=EXISTING1" }],
    });
    const res = await createOrReuseLink(admin, DECK, FIELDS, ACTOR);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.reused).toBe(true);
    expect(res.link.token).toBe("EXISTING1");
    expect(links).toHaveLength(1); // no new link
    expect(logAudit).not.toHaveBeenCalled(); // reuse is not a create event
  });

  it("updates an existing contact's fields when reusing by email", async () => {
    const { admin, contacts } = makeAdmin({ contacts: [{ id: "contact-1", email: FIELDS.email, first_name: "Old", last_name: "Name", position: null, company: null }] });
    const res = await createOrReuseLink(admin, DECK, { ...FIELDS, first_name: "Ada", company: "Analytical Engines" }, ACTOR);

    expect(res.ok).toBe(true);
    expect(contacts).toHaveLength(1); // updated, not duplicated
    expect(contacts[0].first_name).toBe("Ada");
    expect(contacts[0].company).toBe("Analytical Engines");
  });

  it("retries on a token collision then succeeds", async () => {
    const { admin, links } = makeAdmin({
      linkInsertErrors: [{ code: "23505", message: "duplicate key value violates unique constraint links_token_key" }, null],
    });
    const res = await createOrReuseLink(admin, DECK, FIELDS, ACTOR);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.reused).toBe(false);
    expect(links).toHaveLength(1); // the retry's row, not the clashed one
  });

  it("recovers a concurrent (deck, contact) insert race as a reuse", async () => {
    const { admin } = makeAdmin({
      contacts: [{ id: "contact-1", email: FIELDS.email }],
      linkInsertErrors: [{ code: "23505", message: "duplicate key value violates unique constraint links_deck_id_contact_id_key" }],
    });
    const res = await createOrReuseLink(admin, DECK, FIELDS, ACTOR);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.reused).toBe(true); // re-query found the raced row
  });

  it("gives up after exhausting token-collision retries", async () => {
    const clash = { code: "23505", message: "duplicate key value violates unique constraint links_token_key" };
    const { admin } = makeAdmin({ linkInsertErrors: [clash, clash, clash, clash, clash] });
    const res = await createOrReuseLink(admin, DECK, FIELDS, ACTOR);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/unique token/i);
  });
});
