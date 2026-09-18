// Configuration for PR previews of the native app.
//
// Committed on purpose: it says what this clone may do, never who it is.
// Project IDs, tokens, and account names live in the environment (see
// docs/mobile-previews.md), so a web-only clone carries this file unchanged and
// needs no Expo setup at all. Turning mobile on is a deliberate edit that turns
// missing credentials into an error instead of a silent skip.
//
// The shape mirrors the implementation plan: enablement is per clone, each
// target carries its own native build mode and profile, and nothing here names a
// PR, commit, URL, or account.

export type MobileTargetId = "ios-device" | "ios-simulator" | "android";

export const mobileTargetIds: readonly MobileTargetId[] = ["ios-device", "ios-simulator", "android"];

/** How a native build is produced when no compatible artifact exists. */
export type NativeBuildMode = "local" | "cloud-manual";

export const nativeBuildModes: readonly NativeBuildMode[] = ["local", "cloud-manual"];

export type MobileTarget = {
  readonly enabled: boolean;
  /** The EAS build profile (apps/mobile/eas.json) this target compiles with. */
  readonly profile: string;
  readonly nativeBuild: NativeBuildMode;
};

export type MobilePreviewConfig = {
  /** Whether this clone publishes mobile previews at all. */
  readonly enabled: boolean;
  /** The EAS environment every build and update resolves variables from. */
  readonly environment: string;
  readonly targets: Readonly<Record<MobileTargetId, MobileTarget>>;
  /** Bounded wait for an already-running matching build before reporting status. */
  readonly waitForRunningBuildSeconds: number;
};

export const mobilePreviewConfig: MobilePreviewConfig = {
  enabled: false,
  environment: "development",
  targets: {
    "ios-device": { enabled: true, profile: "development", nativeBuild: "local" },
    "ios-simulator": { enabled: false, profile: "development-simulator", nativeBuild: "local" },
    android: { enabled: false, profile: "development", nativeBuild: "local" },
  },
  waitForRunningBuildSeconds: 120,
};

/** The targets this clone actually publishes. */
export const enabledTargets = (config: MobilePreviewConfig): MobileTargetId[] => mobileTargetIds.filter((target) => config.targets[target].enabled);

const MAX_WAIT_SECONDS = 900;

/**
 * Semantic problems with a configuration object, as sentences a `doctor` run
 * can print verbatim. Empty means usable. The type system already checks the
 * shape of the committed object; this catches values a hand edit (or a JSON
 * import) can still get wrong: a blank profile, an unknown build mode, a wait
 * that would hang a workflow forever.
 */
export const validateMobilePreviewConfig = (config: MobilePreviewConfig): string[] => {
  const problems: string[] = [];
  if (config.environment.trim().length === 0) problems.push("environment is blank: every build and update needs the EAS environment it resolves variables from.");
  if (!Number.isInteger(config.waitForRunningBuildSeconds) || config.waitForRunningBuildSeconds < 0 || config.waitForRunningBuildSeconds > MAX_WAIT_SECONDS)
    problems.push(`waitForRunningBuildSeconds must be an integer between 0 and ${MAX_WAIT_SECONDS}, got ${config.waitForRunningBuildSeconds}.`);
  for (const target of mobileTargetIds) {
    const entry = config.targets[target];
    if (entry === undefined) {
      problems.push(`targets.${target} is missing: every target carries its own profile and build mode.`);
      continue;
    }
    if (entry.profile.trim().length === 0) problems.push(`targets.${target}.profile is blank: the native build must name the EAS profile it compiles with.`);
    if (!nativeBuildModes.includes(entry.nativeBuild))
      problems.push(`targets.${target}.nativeBuild is ${JSON.stringify(entry.nativeBuild)}, expected one of ${nativeBuildModes.join(", ")}.`);
  }
  return problems;
};
