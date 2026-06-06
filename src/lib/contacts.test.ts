import { describe, it, expect } from "vitest";
import { contactLinkInput } from "./contacts";

const base = { deckId: "d1", first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" };

describe("contactLinkInput", () => {
  it("parses a valid contact", () => {
    expect(contactLinkInput.safeParse(base).success).toBe(true);
  });
  it("lowercases + trims email", () => {
    const r = contactLinkInput.parse({ ...base, email: "  ADA@Example.COM " });
    expect(r.email).toBe("ada@example.com");
  });
  it("rejects a malformed email", () => {
    expect(contactLinkInput.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
  });
  it("requires first and last name", () => {
    expect(contactLinkInput.safeParse({ ...base, first_name: "" }).success).toBe(false);
  });
  it("normalizes empty optional fields to null", () => {
    const r = contactLinkInput.parse({ ...base, position: "", company: "" });
    expect(r.position).toBeNull();
    expect(r.company).toBeNull();
  });
});
