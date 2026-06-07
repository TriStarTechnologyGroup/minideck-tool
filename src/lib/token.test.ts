import { describe, it, expect } from "vitest";
import { buildLinkUrl, newToken } from "./token";

describe("buildLinkUrl", () => {
  it("appends ?lead= to a base URL", () => {
    expect(buildLinkUrl("https://hbs.tristargroup.us", "Ab3xK9")).toBe("https://hbs.tristargroup.us/?lead=Ab3xK9");
  });
  it("strips trailing slashes before appending", () => {
    expect(buildLinkUrl("https://hbs.tristargroup.us/", "Ab3xK9")).toBe("https://hbs.tristargroup.us/?lead=Ab3xK9");
    expect(buildLinkUrl("https://hbs.tristargroup.us///", "Ab3xK9")).toBe("https://hbs.tristargroup.us/?lead=Ab3xK9");
  });
});

describe("newToken", () => {
  it("is 8 url-safe base62 chars", () => {
    const t = newToken();
    expect(t).toHaveLength(8);
    expect(t).toMatch(/^[0-9A-Za-z]{8}$/);
  });
  it("does not collide on consecutive calls", () => {
    expect(newToken()).not.toBe(newToken());
  });
});
