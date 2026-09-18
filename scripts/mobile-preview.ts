// Preview operations for the native app: what this clone can do, and what a PR
// can already reuse. Read-only by design: nothing here starts a build, spends
// quota, or publishes an update, so a reviewer running diagnostics can never
// mutate an account.
//
//   bun run mobile:doctor --target ios-device
//   bun run mobile:preview:status --pr 12 [--json]
//
// Both commands share one resolver (scripts/mobile-preview-resolver.ts) with the
// CI publication path: "reuse this artifact or build" must not have two
// implementations.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type MobilePreviewConfig,
  type MobileTargetId,
  enabledTargets,
  mobilePreviewConfig,
  mobileTargetIds,
  validateMobilePreviewConfig,
} from "../mobile-preview.config.ts";
import { type NativeBuild, resolveCompatibility } from "./mobile-preview-resolver.ts";
import { type Env, bundleIdentifierFor, envValue, resolveEnv, resolveIdentity } from "./env.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(root, "apps/mobile");
const easBinary = join(root, "node_modules", ".bin", "eas");
const config: MobilePreviewConfig = mobilePreviewConfig;

const args = process.argv.slice(2);
const command = args[0];
const flag = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const has = (name: string): boolean => args.includes(name);

const targetArg = (): MobileTargetId | undefined => {
  const value = flag("--target");
  if (value === undefined) return undefined;
  if (!mobileTargetIds.includes(value as MobileTargetId)) {
    console.error(`Unknown target ${value}. Known targets: ${mobileTargetIds.join(", ")}.`);
    process.exit(2);
  }
  return value as MobileTargetId;
};

/** Run a binary, capturing output; a missing binary is a reported problem, never a throw. */
const run = (
  binary: string,
  commandArgs: string[],
  options: { cwd?: string; json?: boolean; env?: Env } = {},
): { ok: true; value: unknown } | { ok: false; problem: string } => {
  const result = spawnSync(binary, commandArgs, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    env: options.env === undefined ? process.env : { NODE_ENV: process.env.NODE_ENV ?? "development", ...options.env },
  });
  if (result.error !== undefined && result.error !== null) return { ok: false, problem: `${binary} is not runnable (${result.error.message})` };
  if (result.status !== 0) return { ok: false, problem: (result.stderr || result.stdout || "").trim().split("\n").slice(-1)[0] ?? `exit ${result.status}` };
  if (options.json !== true) return { ok: true, value: result.stdout };
  try {
    return { ok: true, value: JSON.parse(result.stdout) as unknown };
  } catch {
    return { ok: false, problem: `${binary} ${commandArgs.join(" ")} did not print JSON` };
  }
};

/** The environment every EAS invocation uses: the app's .env supplies defaults, the process overrides. */
const appEnv = (): Env => resolveEnv([join(root, ".env"), join(appDir, ".env")]);

type Check = { readonly name: string; readonly ok: boolean; readonly detail: string };

const identityChecks = (env: Env): Check[] => {
  const identity = resolveIdentity(env);
  const projectId = envValue(env, "EAS_PROJECT_ID");
  return [
    {
      name: "identity",
      ok: true,
      detail: `APP_NAME=${identity.appName} APP_SLUG=${identity.appSlug}${identity.rootDomain === undefined ? " (no ROOT_DOMAIN: preview bundle id falls back to dev.proof.<slug>.preview)" : ` ROOT_DOMAIN=${identity.rootDomain}`}, preview bundle id ${bundleIdentifierFor(identity, "preview")}, scheme ${identity.appSlug}-preview.`,
    },
    projectId === undefined
      ? {
          name: "EAS project",
          ok: false,
          detail: "EAS_PROJECT_ID is unset: run `bunx eas init` in apps/mobile and put the project id in apps/mobile/.env (or set it in CI secrets).",
        }
      : { name: "EAS project", ok: true, detail: `EAS_PROJECT_ID=${projectId}` },
  ];
};

