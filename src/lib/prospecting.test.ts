import { describe, it, expect } from "vitest";
import { prospectingPayload, ingestProspecting, assetKey } from "./prospecting";

describe("assetKey normalization", () => {
  it("collapses parenthetical code/brand suffixes to the same key", () => {
    expect(assetKey("Budigalimab (ABBV-181)")).toBe("budigalimab");
    expect(assetKey("Budigalimab")).toBe("budigalimab");
    expect(assetKey("BMS- 986205")).toBe(assetKey("BMS-986205 (linrodostat)"));
  });
  it("strips dose annotations", () => {
    expect(assetKey("Niraparib 200 mg")).toBe("niraparib");
  });
  it("keeps a bare code name as its own key", () => {
    expect(assetKey("JNJ-78278343")).toBe("jnj-78278343");
  });
  it("does NOT collide two genuinely different assets", () => {
    expect(assetKey("Telisotuzumab adizutecan")).not.toBe(assetKey("Telisotuzumab vedotin"));
  });
  it("honors an explicit key override (cross-form drift)", () => {
    expect(assetKey("Pasritamig", "JNJ-78278343")).toBe("jnj-78278343");
    expect(assetKey("anything", "  Custom-Key  ")).toBe("custom-key");
  });
});

describe("prospectingPayload schema", () => {
  it("accepts a minimal run payload from the skill", () => {
    const r = prospectingPayload.safeParse({
      run_label: "Regeneron — 2026-06-07",
      companies: [{ hubspot_id: "823623606", name: "Regeneron Pharmaceuticals", domain: "regeneron.com" }],
      opportunities: [{ company_name: "Regeneron Pharmaceuticals", asset_name: "REGN10597", target: "PD1-IL2Ra", fit_score: 93, fit_tier: "Tier 1 — strong fit" }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts null donors / enrollment (unknown counts) and the replace mode + asset_key override", () => {
    const r = prospectingPayload.safeParse({
      mode: "replace",
      opportunities: [{
        company_name: "X", asset_name: "Pasritamig", asset_key: "jnj-78278343",
        cohorts: [{ ta_number: "TA1", donors: null }],
        trials: [{ nct_id: "NCT1", enrollment: null }],
      }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects an opportunity missing required identity fields", () => {
    expect(prospectingPayload.safeParse({ opportunities: [{ target: "MET" }] }).success).toBe(false);
  });
  it("rejects a non-integer fit_score", () => {
    expect(prospectingPayload.safeParse({ opportunities: [{ company_name: "X", asset_name: "Y", fit_score: 9.5 }] }).success).toBe(false);
  });
});

/** Fake admin: records calls; resolves companies by name; can return pre-existing
 *  opportunities (for the replace-prune path) and feedback ids (protected from pruning). */
function makeAdmin(opts: {
  companiesById?: Record<string, string>;
  existingCompanyNames?: string[];
  existingOpps?: { id: string; company_id: string; asset_key: string }[];
  feedbackOppIds?: string[];
} = {}) {
  const { companiesById = {}, existingCompanyNames = [], existingOpps = [], feedbackOppIds = [] } = opts;
  const calls: { table: string; op: string; rows?: unknown }[] = [];

  function from(table: string) {
    const eqs: Record<string, string> = {};
    let op = "select";
    let inCol = "";
    let inVals: string[] = [];

    function result() {
      if (op === "delete") return { data: [], error: null };
      if (table === "opportunities" && eqs.company_id) return { data: existingOpps.filter((o) => o.company_id === eqs.company_id), error: null };
      if (table === "opportunity_feedback" && inCol === "opportunity_id") return { data: feedbackOppIds.filter((id) => inVals.includes(id)).map((id) => ({ opportunity_id: id })), error: null };
      if (table === "companies" && inCol === "name") return { data: inVals.filter((v) => companiesById[v]).map((v) => ({ id: companiesById[v], name: v, hubspot_id: null })), error: null };
      if (table === "companies" && inCol === "hubspot_id") return { data: [], error: null };
      return { data: [], error: null };
    }
    function withSelect(rows: unknown, label: string) {
      calls.push({ table, op: label, rows });
      const list = Array.isArray(rows) ? rows : [rows];
      const p = Promise.resolve({ error: null }) as Promise<{ error: null }> & { select?: () => Promise<unknown> };
      p.select = () => Promise.resolve({ data: list.map((_, i) => ({ id: `${table}-${i}` })), error: null });
      return p;
    }

    const builder: Record<string, unknown> = {
      upsert: (rows: unknown) => withSelect(rows, "upsert"),
      insert: (rows: unknown) => withSelect(rows, "insert"),
      update: (rows: unknown) => { calls.push({ table, op: "update", rows }); return builder; },
      delete: () => { calls.push({ table, op: "delete" }); op = "delete"; return builder; },
      select: () => builder,
      order: () => builder,
      eq: (col: string, val: string) => { eqs[col] = val; return builder; },
      ilike: (col: string, val: string) => { eqs[col] = val; return builder; },
      in: (col: string, vals: string[]) => { inCol = col; inVals = vals; return Promise.resolve(result()); },
      limit: () => Promise.resolve({ data: table === "companies" && eqs.name && existingCompanyNames.includes(eqs.name) ? [{ id: "existing-co" }] : [], error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: unknown) => void) => resolve(result()),
    };
    return builder;
  }
  return { admin: { from } as never, calls };
}

describe("ingestProspecting", () => {
  it("upserts opportunities by (company, asset_key) and threads run_label + key", async () => {
    const { admin, calls } = makeAdmin({ companiesById: { "Regeneron Pharmaceuticals": "co-1" } });
    const counts = await ingestProspecting(admin, {
      run_label: "Run A",
      opportunities: [{ company_name: "Regeneron Pharmaceuticals", asset_name: "REGN10597", fit_score: 93 }],
    });
    expect(counts.opportunities).toBe(1);
    const up = calls.find((c) => c.table === "opportunities" && c.op === "upsert");
    expect(up).toBeTruthy();
    const row = (up!.rows as Record<string, unknown>[])[0];
    expect(row.company_id).toBe("co-1");
    expect(row.run_label).toBe("Run A");
    expect(row.asset_key).toBe("regn10597");
    expect("company_hubspot_id" in row).toBe(false);
  });

  it("replaces a company's drug_programs instead of appending", async () => {
    const { admin, calls } = makeAdmin({ companiesById: { "Regeneron Pharmaceuticals": "co-1" } });
    await ingestProspecting(admin, { drug_programs: [{ company_name: "Regeneron Pharmaceuticals", asset_name: "REGN10597" }] });
    expect(calls.some((c) => c.table === "drug_programs" && c.op === "delete")).toBe(true);
    expect(calls.some((c) => c.table === "drug_programs" && c.op === "insert")).toBe(true);
  });

  it("replace mode prunes stale opportunities but never the feedback-protected ones", async () => {
    const { admin, calls } = makeAdmin({
      companiesById: { Acme: "co-1" },
      existingOpps: [
        { id: "keep", company_id: "co-1", asset_key: "regn10597" },
        { id: "stale", company_id: "co-1", asset_key: "dropped-asset" },
        { id: "stale-but-reviewed", company_id: "co-1", asset_key: "human-touched" },
      ],
      feedbackOppIds: ["stale-but-reviewed"],
    });
    const counts = await ingestProspecting(admin, {
      mode: "replace",
      opportunities: [{ company_name: "Acme", asset_name: "REGN10597", fit_score: 50 }],
    });
    expect(counts.pruned_opportunities).toBe(1); // only "stale"; reviewed one protected
    const del = calls.find((c) => c.table === "opportunities" && c.op === "delete");
    expect(del).toBeTruthy();
  });

  it("does not prune in append/refresh mode", async () => {
    const { admin, counts } = await (async () => {
      const m = makeAdmin({ companiesById: { Acme: "co-1" }, existingOpps: [{ id: "stale", company_id: "co-1", asset_key: "x" }] });
      const c = await ingestProspecting(m.admin, { mode: "refresh", opportunities: [{ company_name: "Acme", asset_name: "Y" }] });
      return { admin: m, counts: c };
    })();
    expect(counts.pruned_opportunities).toBe(0);
    expect(admin.calls.some((c) => c.table === "opportunities" && c.op === "delete")).toBe(false);
  });

  it("a company without hubspot_id updates an existing same-named company instead of duplicating", async () => {
    const { admin, calls } = makeAdmin({ existingCompanyNames: ["Regeneron Pharmaceuticals"] });
    await ingestProspecting(admin, { companies: [{ name: "Regeneron Pharmaceuticals", relevant: true }] });
    const coCalls = calls.filter((c) => c.table === "companies");
    expect(coCalls.some((c) => c.op === "update")).toBe(true);
    expect(coCalls.some((c) => c.op === "insert")).toBe(false);
  });

  it("never touches the reviewer feedback table on ingest", async () => {
    const { admin, calls } = makeAdmin({ companiesById: { "Regeneron Pharmaceuticals": "co-1" } });
    await ingestProspecting(admin, {
      mode: "refresh",
      opportunities: [{ company_name: "Regeneron Pharmaceuticals", asset_name: "REGN10597", score_components: [{ component: "Overlap", weight_max: 40, points: 30 }] }],
    });
    expect(calls.some((c) => c.table === "opportunity_score_components" && c.op === "delete")).toBe(true);
    expect(calls.some((c) => c.table === "opportunity_feedback")).toBe(false);
  });
});
