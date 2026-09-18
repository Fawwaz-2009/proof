// Focused tests for the configuration precedence rules the pipeline depends on.
//
// The defect these lock down: a mobile .env used to overwrite an explicitly
// supplied variable, so a PR API URL passed by CI became localhost.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundleIdentifierFor, envValue, readEnvFile, resolveEnv, resolveIdentity, serializeEnvValue } from "./env.ts";

const envFile = (contents: string): string => {
  const path = join(mkdtempSync(join(tmpdir(), "proof-env-")), ".env");
  writeFileSync(path, contents);
  return path;
};

describe("resolveEnv", () => {
  test("explicit process values win over file values", () => {
    const file = envFile("EXPO_PUBLIC_API_URL=http://localhost:29620\nAPP_SLUG=proof\n");
    const merged = resolveEnv([file], { EXPO_PUBLIC_API_URL: "https://proof-pr-21.fawwaz.dev", APP_SLUG: "proof" });
    expect(merged.EXPO_PUBLIC_API_URL).toBe("https://proof-pr-21.fawwaz.dev");
  });

  test("files supply defaults for keys the process does not define", () => {
    const file = envFile("EXPO_PUBLIC_API_URL=http://localhost:29620\n");
    const merged = resolveEnv([file], { APP_SLUG: "proof" });
    expect(merged.EXPO_PUBLIC_API_URL).toBe("http://localhost:29620");
  });

  test("a missing file contributes nothing", () => {
    const merged = resolveEnv(["/nonexistent/.env"], { APP_SLUG: "proof" });
    expect(merged.APP_SLUG).toBe("proof");
    expect(merged.EXPO_PUBLIC_API_URL).toBeUndefined();
  });

  test("quoted values and comments parse the way dotenv documents", () => {
    const file = envFile('APP_NAME="Proof App"\n# a comment\nAPP_SLUG=proof\n');
    const merged = resolveEnv([file], {});
    expect(merged.APP_NAME).toBe("Proof App");
    expect(merged.APP_SLUG).toBe("proof");
  });
});

describe("readEnvFile", () => {
  test("blank values survive parsing and are normalized by envValue", () => {
    const file = envFile("APP_SLUG=\nROOT_DOMAIN=\n");
    const parsed = readEnvFile(file);
    expect(envValue(parsed, "APP_SLUG")).toBeUndefined();
    expect(envValue(parsed, "ROOT_DOMAIN")).toBeUndefined();
  });
});

describe("serializeEnvValue", () => {
  const roundTrip = (value: string): string | undefined => envValue(readEnvFile(envFile(`APP_NAME=${serializeEnvValue(value)}\n`)), "APP_NAME");

  test("a value a parser would truncate survives the write", () => {
    expect(roundTrip("Proof #2")).toBe("Proof #2");
    expect(roundTrip("Proof #2")).not.toBe("Proof");
  });

  test("quotes, whitespace, and newlines survive", () => {
    expect(roundTrip('Proof "quoted"')).toBe('Proof "quoted"');
    expect(roundTrip("  padded  ")).toBe("padded");
    expect(roundTrip("two\nlines")).toBe("two\nlines");
  });

  test("ordinary values stay bare so the file does not churn", () => {
    expect(serializeEnvValue("proof")).toBe("proof");
    expect(serializeEnvValue("dev.fawwaz.dev")).toBe("dev.fawwaz.dev");
    expect(serializeEnvValue("https://proof-pr-21.fawwaz.dev")).toBe("https://proof-pr-21.fawwaz.dev");
  });
});

describe("resolveIdentity", () => {
  test("blank identity falls back to useful local defaults instead of empty strings", () => {
    const identity = resolveIdentity({ APP_NAME: "", APP_SLUG: "  ", ROOT_DOMAIN: "" });
    expect(identity).toEqual({ appName: "Proof", appSlug: "app", rootDomain: undefined });
  });

  test("real identity is preserved", () => {
    const identity = resolveIdentity({ APP_NAME: "Proof", APP_SLUG: "proof", ROOT_DOMAIN: "fawwaz.dev" });
    expect(identity).toEqual({ appName: "Proof", appSlug: "proof", rootDomain: "fawwaz.dev" });
  });
});

describe("bundleIdentifierFor", () => {
  const identity = { appName: "Proof", appSlug: "proof", rootDomain: "fawwaz.dev" };

  test("preview and production identities are distinct", () => {
    expect(bundleIdentifierFor(identity, "production")).toBe("dev.fawwaz.proof");
    expect(bundleIdentifierFor(identity, "preview")).toBe("dev.fawwaz.proof.preview");
  });

  test("no domain falls back to the documented placeholder", () => {
    expect(bundleIdentifierFor({ appName: "Proof", appSlug: "app", rootDomain: undefined }, "preview")).toBe("dev.proof.app.preview");
  });
});