const expoAuthCheck = (env: Env): Check => {
  if (envValue(env, "EXPO_TOKEN") !== undefined || (process.env.EXPO_TOKEN?.trim() !== undefined && process.env.EXPO_TOKEN.trim().length > 0))
    return { name: "Expo authentication", ok: true, detail: "EXPO_TOKEN is set (the non-interactive path CI uses)." };
  const whoami = run(easBinary, ["whoami"], { cwd: appDir, env });
  if (!whoami.ok)
    return { name: "Expo authentication", ok: false, detail: `could not ask eas whoami (${whoami.problem}). Run \`bun run eas login\`, or set EXPO_TOKEN for CI.` };
  const who = String(whoami.value).trim();
  return who.length === 0
    ? { name: "Expo authentication", ok: false, detail: "eas is not logged in. Run `bun run eas login`, or set EXPO_TOKEN for CI." }
    : { name: "Expo authentication", ok: true, detail: `eas is logged in as ${who}.` };
};

const profileCheck = (target: MobileTargetId): Check => {
  const profile = config.targets[target].profile;
  const path = join(appDir, "eas.json");
  if (!existsSync(path)) return { name: `profile ${profile}`, ok: false, detail: "apps/mobile/eas.json is missing." };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { build?: Record<string, unknown> };
    const exists = parsed.build !== undefined && Object.prototype.hasOwnProperty.call(parsed.build, profile);
    return exists
      ? { name: `profile ${profile}`, ok: true, detail: `apps/mobile/eas.json defines the ${profile} build profile.` }
      : { name: `profile ${profile}`, ok: false, detail: `apps/mobile/eas.json has no ${profile} build profile.` };
  } catch (error) {
    return { name: `profile ${profile}`, ok: false, detail: `apps/mobile/eas.json is unreadable: ${error instanceof Error ? error.message : String(error)}` };
  }
};

const toolchainChecks = (target: MobileTargetId): Check[] => {
  if (config.targets[target].nativeBuild !== "local")
    return [{ name: "native build mode", ok: true, detail: "cloud-manual: builds go through the manual workflow, so no local toolchain is required." }];
  if (target === "android") {
    const java = run("java", ["-version"]);
    const sdk = process.env.ANDROID_HOME?.trim() || process.env.ANDROID_SDK_ROOT?.trim();
    return [
      { name: "android toolchain", ok: java.ok, detail: java.ok ? "java is available." : "java is missing: a local Android build needs a JDK." },
      { name: "android SDK", ok: sdk !== undefined, detail: sdk === undefined ? "ANDROID_HOME/ANDROID_SDK_ROOT is unset." : `SDK at ${sdk}.` },
    ];
  }
  const xcode = run("xcodebuild", ["-version"]);
  return [
    {
      name: "ios toolchain",
      ok: xcode.ok,
      detail: xcode.ok ? String(xcode.value).trim().split("\n").join(" · ") : "xcodebuild is missing: iOS local builds need macOS with Xcode.",
    },
  ];
};

const fingerprintFor = (target: MobileTargetId, env: Env): { ok: true; value: string } | { ok: false; problem: string } => {
  const platform = target === "android" ? "android" : "ios";
  // The variant is explicit: the fingerprint must describe the preview identity
  // the build and update commands use, never an incidental NODE_ENV.
  const result = run(easBinary, ["fingerprint:generate", "--platform", platform, "--json", "--non-interactive"], {
    cwd: appDir,
    json: true,
    env: { ...env, APP_VARIANT: "preview" },
  });
  if (!result.ok) return { ok: false, problem: result.problem };
  const parsed = result.value as { hash?: unknown };
  return typeof parsed.hash === "string" ? { ok: true, value: parsed.hash } : { ok: false, problem: "fingerprint:generate printed no hash" };
};

/**
 * Map `eas build:list --json` records onto the resolver's shape. Fields the CLI
 * does not report stay null, which the resolver treats as unusable: a build
 * whose native facts nobody recorded must not be silently reused.
 */
const toNativeBuilds = (records: unknown): NativeBuild[] => {
  if (!Array.isArray(records)) return [];
  return records.flatMap((record) => {
    if (typeof record !== "object" || record === null) return [];
    const value = record as Record<string, unknown>;
    const text = (key: string): string | null => (typeof value[key] === "string" ? (value[key] as string) : null);
    const platform = text("platform")?.toLowerCase();
    if (platform !== "ios" && platform !== "android") return [];
    const artifacts = typeof value.artifacts === "object" && value.artifacts !== null ? (value.artifacts as Record<string, unknown>) : {};
    const id = text("id");
    return [
      {
        id: id ?? "unknown",
        platform,
        simulator: value.simulator === true,
        appIdentifier: text("appIdentifier") ?? "",
        developmentClient: value.developmentClient === true || text("developerClient") === "true",
        distribution: text("distribution"),
        runtimeVersion: text("runtimeVersion"),
        fingerprint: text("fingerprint") ?? text("fingerprintHash"),
        status: text("status") ?? "UNKNOWN",
        artifactUrl: typeof artifacts.buildUrl === "string" ? artifacts.buildUrl : null,
        profile: text("buildProfile") ?? text("profile"),
        createdAt: text("createdAt") ?? "",
        detailsUrl: id === null ? null : `https://expo.dev/builds/${id}`,
      },
    ];
  });
};

