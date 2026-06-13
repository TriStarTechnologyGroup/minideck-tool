import type { OrgCategory } from "@/lib/classify";

// Deterministic guardrails — the non-negotiable rules that must always hold, expressed as pure
// functions so they can be (a) enforced inline in production, (b) measured by assertion-type evals,
// and (c) gated in CI with zero API cost. Keep these dependency-free and side-effect-free.

/**
 * Academia gate: only a for-profit *industry* org is prospect-eligible. Academia, non-profit,
 * government, "other", and "unknown" are outbound-only (reply/quote, never prospected). Fails safe —
 * anything that isn't explicitly "industry" is blocked. Single source of truth for the inbound gate.
 */
export function prospectEligible(category: OrgCategory | string | null | undefined): boolean {
  return category === "industry";
}

/** Company types we prospect (industry only — never Academia / Non-Profit / Other / unset). */
export const PROSPECTABLE_COMPANY_TYPES = ["Pharma", "Biotech", "Early Stage Startup"] as const;

/**
 * Company prospecting gate: an industry-typed company that has been manually verified and is not
 * flagged for removal. Mirrors the prospecting-queue filter; flagged-for-removal companies are
 * always excluded from outreach.
 */
export function companyProspectable(c: { type?: string | null; verified?: boolean | null; flagged_for_removal?: boolean | null }): boolean {
  return (PROSPECTABLE_COMPANY_TYPES as readonly string[]).includes(c.type ?? "")
    && c.verified === true
    && c.flagged_for_removal !== true;
}

/**
 * Tier-1 rule (advisory): a company with an APPROVED drug program is a Tier-1 fit. Tier is assigned
 * by the prospecting skill, not app code — this encodes the canonical rule the skill should follow
 * and lets an assertion eval catch drift. Pure mapping over a drug program's highest phase.
 */
export function shouldBeTier1(highestPhase: string | null | undefined): boolean {
  return /\bapprov/i.test(highestPhase ?? "");
}

// PII patterns (sources, not shared RegExp instances — avoids the /g lastIndex statefulness bug
// when the same pattern is reused across redactPii + containsPii).
const PII = {
  email: "[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}",
  phone: "(?:\\+?1[-.\\s]?)?\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}",
  ssn: "\\d{3}-\\d{2}-\\d{4}",
} as const;

/** Strip emails, phone numbers, and US SSNs from text before it reaches the model or a stored draft.
 *  SSNs first (3-2-4) so the phone pattern (3-3-4) can't partially consume them. */
export function redactPii(text: string): string {
  return text
    .replace(new RegExp(PII.email, "gi"), "[email]")
    .replace(new RegExp(PII.ssn, "g"), "[ssn]")
    .replace(new RegExp(PII.phone, "g"), "[phone]");
}

/** Whether any email / phone / SSN remains in the text. Used by the pii_redaction assertion. */
export function containsPii(text: string): boolean {
  return new RegExp(PII.email, "i").test(text)
    || new RegExp(PII.phone).test(text)
    || new RegExp(PII.ssn).test(text);
}
