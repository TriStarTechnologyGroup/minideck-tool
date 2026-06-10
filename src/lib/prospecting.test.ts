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
function makeAdmin(companiesById: Record<string, string>) {
  const calls: { table: string; op: string; rows: unknown }[] = [];
  function from(table: string) {
    let filterCol = "";
    let filterVals: string[] = [];
    const builder: Record<string, unknown> = {
      upsert: (rows: unknown) => { calls.push({ table, op: "upsert", rows }); return Promise.resolve({ error: null }); },
      insert: (rows: unknown) => { calls.push({ table, op: "insert", rows }); return Promise.resolve({ error: null }); },
      select: () => builder,
      in: (col: string, vals: string[]) => { filterCol = col; filterVals = vals; return Promise.resolve({ data: resolveSelect(table, filterCol, filterVals, companiesById) }); },
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
});
