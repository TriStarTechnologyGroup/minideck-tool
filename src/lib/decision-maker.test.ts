import { describe, it, expect } from "vitest";
import { classifyDecisionMaker, type TargetRole } from "./decision-maker";

const ROLES: TargetRole[] = [
  { function: "Executive", title_keywords: "chief scientific, cso, chief medical, cmo, ceo", seniority_floor: "VP+", priority: 95 },
  { function: "Translational Medicine", title_keywords: "translational, translational medicine", seniority_floor: "Director+", priority: 90 },
  { function: "Biomarkers", title_keywords: "biomarker, biomarkers", seniority_floor: "Director+", priority: 85 },
  { function: "Pathology", title_keywords: "pathology, pathologist", seniority_floor: "Senior", priority: 70 },
  { function: "Inactive role", title_keywords: "intern", seniority_floor: "Manager+", priority: 10, active: false },
];

describe("classifyDecisionMaker", () => {
  it("flags senior titles that match a role", () => {
    expect(classifyDecisionMaker({ position: "VP, Translational Medicine" }, ROLES)).toEqual({ is: true, fn: "Translational Medicine" });
    expect(classifyDecisionMaker({ position: "Director of Biomarkers" }, ROLES).is).toBe(true);
    expect(classifyDecisionMaker({ position: "Chief Scientific Officer" }, ROLES)).toEqual({ is: true, fn: "Executive" });
  });
  it("rejects matching keyword below the seniority floor", () => {
    expect(classifyDecisionMaker({ position: "Biomarker Scientist" }, ROLES).is).toBe(false); // junior
    expect(classifyDecisionMaker({ position: "Translational Research Associate" }, ROLES).is).toBe(false);
  });
  it("uses the seniority field when the title lacks a seniority word", () => {
    expect(classifyDecisionMaker({ position: "Biomarkers", seniority: "Director" }, ROLES).is).toBe(true);
  });
  it("honors a lower floor (Pathology = Senior+)", () => {
    expect(classifyDecisionMaker({ position: "Senior Pathologist" }, ROLES)).toEqual({ is: true, fn: "Pathology" });
    expect(classifyDecisionMaker({ position: "Pathology Technician" }, ROLES).is).toBe(false);
  });
  it("returns the highest-priority matching role", () => {
    // matches both Executive (cmo) and would-be others — Executive wins by priority
    expect(classifyDecisionMaker({ position: "CMO" }, ROLES).fn).toBe("Executive");
  });
  it("ignores inactive roles and empty titles", () => {
    expect(classifyDecisionMaker({ position: "Summer Intern" }, ROLES).is).toBe(false);
    expect(classifyDecisionMaker({ position: "" }, ROLES).is).toBe(false);
    expect(classifyDecisionMaker({ position: null }, ROLES).is).toBe(false);
  });
  it("does not match unrelated senior titles", () => {
    expect(classifyDecisionMaker({ position: "VP of Sales" }, ROLES).is).toBe(false);
    expect(classifyDecisionMaker({ position: "Chief Financial Officer" }, ROLES).is).toBe(false); // cfo not an ICP keyword
  });
});
