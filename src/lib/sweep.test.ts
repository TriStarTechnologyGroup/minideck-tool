import { describe, it, expect, beforeEach, vi } from "vitest";

// Stub the HubSpot-firing alert sender: record calls, return a flag patch as the
// real one would. This isolates the sweep's query → filter → persist orchestration.
// vi.hoisted so the fn exists before vi.mock's factory is hoisted above the imports.
const { sendMilestoneAlert } = vi.hoisted(() => ({ sendMilestoneAlert: vi.fn() }));
vi.mock("@/lib/alerts", () => ({ sendMilestoneAlert }));

import { sweepStaleAlerts } from "./sweep";

const NOW = "2026-06-09T12:00:00.000Z";

type Row = Record<string, unknown>;

/**
 * Fake admin for the sweep's two query shapes:
 *  - link_engagement: select(...).lt(...).or(...).order(...).limit(...) → { data: engRows }
 *  - links: select(...).eq("token", t).maybeSingle() → joined link or null
 *  - link_engagement: update(patch).eq("token", t) → records the patch
 */
function makeAdmin(engRows: Row[], linksByToken: Record<string, Row | null>) {
  const updates: { token: string; patch: Row }[] = [];

  function from(table: string) {
    let payload: Row = {};
    let tokenFilter: string | null = null;
    const builder: Record<string, unknown> = {
      select: () => builder,
      lt: () => builder,
      or: () => builder,
      order: () => builder,
      limit: () => Promise.resolve({ data: engRows, error: null }),
      eq: (c: string, v: unknown) => {
        if (c === "token") tokenFilter = v as string;
        return builder;
      },
      update: (obj: Row) => {
        payload = obj;
        return builder;
      },
      maybeSingle: () => Promise.resolve({ data: tokenFilter ? linksByToken[tokenFilter] ?? null : null, error: null }),
      then: (resolve: (v: unknown) => void) => {
        if (table === "link_engagement" && tokenFilter) updates.push({ token: tokenFilter, patch: payload });
        resolve({ data: null, error: null });
      },
    };
    return builder;
  }

  return { admin: { from } as never, updates };
}

const link = (over: Partial<Row> = {}): Row => ({
  created_by: "user-1",
  deck: { slug: "hbs", name: "HBS" },
  contact: { first_name: "Ada", last_name: "Lovelace", hubspot_id: "hs-1" },
  ...over,
});

beforeEach(() => {
  sendMilestoneAlert.mockReset();
  sendMilestoneAlert.mockResolvedValue({ opened_notified_at: NOW });
});

describe("sweepStaleAlerts", () => {
  it("fires an alert and persists the flag patch for a pending row", async () => {
    const { admin, updates } = makeAdmin(
      [{ token: "TOK1", first_seen_at: "2026-06-08T00:00:00Z", opened_notified_at: null }],
      { TOK1: link() },
    );
    const res = await sweepStaleAlerts(admin, { now: NOW });

    expect(sendMilestoneAlert).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ scanned: 1, sent: 1, failed: 0, skipped: 0 });
    expect(updates).toEqual([{ token: "TOK1", patch: { opened_notified_at: NOW } }]);
  });

  it("skips rows whose contact has no HubSpot id", async () => {
    const { admin } = makeAdmin(
      [{ token: "TOK2", first_seen_at: "2026-06-08T00:00:00Z", opened_notified_at: null }],
      { TOK2: link({ contact: { first_name: "No", last_name: "Sync", hubspot_id: null } }) },
    );
    const res = await sweepStaleAlerts(admin, { now: NOW });

    expect(sendMilestoneAlert).not.toHaveBeenCalled();
    expect(res).toMatchObject({ scanned: 1, sent: 0, skipped: 1 });
  });

  it("ignores rows with no pending milestone (defense in depth vs the query filter)", async () => {
    const { admin } = makeAdmin(
      [{ token: "TOK3", first_seen_at: "2026-06-08T00:00:00Z", opened_notified_at: NOW, reached_cta: false }],
      { TOK3: link() },
    );
    const res = await sweepStaleAlerts(admin, { now: NOW });

    expect(res.scanned).toBe(0);
    expect(sendMilestoneAlert).not.toHaveBeenCalled();
  });

  it("counts a HubSpot failure without persisting flags (left for next sweep)", async () => {
    sendMilestoneAlert.mockRejectedValueOnce(new Error("HubSpot 502"));
    const { admin, updates } = makeAdmin(
      [{ token: "TOK4", first_seen_at: "2026-06-08T00:00:00Z", opened_notified_at: null }],
      { TOK4: link() },
    );
    const res = await sweepStaleAlerts(admin, { now: NOW });

    expect(res).toMatchObject({ scanned: 1, sent: 0, failed: 1 });
    expect(updates).toEqual([]); // nothing persisted → retried next run
  });
});
