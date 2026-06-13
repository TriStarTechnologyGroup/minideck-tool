// Deterministic decision-maker classifier: does a contact's title match an ICP target role
// (keyword) at/above its seniority floor? Pure + dependency-free so it's unit-tested and runs in a
// backfill without Clay or any API. Mirrors the ICP defined in target_roles.

export type TargetRole = { function: string; title_keywords: string | null; seniority_floor: string | null; priority: number | null; active?: boolean | null };
export type ContactLike = { position?: string | null; function?: string | null; seniority?: string | null };

// Seniority signal from free text (title or seniority field). Higher = more senior.
const SENIORITY_WORDS: [RegExp, number][] = [
  [/\b(chief|ceo|cso|cmo|cto|cfo|coo|c\.?s\.?o)\b/, 5],
  [/\b(evp|svp|vp|vice president|president|partner|founder|owner)\b/, 4],
  [/\b(head|director|dir\.)\b/, 3],
  [/\b(principal|lead|senior|sr\.?)\b/, 2],
  [/\b(manager|mgr)\b/, 2],
];
function seniorityRank(text: string): number {
  let r = 1;
  for (const [re, v] of SENIORITY_WORDS) if (re.test(text)) r = Math.max(r, v);
  return r;
}
function floorRank(floor: string | null | undefined): number {
  const f = (floor ?? "").toLowerCase();
  if (f.includes("vp") || f.includes("chief") || f.includes("exec")) return 4;
  if (f.includes("director")) return 3;
  if (f.includes("senior") || f.includes("manager")) return 2;
  return 3; // sensible default = Director+
}
const keywords = (s: string | null | undefined) => (s ?? "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);

/**
 * Decide whether a contact is an ICP decision-maker, and which target-role function they map to.
 * A contact qualifies when their title contains a role's keyword AND their seniority (read from the
 * title and the seniority field) meets that role's floor. Roles are tried highest-priority first.
 */
export function classifyDecisionMaker(contact: ContactLike, roles: TargetRole[]): { is: boolean; fn: string | null } {
  const title = (contact.position ?? "").toLowerCase();
  if (!title) return { is: false, fn: null };
  const sr = Math.max(seniorityRank(title), seniorityRank((contact.seniority ?? "").toLowerCase()));
  const active = roles.filter((r) => r.active !== false).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const role of active) {
    if (keywords(role.title_keywords).some((k) => title.includes(k)) && sr >= floorRank(role.seniority_floor)) {
      return { is: true, fn: role.function };
    }
  }
  return { is: false, fn: null };
}