const doctor = (): void => {
  const target = targetArg() ?? enabledTargets(config)[0] ?? "ios-device";
  const env = appEnv();
  const problems = validateMobilePreviewConfig(config);
  const checks: Check[] = [
    {
      name: "configuration",
      ok: problems.length === 0,
      detail:
        problems.length === 0
          ? `mobile previews ${config.enabled ? "enabled" : "disabled"}; ${enabledTargets(config).join(", ") || "no"} target(s) enabled; environment ${config.environment}.`
          : problems.join(" "),
    },
  ];
  if (config.enabled) {
    checks.push(...identityChecks(env), expoAuthCheck(env), profileCheck(target), ...toolchainChecks(target));
  } else {
    checks.push({
      name: "mobile publishing",
      ok: true,
      detail: "Disabled for this clone: web previews work without Expo setup. Set `enabled: true` in mobile-preview.config.ts to publish mobile previews.",
    });
  }

  const ok = checks.every((check) => check.ok);
  if (has("--json")) {
    console.log(JSON.stringify({ target, enabled: config.enabled, ok, checks }, null, 2));
  } else {
    for (const check of checks) console.log(`${check.ok ? "ok  " : "MISS"} ${check.name}: ${check.detail}`);
    const missing = checks.filter((check) => !check.ok).length;
    console.log(
      missing === 0
        ? `\n${config.enabled ? `${target}: ready` : "web-only clone: nothing to set up"}`
        : `\n${missing} item(s) need setup before a ${target} preview can build or publish.`,
    );
  }
  process.exit(ok ? 0 : 1);
};

const status = (): void => {
  const pr = flag("--pr");
  if (pr === undefined || !/^\d+$/.test(pr)) {
    console.error("Usage: bun run mobile:preview:status --pr <number> [--target ios-device] [--json]");
    process.exit(2);
  }
  const problems = validateMobilePreviewConfig(config);
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  if (!config.enabled) {
    console.error("Mobile previews are disabled for this clone (mobile-preview.config.ts): nothing to report.");
    process.exit(1);
  }
  const env = appEnv();
  const identity = resolveIdentity(env);
  const appIdentifier = bundleIdentifierFor(identity, "preview");
  const requested = targetArg();
  const targets = requested === undefined ? enabledTargets(config) : [requested];

  const results = targets.map((target) => {
    const fingerprint = fingerprintFor(target, env);
    if (!fingerprint.ok) return { target, state: "failed", reason: `fingerprint: ${fingerprint.problem}` };
    const builds = run(easBinary, ["build:list", "--platform", target === "android" ? "android" : "ios", "--limit", "50", "--json", "--non-interactive"], {
      cwd: appDir,
      json: true,
      env,
    });
    if (!builds.ok) return { target, state: "failed", reason: `build lookup: ${builds.problem}` };
    // The fingerprint doubles as the runtime version under the app's
    // fingerprint policy (apps/mobile/app.config.ts), which is exactly what a
    // device enforces when it decides whether an update may load.
    const compatibility = resolveCompatibility(
      { target, appIdentifier, runtimeVersion: fingerprint.value, fingerprint: fingerprint.value },
      toNativeBuilds(builds.value),
    );
    return { target, appIdentifier, scheme: `${identity.appSlug}-preview`, fingerprint: fingerprint.value, ...compatibility };
  });

  console.log(JSON.stringify({ pr: Number(pr), stage: `pr-${pr}`, targets: results }, null, 2));
  process.exit(results.some((result) => result.state === "failed") ? 1 : 0);
};

switch (command) {
  case "doctor":
    doctor();
    break;
  case "status":
    status();
    break;
  default:
    console.error("Usage: bun run mobile:doctor [--target <id>] [--json]\n       bun run mobile:preview:status --pr <number> [--target <id>] [--json]");
    process.exit(2);
}
