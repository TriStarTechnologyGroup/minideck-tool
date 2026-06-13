import { describe, it, expect } from "vitest";
import { prospectEligible, companyProspectable, shouldBeTier1, redactPii, containsPii } from "./guardrails";

// These are guardrails, not metrics: a failure here is a release blocker. CI runs them via `npm test`
// (deterministic, no API cost). The in-app assertion datasets mirror these cases for non-devs.

describe("academia gate — prospectEligible", () => {
  it("allows only for-profit industry orgs", () => {
    expect(prospectEligible("industry")).toBe(true);
  });
  it("blocks academia, non-profit, government, other, unknown, and null (fail-safe)", () => {
    for (const c of ["academia", "non_profit", "government", "other", "unknown", null, undefined, ""]) {
      expect(prospectEligible(c as string)).toBe(false);
    }
  });
});

describe("company suppression — companyProspectable", () => {
  it("prospects a verified, unflagged industry company", () => {
    expect(companyProspectable({ type: "Pharma", verified: true, flagged_for_removal: false })).toBe(true);
    expect(companyProspectable({ type: "Biotech", verified: true, flagged_for_removal: null })).toBe(true);
    expect(companyProspectable({ type: "Early Stage Startup", verified: true })).toBe(true);
  });
  it("blocks unverified companies", () => {
    expect(companyProspectable({ type: "Pharma", verified: false, flagged_for_removal: false })).toBe(false);
    expect(companyProspectable({ type: "Pharma", flagged_for_removal: false })).toBe(false);
  });
  it("blocks flagged-for-removal companies even if verified industry", () => {
    expect(companyProspectable({ type: "Pharma", verified: true, flagged_for_removal: true })).toBe(false);
  });
  it("blocks non-industry types (Academia / Non-Profit / Other / unset)", () => {
    for (const t of ["Academia", "Non-Profit", "Other", "Needs Type Defined", null, ""]) {
      expect(companyProspectable({ type: t, verified: true, flagged_for_removal: false })).toBe(false);
    }
  });
});

describe("tier-1 rule — shouldBeTier1", () => {
  it("flags approved drug programs as Tier-1", () => {
    expect(shouldBeTier1("Approved")).toBe(true);
    expect(shouldBeTier1("FDA Approved")).toBe(true);
    expect(shouldBeTier1("approved")).toBe(true);
  });
  it("does not flag pre-approval phases", () => {
    for (const p of ["Phase III", "Phase II", "Phase I", "Preclinical", "Discovery", null, ""]) {
      expect(shouldBeTier1(p)).toBe(false);
    }
  });
});

describe("PII redaction — redactPii / containsPii", () => {
  it("detects and strips emails", () => {
    const t = "Reach Jane at jane.doe@acme-bio.com please";
    expect(containsPii(t)).toBe(true);
    expect(redactPii(t)).toBe("Reach Jane at [email] please");
    expect(containsPii(redactPii(t))).toBe(false);
  });
  it("detects and strips phone numbers in common formats", () => {
    for (const t of ["call 415-555-2671", "(415) 555-2671", "+1 415.555.2671", "4155552671"]) {
      expect(containsPii(t)).toBe(true);
      expect(containsPii(redactPii(t))).toBe(false);
    }
  });
  it("detects and strips US SSNs without consuming them as phone numbers", () => {
    const t = "SSN 123-45-6789 on file";
    expect(containsPii(t)).toBe(true);
    expect(redactPii(t)).toBe("SSN [ssn] on file");
  });
  it("leaves clean text untouched", () => {
    const t = "Genmab is advancing an approved bispecific in DLBCL.";
    expect(containsPii(t)).toBe(false);
    expect(redactPii(t)).toBe(t);
  });
  it("is idempotent (re-running test on the same pattern is stable)", () => {
    const t = "a@b.co and c@d.io";
    expect(containsPii(t)).toBe(true);
    expect(containsPii(t)).toBe(true); // guards against /g lastIndex regressions
    expect(redactPii(t)).toBe("[email] and [email]");
  });
});
