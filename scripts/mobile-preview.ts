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
import * as Schema from "effect/Schema";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MobilePreviewStatus } from "../apps/backend/src/contracts/preview.ts";
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

/**
 * Fetch a stage's status and decode it with the contract the backend serves.
 *
 * Asserting a TypeScript shape here would let a wrong stage, an empty object, or
 * a future schema produce a confident answer; decoding is the check that the
 * response is actually the thing this command claims to report.
 */
const fetchDeployedStatus = async (stageUrl: string): Promise<{ ok: true; value: MobilePreviewStatus } | { ok: false; problem: string }> => {
  let payload: unknown;
  try {
    const response = await fetch(new URL("/api/preview/mobile", stageUrl), {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return { ok: false, problem: `${stageUrl}/api/preview/mobile answered ${response.status}` };
    payload = await response.json();
  } catch (error) {
    return { ok: false, problem: `${stageUrl} is unreachable (${error instanceof Error ? error.message : String(error)})` };
  }
  try {
    return { ok: true, value: Schema.decodeUnknownSync(MobilePreviewStatus)(payload) };
  } catch (error) {
    return {
      ok: false,
      problem: `${stageUrl}/api/preview/mobile did not answer the preview contract (${error instanceof Error ? error.message.split("\n")[0] : String(error)})`,
    };
  }
};

/** Local facts about this checkout. They never decide compatibility and never claim to be PR state. */
const checkoutFacts = (env: Env, previewBundleIdentifier: string, identity: ReturnType<typeof resolveIdentity>) => ({
  previewBundleIdentifier,
  scheme: `${identity.appSlug}-preview`,
  identityProblems: distributableIdentityProblems(env),
  note: "describes this checkout; it is not PR state",
});

const status = async (): Promise<void> => {
  const inspectStage = flag("--inspect-stage");
  const pr = flag("--pr");
  const env = appEnv();
  const identity = resolveIdentity(env);
  const previewBundleIdentifier = bundleIdentifierFor(identity, "preview");

  // Inspection mode: report what a stage says about itself, claiming nothing
  // about a PR. Useful for a dev stage, which is not a PR at all.
  if (inspectStage !== undefined) {
    const deployed = await fetchDeployedStatus(inspectStage);
    if (!deployed.ok) {
      console.log(
        JSON.stringify(
          { mode: "inspect", stageUrl: inspectStage, deployed: null, checkout: checkoutFacts(env, previewBundleIdentifier, identity), problem: deployed.problem },
          null,
          2,
        ),
      );
      process.exit(1);
    }
    console.log(
      JSON.stringify({ mode: "inspect", stageUrl: inspectStage, deployed: deployed.value, checkout: checkoutFacts(env, previewBundleIdentifier, identity) }, null, 2),
    );
    process.exit(0);
  }

  if (pr === undefined || !/^\d+$/.test(pr)) {
    console.error(
      "Usage: bun run mobile:preview:status --pr <number> [--stage-url https://…] [--target ios-device] [--json]\n       bun run mobile:preview:status --inspect-stage <url>   # what a stage says about itself, no PR claim",
    );
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

  const stage = `pr-${pr}`;
  const explicitUrl = flag("--stage-url");
  const stageUrl =
    explicitUrl ?? stageUrlFor(stage, identity.appSlug === "app" && envValue(env, "APP_SLUG") === undefined ? undefined : identity.appSlug, identity.rootDomain);
  const requested = targetArg();
  const targets = requested === undefined ? enabledTargets(config) : [requested];
  const checkout = checkoutFacts(env, previewBundleIdentifier, identity);

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

  // The response must be *this* PR's stage. A wrong --stage-url would otherwise
  // report another PR's preview under this PR's number.
  if (deployed.value.stage !== stage) {
    console.log(
      JSON.stringify(
        {
          pr: Number(pr),
          stage,
          stageUrl,
          deployed: { stage: deployed.value.stage, environment: deployed.value.environment },
          checkout,
          targets: targets.map((target) => ({
            target,
            state: "stage-mismatch",
            reason: `${stageUrl} serves ${deployed.value.stage}, not ${stage}. Use --inspect-stage to read a stage that is not this PR.`,
          })),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const record = deployed.value.record;
  const recordTargets = record?.targets ?? {};
  // One report per target with two independent halves: what the deployment has
  // published, and what native build could carry it. A reusable binary does not
  // make a failed or missing publication ready, and vice versa.
  type TargetReport = {
    readonly target: MobileTargetId;
    readonly publication: {
      readonly state: string;
      readonly reasonCode: string | null;
      readonly humanMessage: string | null;
      readonly update: { readonly groupId: string; readonly deepLink: string; readonly publishedAt: string } | null;
    };
    readonly native: { readonly state: string; readonly reason?: string; readonly buildId?: string; readonly detailsUrl?: string | null; readonly note?: string };
  };
  const results: TargetReport[] = [];
  for (const target of targets) {
    const entry = recordTargets[target];
    const publication = {
      state: entry?.state ?? "no-record",
      reasonCode: entry?.reasonCode ?? null,
      humanMessage:
        entry?.humanMessage ??
        (entry === undefined
          ? "this deployment has published no preview record yet; whether some already-built binary can be reused is decided by the publication path, not by this command."
          : null),
      update: entry?.update ?? null,
    };
    const fingerprint = entry?.nativeFingerprint ?? null;
    const runtimeVersion = entry?.runtimeVersion ?? null;
    const appIdentifier = entry?.appIdentifier ?? previewBundleIdentifier;
    if (fingerprint === null || runtimeVersion === null) {
      results.push({
        target,
        publication,
        native: { state: "unresolved", reason: "this deployment's record carries no fingerprint/runtime for this target, so native compatibility cannot be evaluated." },
      });
      continue;
    }
    const lookup = run(easBinary, buildLookupArgs(target, appIdentifier, fingerprint), { cwd: appDir, json: true, env });
    if (!lookup.ok) {
      results.push({ target, publication, native: { state: "failed", reason: `build lookup: ${lookup.problem}` } });
      continue;
    }
    const compatibility = resolveCompatibility({ target, appIdentifier, runtimeVersion, fingerprint }, toNativeBuilds(lookup.value));
    results.push({
      target,
      publication,
      native:
        compatibility.state === "reusable"
          ? { state: compatibility.state, buildId: compatibility.build.id, detailsUrl: compatibility.build.detailsUrl, note: compatibility.note }
          : compatibility.state === "building"
            ? { state: compatibility.state, buildId: compatibility.build.id, detailsUrl: compatibility.build.detailsUrl }
            : { state: compatibility.state, reason: compatibility.reason },
    });
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
          revision: record?.testedCommit ?? null,
          deploymentId: record?.deploymentId ?? null,
          recordUpdatedAt: record?.updatedAt ?? null,
        },
        checkout,
        targets: results,
      },
      null,
      2,
    ),
  );
  // Exit policy: unresolved transport/contract/stage problems and a failed
  // publication are failures; a pending publication is not an error, and a
  // missing native build is reported, not fatal (the publication path decides).
  const failed = results.some((result) => result.native.state === "failed" || result.publication.state === "failed" || result.native.state === "unresolved");
  process.exit(failed ? 1 : 0);
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
