import { describe, it, expect } from "vitest";
import { parseCsv, parseContactsCsv, toCsv } from "./csv";

describe("parseCsv", () => {
  it("parses quoted fields with commas and escaped quotes", () => {
    const g = parseCsv('a,b\n"x,y","he said ""hi"""');
    expect(g).toEqual([["a", "b"], ["x,y", 'he said "hi"']]);
  });
  it("drops empty trailing rows", () => {
    expect(parseCsv("a,b\n1,2\n\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("parseContactsCsv", () => {
  it("maps headers (incl. synonyms) and validates", () => {
    const csv = "First Name,Last Name,Title,Company,Email\nJane,Doe,VP,Acme,jane@acme.com\n,No,,X,bad-email\nJohn,Roe,,,john@roe.io";
    const { rows, errors } = parseContactsCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ first_name: "Jane", last_name: "Doe", position: "VP", company: "Acme", email: "jane@acme.com" });
    expect(rows[1].position).toBeNull();
    expect(errors.length).toBe(1); // bad-email row
  });
  it("errors when no email column", () => {
    const { rows, errors } = parseContactsCsv("name,company\nJane,Acme");
    expect(rows).toHaveLength(0);
    expect(errors[0].reason).toMatch(/email/i);
  });
  it("lowercases emails", () => {
    const { rows } = parseContactsCsv("first,last,email\nA,B,Mixed@Case.COM");
    expect(rows[0].email).toBe("mixed@case.com");
  });
});

describe("toCsv", () => {
  it("serializes with header + quoting", () => {
    const out = toCsv(
      [{ key: "name", label: "Name" }, { key: "url", label: "Link" }],
      [{ name: "A, B", url: "https://x/?t=1" }],
    );
    expect(out).toBe('Name,Link\n"A, B",https://x/?t=1');
  });
});
