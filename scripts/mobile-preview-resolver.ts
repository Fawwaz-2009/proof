// Native compatibility: which existing build, if any, this PR's preview can use.
//
// The rule that makes one installed app serve every PR is that a build is
// reusable when its native identity matches, not when its commit matches:
// fingerprint-stable runtime version plus app identity plus target kind. Every
// rejection here is explicit, because the failure mode this module exists to
// prevent is silently reusing (or silently rebuilding) the wrong artifact.
//
// Pure on purpose: the caller supplies candidates fetched from EAS, so the
// decisions are testable without an account, a network, or a paid build.
import type { MobileTargetId } from "../mobile-preview.config.ts";

/** The native facts a build record must carry to be considered at all. */
export type NativeBuild = {
  readonly id: string;
  readonly platform: "ios" | "android";
  /**
   * Simulator artifacts can never install on a device. `null` means the provider
   * listing did not record the target kind: unknown is not a device artifact, it
   * is an artifact nobody has proven to be one.
   */
  readonly simulator: boolean | null;
  readonly appIdentifier: string;
  /**
   * Development-launcher capability, which the build listing does not report:
   * `true` only when authoritative evidence (artifact metadata or inspection)
   * says so, `false` when it says otherwise, `null` when nothing does. Internal
   * distribution is a different setting and never stands in for this.
   */
  readonly developmentClient: boolean | null;
  /** EAS distribution kind (`INTERNAL` for development builds). */
  readonly distribution: string | null;
  /** Unknown values are `null`, and unknown is never a match. */
  readonly runtimeVersion: string | null;
  readonly fingerprint: string | null;
  readonly status: string;
  readonly artifactUrl: string | null;
  /** `null` on artifacts uploaded by `eas upload`, which carry no cloud profile. */
  readonly profile: string | null;
  readonly createdAt: string;
  readonly detailsUrl: string | null;
};

export type CompatibilityInput = {
  readonly target: MobileTargetId;
  readonly appIdentifier: string;
  readonly runtimeVersion: string;
  readonly fingerprint: string;
};

export type Compatibility =
  | { readonly state: "reusable"; readonly build: NativeBuild; readonly note?: string }
  | { readonly state: "building"; readonly build: NativeBuild }
  | { readonly state: "native-build-required"; readonly reason: string };

const platformFor = (target: MobileTargetId): "ios" | "android" => (target === "android" ? "android" : "ios");

/** Simulator artifacts are a separate target: they never satisfy a device build. */
const wantsSimulator = (target: MobileTargetId): boolean => target === "ios-simulator";

const isFinished = (status: string): boolean => status === "FINISHED";
const isRunning = (status: string): boolean => status === "IN_QUEUE" || status === "IN_PROGRESS" || status === "NEW";

/**
 * Why a candidate cannot serve the target, or `null` when it can.
 *
 * Deliberate ordering: identity first (a wrong app can never be reused), then
 * target kind (a simulator artifact is not an iPhone build), then the runtime
 * facts. `null` metadata is a rejection, never a pass: an artifact whose runtime
 * nobody recorded cannot be proven compatible, and guessing is how a reviewer
 * ends up with an app that opens the wrong bundle.
 */
export const rejectionFor = (input: CompatibilityInput, build: NativeBuild): string | null => {
  if (build.platform !== platformFor(input.target)) return `platform ${build.platform}`;
  if (build.simulator === null) return "artifact target kind not recorded (device or simulator)";
  if (build.simulator !== wantsSimulator(input.target)) return build.simulator ? "simulator artifact" : "device artifact";
  if (build.appIdentifier !== input.appIdentifier) return `app identity ${build.appIdentifier}`;
  if (build.developmentClient === null) return "development-client capability not verified";
  if (!build.developmentClient) return "not a development client build";
  if (build.distribution !== "INTERNAL") return `distribution ${build.distribution ?? "unknown"}`;
  if (build.runtimeVersion === null) return "runtime version not recorded";
  if (build.runtimeVersion !== input.runtimeVersion) return `runtime version ${build.runtimeVersion}`;
  if (build.fingerprint === null) return "fingerprint not recorded";
  if (build.fingerprint !== input.fingerprint) return `fingerprint ${build.fingerprint}`;
  if (!isFinished(build.status) && !isRunning(build.status)) return `build status ${build.status}`;
  if (isFinished(build.status) && build.artifactUrl === null) return "artifact missing";
  return null;
};

const newestFirst = (builds: readonly NativeBuild[]): NativeBuild[] => [...builds].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

/**
 * Resolve the candidates into one outcome.
 *
 * A finished, compatible artifact wins over a running build: if both exist, the
 * publish can proceed now and the running build is not needed. Among equals the
 * newest wins, so a re-signed or re-uploaded artifact supersedes an old one.
 */
export const resolveCompatibility = (input: CompatibilityInput, candidates: readonly NativeBuild[]): Compatibility => {
  const usable = newestFirst(candidates.filter((build) => rejectionFor(input, build) === null));
  const finished = usable.find((build) => isFinished(build.status));
  if (finished !== undefined) {
    // A matching runtime does not authorize a new phone: adding a device to an
    // internal build's provisioning profile is a re-sign, not a recompile.
    const note =
      input.target === "ios-device"
        ? "Installing on a phone requires that device in the build's provisioning profile; a new device means re-signing this artifact rather than rebuilding."
        : undefined;
    return note === undefined ? { state: "reusable", build: finished } : { state: "reusable", build: finished, note };
  }

  const running = usable.find((build) => isRunning(build.status));
  if (running !== undefined) return { state: "building", build: running };

  // Report the most useful rejection available: a build that is the right
  // identity and target but whose own recorded facts are missing or wrong
  // explains far more than "nothing found", while a wrong-identity build would
  // mislead. Anything that is not an identity or platform mismatch is a near
  // miss worth naming (unverified launcher capability, unrecorded target kind,
  // runtime/fingerprint disagreement, an artifact that vanished).
  const nearestMiss = newestFirst(candidates).find((build) => {
    const rejection = rejectionFor(input, build);
    return rejection !== null && !rejection.startsWith("platform ") && !rejection.startsWith("app identity ");
  });
  if (nearestMiss !== undefined) return { state: "native-build-required", reason: `no compatible build: ${rejectionFor(input, nearestMiss)}` };
  return {
    state: "native-build-required",
    reason: candidates.length === 0 ? "no builds exist for this project and target" : "no compatible build: every candidate failed identity, target, or metadata checks",
  };
};
