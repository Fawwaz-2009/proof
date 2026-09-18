// Preview operations for the native app: what this clone can do, and what a PR
// can already reuse.
//
// Read-only, and provably so: nothing here calls `eas fingerprint:generate`
// (the pinned CLI uploads fingerprint metadata to the account), starts a build,
// or publishes an update. Diagnostics are local reads plus provider reads; the
// fingerprint that compatibility is keyed on comes from the *deployed record*
// the publication path wrote, which is the only fingerprint that describes a
// real artifact rather than a locally re-derived configuration.
//
//   bun run mobile:doctor --target ios-device
//   bun run mobile:preview:status --pr 12 [--stage-url https://…] [--json]
//
// Both commands share the resolver (scripts/mobile-preview-resolver.ts) and the
// provider seam (scripts/eas-builds.ts) with the CI publication path.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { distributableIdentityProblems } from "../apps/mobile/app.config.ts";
import {
  type MobileTargetId,
  enabledTargets,
  mobilePreviewConfig,
  mobileTargetIds,
  validateMobilePreviewConfig,
  type MobilePreviewConfig,
} from "../mobile-preview.config.ts";
import { buildLookupArgs, stageUrlFor, toNativeBuilds } from "./eas-builds.ts";
import { bundleIdentifierFor, type Env, envValue, resolveEnv, resolveIdentity } from "./env.ts";
import { resolveCompatibility } from "./mobile-preview-resolver.ts";

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

/** A verified read, not a token-presence guess: presence proves nothing about a token's validity. */
const accountChecks = (env: Env): Check[] => {
  const whoami = run(easBinary, ["whoami"], { cwd: appDir, env });
  const who = whoami.ok ? String(whoami.value).trim() : "";
  const auth: Check =
    who.length > 0
      ? { name: "Expo authentication", ok: true, detail: `verified: eas is authenticated as ${who}.` }
      : {
          name: "Expo authentication",
          ok: false,
          detail: `could not authenticate (${whoami.ok ? "empty account" : whoami.problem}). Run \`bun run eas login\`, or set a valid EXPO_TOKEN for CI.`,
        };
  // `project:info` prints a table, not JSON (`--json` is not implemented for it),
  // so the values are read from the text and checked against the configured id.
  const project = run(easBinary, ["project:info"], { cwd: appDir, env });
  if (!project.ok)
    return [
      auth,
      { name: "Expo project access", ok: false, detail: `could not read the project (${project.problem}). Verify EAS_PROJECT_ID and that this account owns it.` },
    ];
  const text = String(project.value);
  const id = /(?:^|\n)ID\s+([0-9a-fA-F-]{36})/.exec(text)?.[1];
  const fullName = /(?:^|\n)fullName\s+(\S+)/.exec(text)?.[1];
  const configured = envValue(env, "EAS_PROJECT_ID") ?? envValue(env, "EAS_BUILD_PROJECT_ID");
  if (id === undefined) return [auth, { name: "Expo project access", ok: false, detail: "project:info printed no project id, so access cannot be verified." }];
  if (configured !== undefined && configured !== id)
    return [
      auth,
      {
        name: "Expo project access",
        ok: false,
        detail: `EAS_PROJECT_ID is ${configured} but this account reads ${id} (${fullName ?? "unknown"}) here: publishing would target the wrong project.`,
      },
    ];
  return [auth, { name: "Expo project access", ok: true, detail: `verified: ${fullName ?? "project"} (${id}) is readable by this account and matches EAS_PROJECT_ID.` }];
};

