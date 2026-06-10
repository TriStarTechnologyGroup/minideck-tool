import { describe, it, expect } from "vitest";
import { prospectingPayload, ingestProspecting } from "./prospecting";

describe("prospectingPayload schema", () => {
  it("accepts a minimal run payload from the skill", () => {
    const r = prospectingPayload.safeParse({
      run_label: "Regeneron — 2026-06-07",
      companies: [{ hubspot_id: "823623606", name: "Regeneron Pharmaceuticals", domain: "regeneron.com" }],
      opportunities: [{ company_name: "Regeneron Pharmaceuticals", asset_name: "REGN10597", target: "PD1-IL2Ra", fit_score: 93, fit_tier: "Tier 1 — strong fit" }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects an opportunity missing required identity fields", () => {
    const r = prospectingPayload.safeParse({ opportunities: [{ target: "MET" }] });
    expect(r.success).toBe(false);
  });

  it("rejects a non-integer fit_score", () => {
    const r = prospectingPayload.safeParse({ opportunities: [{ company_name: "X", asset_name: "Y", fit_score: 9.5 }] });
    expect(r.success).toBe(false);
  });
});

/** Fake admin: records calls, resolves company ids by name for the linking test. */
function makeAdmin(companiesById: Record<string, string>, existingOppId?: string) {
  const calls: { table: string; op: string; rows: unknown }[] = [];
  function from(table: string) {
    let filterCol = "";
    let filterVals: string[] = [];
    const builder: Record<string, unknown> = {
      upsert: (rows: unknown) => { calls.push({ table, op: "upsert", rows }); return Promise.resolve({ error: null }); },
      insert: (rows: unknown) => {
        calls.push({ table, op: "insert", rows });
        const list = Array.isArray(rows) ? rows : [rows];
        // Awaitable (companies/programs/cohorts) AND chainable .select (opportunities).
        const p = Promise.resolve({ error: null }) as Promise<{ error: null }> & { select?: () => Promise<unknown> };
        p.select = () => Promise.resolve({ data: list.map((_, i) => ({ id: `${table}-${i}` })), error: null });
        return p;
      },
      select: () => builder,
      in: (col: string, vals: string[]) => { filterCol = col; filterVals = vals; return Promise.resolve({ data: resolveSelect(table, filterCol, filterVals, companiesById) }); },
      // Refresh-mode support (chainable + thenable for update/delete awaits).
      eq: () => builder,
      maybeSingle: () => Promise.resolve({ data: table === "opportunities" && existingOppId ? { id: existingOppId } : null, error: null }),
      update: (rows: unknown) => { calls.push({ table, op: "update", rows }); return builder; },
      delete: () => { calls.push({ table, op: "delete", rows: null }); return builder; },
      then: (resolve: (v: unknown) => void) => resolve({ error: null }),
    };
    return builder;
  }
  return { admin: { from } as never, calls };
}
function resolveSelect(table: string, col: string, vals: string[], byName: Record<string, string>) {
  if (table !== "companies") return [];
  if (col === "name") return vals.filter((v) => byName[v]).map((v) => ({ id: byName[v], name: v }));
  return [];
}

describe("ingestProspecting linking", () => {
  it("links opportunities to the resolved company_id and threads run_label", async () => {
    const { admin, calls } = makeAdmin({ "Regeneron Pharmaceuticals": "co-1" });
    const counts = await ingestProspecting(admin, {
      run_label: "Run A",
      opportunities: [{ company_name: "Regeneron Pharmaceuticals", asset_name: "REGN10597", fit_score: 93 }],
    });
    expect(counts.opportunities).toBe(1);
    const insert = calls.find((c) => c.table === "opportunities" && c.op === "insert");
    const row = (insert!.rows as Record<string, unknown>[])[0];
    expect(row.company_id).toBe("co-1");
    expect(row.run_label).toBe("Run A");
    expect("company_hubspot_id" in row).toBe(false); // stripped before insert
  });

  it("inserts an opportunity's cohorts linked to the new opportunity id", async () => {
    const { admin, calls } = makeAdmin({ "Regeneron Pharmaceuticals": "co-1" });
    const counts = await ingestProspecting(admin, {
      opportunities: [{
        company_name: "Regeneron Pharmaceuticals", asset_name: "REGN10597",
        cohorts: [{ ta_number: "TA1621", markers: "PD-L1", donors: 100 }, { ta_number: "TA2660", custom_stain: true }],
      }],
    });
    expect(counts.opportunity_cohorts).toBe(2);
    const cohortInsert = calls.find((c) => c.table === "opportunity_cohorts" && c.op === "insert");
    const rows = cohortInsert!.rows as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ opportunity_id: "opportunities-0", ta_number: "TA1621", sort_order: 0 });
    expect(rows[1]).toMatchObject({ opportunity_id: "opportunities-0", ta_number: "TA2660", sort_order: 1 });
  });

  it("refresh mode updates an existing opportunity (preserving feedback) instead of duplicating", async () => {
    const { admin, calls } = makeAdmin({ "Regeneron Pharmaceuticals": "co-1" }, "opp-existing");
    const counts = await ingestProspecting(admin, {
      mode: "refresh",
      opportunities: [{
        company_name: "Regeneron Pharmaceuticals", asset_name: "REGN10597", fit_score: 80,
        score_components: [{ component: "Target ↔ marker overlap", weight_max: 40, points: 30 }],
      }],
    });
    expect(counts.opportunities).toBe(1);
    const ops = calls.filter((c) => c.table === "opportunities");
    expect(ops.some((c) => c.op === "update")).toBe(true);
    expect(ops.some((c) => c.op === "insert")).toBe(false);
    // skill-owned children cleared before re-insert; feedback table never touched
    expect(calls.some((c) => c.table === "opportunity_score_components" && c.op === "delete")).toBe(true);
    expect(calls.some((c) => c.table === "opportunity_feedback")).toBe(false);
  });
});
