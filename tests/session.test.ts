import { describe, expect, it } from "vitest";

import { readCookie, tokenFor, tokenMatches } from "../api/session";

describe("readCookie", () => {
  it("finds a cookie among others", () => {
    expect(readCookie("theme=dark; catalog_session=abc; other=1", "catalog_session")).toBe(
      "abc",
    );
  });

  it("tolerates the header being absent or empty", () => {
    expect(readCookie(undefined, "catalog_session")).toBe("");
    expect(readCookie("", "catalog_session")).toBe("");
  });

  it("does not match a cookie whose name merely ends the same way", () => {
    expect(readCookie("not_catalog_session=abc", "catalog_session")).toBe("");
  });

  it("keeps a value containing '='", () => {
    expect(readCookie("catalog_session=a=b=c", "catalog_session")).toBe("a=b=c");
  });
});

describe("tokenMatches", () => {
  it("accepts the token derived from the key", () => {
    expect(tokenMatches(tokenFor("hunter2"), "hunter2")).toBe(true);
  });

  it("rejects a token for a different key", () => {
    expect(tokenMatches(tokenFor("hunter2"), "hunter3")).toBe(false);
  });

  it("rejects nonsense without throwing on a length mismatch", () => {
    // timingSafeEqual throws on differing lengths, so the guard has to come first
    expect(tokenMatches("", "hunter2")).toBe(false);
    expect(tokenMatches("short", "hunter2")).toBe(false);
  });

  it("never puts the key itself in the cookie", () => {
    expect(tokenFor("hunter2")).not.toContain("hunter2");
  });
});