const toolchainChecks = (target: MobileTargetId): Check[] => {
  if (config.targets[target].nativeBuild !== "local")
    return [{ name: "native build mode", ok: true, detail: "cloud-manual: builds go through the manual workflow, so no local toolchain is required." }];
  if (target === "android") {
    const java = run("java", ["-version"]);
    const sdk = process.env.ANDROID_HOME?.trim() || process.env.ANDROID_SDK_ROOT?.trim();
    return [
      { name: "android toolchain", ok: java.ok, detail: java.ok ? "java is available." : "java is missing: a local Android build needs a JDK." },
      {
        name: "android SDK",
        ok: sdk !== undefined && sdk.length > 0,
        detail: sdk === undefined || sdk.length === 0 ? "ANDROID_HOME/ANDROID_SDK_ROOT is unset." : `SDK at ${sdk}.`,
      },
    ];
  }
  const xcode = run("xcodebuild", ["-version"]);
  return [
    {
      name: "ios toolchain",
      ok: xcode.ok,
      detail: xcode.ok
        ? `${String(xcode.value).trim().split("\n").join(" · ")} (a toolchain; signing and device enrollment are separate, unverified here).`
        : "xcodebuild is missing: iOS local builds need macOS with Xcode.",
    },
  ];
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
    const identity = resolveIdentity(env);
    const identityProblems = distributableIdentityProblems(env);
    for (const problem of identityProblems) checks.push({ name: "app identity", ok: false, detail: problem });
    if (identityProblems.length === 0) {
      checks.push({
        name: "app identity",
        ok: true,
        detail: `APP_NAME=${identity.appName} APP_SLUG=${identity.appSlug}, preview bundle id ${bundleIdentifierFor(identity, "preview")}, scheme ${identity.appSlug}-preview.`,
      });
    }
    checks.push(...accountChecks(env), profileCheck(target), ...toolchainChecks(target));
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

/** The deployed record, or why it could not be read. Never inferred from the local checkout. */
const fetchDeployedStatus = async (
  stageUrl: string,
): Promise<{ ok: true; value: { stage?: unknown; environment?: unknown; record?: unknown } } | { ok: false; problem: string }> => {
  try {
    const response = await fetch(new URL("/api/preview/mobile", stageUrl), {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return { ok: false, problem: `${stageUrl}/api/preview/mobile answered ${response.status}` };
    return { ok: true, value: (await response.json()) as { stage?: unknown; environment?: unknown; record?: unknown } };
  } catch (error) {
    return { ok: false, problem: `${stageUrl} is unreachable (${error instanceof Error ? error.message : String(error)})` };
  }
};

const status = async (): Promise<void> => {
  const pr = flag("--pr");
  if (pr === undefined || !/^\d+$/.test(pr)) {
    console.error("Usage: bun run mobile:preview:status --pr <number> [--stage-url https://…] [--target ios-device] [--json]");
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
  const previewBundleIdentifier = bundleIdentifierFor(identity, "preview");
  const stage = `pr-${pr}`;
  const stageUrl =
    flag("--stage-url") ?? stageUrlFor(stage, identity.appSlug === "app" && envValue(env, "APP_SLUG") === undefined ? undefined : identity.appSlug, identity.rootDomain);
  const requested = targetArg();
  const targets = requested === undefined ? enabledTargets(config) : [requested];

  // Local facts only. They describe this checkout, not the PR, and never decide
  // compatibility: that comes from the deployed record below.
  const checkout = {
    previewBundleIdentifier,
    scheme: `${identity.appSlug}-preview`,
    identityProblems: distributableIdentityProblems(env),
    note: "describes this checkout; it is not PR state",
  };

  if (stageUrl === null) {
    console.log(
      JSON.stringify(
        {
          pr: Number(pr),
          stage,
          deployed: null,
          checkout,
          targets: targets.map((target) => ({
            target,
            state: "unresolved",
            reason:
              "no stage URL: ROOT_DOMAIN (or an explicit APP_SLUG) is not configured here, so pass --stage-url, or run this from CI where the deploy output knows it.",
          })),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const deployed = await fetchDeployedStatus(stageUrl);
  if (!deployed.ok) {
    console.log(
      JSON.stringify(
        { pr: Number(pr), stage, stageUrl, deployed: null, checkout, targets: targets.map((target) => ({ target, state: "unresolved", reason: deployed.problem })) },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const record =
    typeof deployed.value.record === "object" && deployed.value.record !== null
      ? (deployed.value.record as { testedCommit?: unknown; deploymentId?: unknown; targets?: unknown })
      : null;
  const recordTargets =
    typeof record?.targets === "object" && record.targets !== null
      ? (record.targets as Record<string, { nativeFingerprint?: unknown; runtimeVersion?: unknown; appIdentifier?: unknown }>)
      : {};

  // One report per target: the resolver's verdict when it could be evaluated,
  // or an explicit "could not resolve" state when it could not. Never a reused
  // build claimed without the deployed record behind it.
  type TargetReport = {
    readonly target: MobileTargetId;
    readonly state: string;
    readonly reason?: string;
    readonly buildId?: string;
    readonly detailsUrl?: string | null;
    readonly note?: string;
  };
  const results: TargetReport[] = [];
  for (const target of targets) {
    const entry = recordTargets[target];
    const fingerprint = typeof entry?.nativeFingerprint === "string" ? entry.nativeFingerprint : null;
    const runtimeVersion = typeof entry?.runtimeVersion === "string" ? entry.runtimeVersion : null;
    const appIdentifier = typeof entry?.appIdentifier === "string" ? entry.appIdentifier : previewBundleIdentifier;
    if (record === null) {
      results.push({ target, state: "no-record", reason: "this deployment has published no mobile preview yet, so there is nothing to reuse and nothing to claim." });
      continue;
    }
    if (fingerprint === null || runtimeVersion === null) {
      results.push({ target, state: "unresolved", reason: "the deployed record carries no fingerprint/runtime for this target, so compatibility cannot be evaluated." });
      continue;
    }
    const lookup = run(easBinary, buildLookupArgs(target, appIdentifier, fingerprint), { cwd: appDir, json: true, env });
    if (!lookup.ok) {
      results.push({ target, state: "failed", reason: `build lookup: ${lookup.problem}` });
      continue;
    }
    const compatibility = resolveCompatibility({ target, appIdentifier, runtimeVersion, fingerprint }, toNativeBuilds(lookup.value));
    results.push(
      compatibility.state === "reusable"
        ? { target, state: compatibility.state, buildId: compatibility.build.id, detailsUrl: compatibility.build.detailsUrl, note: compatibility.note }
        : compatibility.state === "building"
          ? { target, state: compatibility.state, buildId: compatibility.build.id, detailsUrl: compatibility.build.detailsUrl }
          : { target, state: compatibility.state, reason: compatibility.reason },
    );
  }

  console.log(
    JSON.stringify(
      {
        pr: Number(pr),
        stage,
        stageUrl,
        deployed: {
          stage: deployed.value.stage,
          environment: deployed.value.environment,
          revision: typeof record?.testedCommit === "string" ? record.testedCommit : null,
          deploymentId: typeof record?.deploymentId === "string" ? record.deploymentId : null,
        },
        checkout,
        targets: results,
      },
      null,
      2,
    ),
  );
  process.exit(results.some((result) => result.state === "failed") ? 1 : 0);
};

switch (command) {
  case "doctor":
    doctor();
    break;
  case "status":
    await status();
    break;
  default:
    console.error(
      "Usage: bun run mobile:doctor [--target <id>] [--json]\n       bun run mobile:preview:status --pr <number> [--stage-url https://…] [--target <id>] [--json]",
    );
    process.exit(2);
}
