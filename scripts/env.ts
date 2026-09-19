// Shared configuration resolution for the repository's scripts.
//
// Two rules, applied everywhere, because their absence produced real defects:
//
// 1. Explicit values win. Anything already in the process environment (an
//    explicit invocation, a CI job, a shell export) outranks values read from
//    files on disk. A local .env is a convenience that supplies defaults, never
//    an override; CI works with no untracked files at all.
// 2. Blank means absent. A key written as `APP_SLUG=` must not defeat a
//    fallback downstream (nullish coalescing does not catch empty strings), so
//    identity and other optional values are normalized through `envValue`.
import { existsSync, readFileSync } from "node:fs";
import * as dotenv from "dotenv";

/** A plain environment: string keys, string values, blanks already resolved by the reader. */
export type Env = Record<string, string>;

/** The current process environment as string pairs (undefined entries dropped). */
export const processEnv = (): Env => Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));

/** Parse a .env file with the supported parser, the same one every reader expects. */
export const readEnvFile = (path: string): Env => (existsSync(path) ? dotenv.parse(readFileSync(path, "utf8")) : {});

/**
 * Merge env sources with the precedence rule: files supply defaults, then the
 * process environment overlays them.
 */
export const resolveEnv = (files: string[], base: Env = processEnv()): Env => {
  const merged: Env = {};
  for (const file of files) Object.assign(merged, readEnvFile(file));
  Object.assign(merged, base);
  return merged;
};

/** A blank or whitespace-only value is missing, not an empty string. */
export const envValue = (env: Env, key: string): string | undefined => {
  const value = env[key]?.trim();
  return value ? value : undefined;
};

/** The unquoted subset every supported parser reads back unchanged. */
const unquotedSafe = /^[A-Za-z0-9._@/:+-]+$/;

/**
 * Serialize a value for a .env line so that reading the file back yields the
 * same string. A name like `Proof #2` written bare reads back as `Proof`,
 * because `#` starts a comment: identity then differs between the sync, the
 * build, and the deploy, which is the drift this sync exists to prevent.
 *
 * The parser's own rules decide the representation: double quotes protect `#`
 * and spaces and expand `\n`/`\r`, but an embedded double quote ends the quoted
 * region early (`Proof "#2"` came back as `Proof `, with the `#` turning into a
 * comment). Single quotes are fully literal, so a value containing a double
 * quote uses them instead. A value containing both quote kinds has no
 * round-tripping form; it is refused rather than written lossily.
 */
export const serializeEnvValue = (value: string): string => {
  if (unquotedSafe.test(value)) return value;
  if (!value.includes('"')) return `"${value.replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
  if (!value.includes("'") && !/[\n\r]/.test(value)) return `'${value}'`;
  throw new Error(
    `Cannot write ${JSON.stringify(value)} as a .env value: it contains both quote kinds, which the supported parser cannot round-trip. Rename the value or set it in the environment directly.`,
  );
};

/** Identity every surface derives from: the stack, the app, and the build services. */
export type Identity = {
  readonly appName: string;
  readonly appSlug: string;
  readonly rootDomain: string | undefined;
};

/**
 * Resolve identity with useful local defaults. Local defaults keep a clone
 * runnable before it names itself; distributable builds are the place that
 * insists on real values (see apps/mobile/app.config.ts).
 */
export const resolveIdentity = (env: Env): Identity => ({
  appName: envValue(env, "APP_NAME") ?? "Proof",
  appSlug: envValue(env, "APP_SLUG") ?? "app",
  rootDomain: envValue(env, "ROOT_DOMAIN"),
});

/** The bundle identifier a preview or production build carries. */
export const bundleIdentifierFor = (identity: Identity, variant: string): string => {
  const base = identity.rootDomain ? [...identity.rootDomain.split(".").reverse(), identity.appSlug].join(".") : `dev.proof.${identity.appSlug}`;
  return variant === "production" ? base : `${base}.${variant}`;
};
