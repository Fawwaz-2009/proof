// The status command's exit policy, pinned at the boundary the round-3 review
// found: a valid deployment that is still preparing (no native facts yet, or no
// record yet) must not look like an operational failure, while an unreadable
// deployment or a failed publication must.
import { describe, expect, test } from "bun:test";
import { exitCodeFor, nativeOutcome, publicationOutcome, type StatusOutcome } from "./preview-report.ts";

const report = (publication: string, native: string): StatusOutcome => ({ publication, native });

describe("status exit policy", () => {
  test("ready exits zero", () => {
    expect(exitCodeFor("ok", [report("ready", "reusable")])).toBe(0);
  });

  test("failed publication exits non-zero even beside a reusable binary", () => {
    expect(exitCodeFor("ok", [report("failed", "reusable")])).toBe(1);
  });

  test("a deployment still preparing exits zero, fingerprint or not", () => {
    expect(exitCodeFor("ok", [report("preparing", "unresolved")])).toBe(0);
    expect(exitCodeFor("ok", [report("preparing", "native-build-required")])).toBe(0);
    expect(exitCodeFor("ok", [report("publishing", "reusable")])).toBe(0);
    expect(exitCodeFor("ok", [report("publishing", "unresolved")])).toBe(0);
  });

  test("no record yet is a valid answer, not an error", () => {
    expect(exitCodeFor("ok", [report("no-record", "unresolved")])).toBe(0);
  });

  test("a closed PR reports closed without failing the command", () => {
    expect(exitCodeFor("ok", [report("closed", "reusable")])).toBe(0);
  });

  test("an unreadable deployment exits non-zero: transport, contract, or wrong stage", () => {
    expect(exitCodeFor("unreadable", [])).toBe(1);
    expect(exitCodeFor("unreadable", [report("ready", "reusable")])).toBe(1);
  });

  test("a provider failure exits non-zero", () => {
    expect(exitCodeFor("ok", [report("ready", "failed")])).toBe(1);
  });

  test("one failing target fails the command", () => {
    expect(exitCodeFor("ok", [report("ready", "reusable"), report("failed", "reusable")])).toBe(1);
  });
});

describe("native outcome", () => {
  test("a record without native facts is unresolved, not evaluated", () => {
    expect(nativeOutcome(undefined)).toBe("unresolved");
    expect(nativeOutcome({ nativeFingerprint: null, runtimeVersion: "r" })).toBe("unresolved");
    expect(nativeOutcome({ nativeFingerprint: "f", runtimeVersion: null })).toBe("unresolved");
    expect(nativeOutcome({ nativeFingerprint: "f", runtimeVersion: "r" })).toBe("evaluated");
  });

  test("a missing target is an explicit no-record state", () => {
    expect(publicationOutcome(undefined)).toBe("no-record");
    expect(publicationOutcome({ state: "preparing", reasonCode: null, humanMessage: null })).toBe("preparing");
  });
});
