// The namespace is the whole isolation story between PR backends inside one
// installed preview app: if two origins ever collide here, one PR reads another
// PR's cookie and cached session. The module under test is app code; it is pure
// TypeScript with no React Native imports, so it runs here with bun.
import { describe, expect, test } from "bun:test";
import { normalizeOrigin, originNamespace } from "../apps/mobile/src/lib/session.ts";

describe("normalizeOrigin", () => {
  test("lowercases and keeps a non-default port", () => {
    expect(normalizeOrigin("HTTP://LocalHost:29620")).toBe("http://localhost:29620");
  });

  test("drops trailing slashes and paths", () => {
    expect(normalizeOrigin("https://proof-pr-21.fawwaz.dev/")).toBe("https://proof-pr-21.fawwaz.dev");
    expect(normalizeOrigin("https://proof-pr-21.fawwaz.dev/api/")).toBe("https://proof-pr-21.fawwaz.dev");
  });

  test("unparsable input degrades to trimmed lowercase", () => {
    expect(normalizeOrigin("  not a url/  ")).toBe("not a url");
  });
});

describe("originNamespace", () => {
  test("two PR backends never share a namespace", () => {
    expect(originNamespace("https://proof-pr-21.fawwaz.dev")).not.toBe(originNamespace("https://proof-pr-22.fawwaz.dev"));
  });

  test("the same backend is stable across spelling differences", () => {
    expect(originNamespace("https://proof-pr-21.fawwaz.dev/")).toBe(originNamespace("HTTPS://proof-pr-21.FAWWAZ.dev"));
  });

  test("local development and a deployed stage differ", () => {
    expect(originNamespace("http://localhost:29620")).not.toBe(originNamespace("https://proof-pr-21.fawwaz.dev"));
  });

  test("the key alphabet is safe for expo-secure-store", () => {
    expect(originNamespace("http://localhost:29620")).toMatch(/^[a-z0-9]+$/);
    expect(originNamespace("https://proof-pr-21.fawwaz.dev")).toMatch(/^[a-z0-9]+$/);
  });
});
