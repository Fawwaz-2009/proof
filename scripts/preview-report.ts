// The status command's exit policy, isolated so it can be pinned without a
// network, an account, or a spawned process.
//
// The distinction that matters: a *valid* deployment that simply has not
// published yet (or has not calculated its native facts yet) is a normal,
// reportable state. An operational failure is the inability to read or validate
// the deployment at all, a provider that failed, or a publication that failed.
// Collapsing the two made a waiting loop stop during normal preparation.
import type { MobilePreviewStatus } from "../apps/backend/src/contracts/preview.ts";

/** What a target report looks like to the policy, with nothing else attached. */
export type StatusOutcome = { readonly publication: string; readonly native: string };

/**
 * How the deployment itself was read.
 *
 * `unreadable` covers transport failure, a body that is not the contract, and a
 * stage that is not the requested PR: in every one of those cases the command
 * does not know what the deployment says, which is different from the
 * deployment saying "nothing yet".
 */
export type DeploymentReading = "ok" | "unreadable";

export const exitCodeFor = (reading: DeploymentReading, outcomes: readonly StatusOutcome[]): 0 | 1 => {
  if (reading === "unreadable") return 1;
  return outcomes.some((outcome) => outcome.native === "failed" || outcome.publication === "failed") ? 1 : 0;
};

/**
 * The native half of a target report.
 *
 * `unresolved` means the record carries no fingerprint/runtime for this target
 * yet (a deployment still preparing, for instance) and is deliberately not an
 * error; `failed` means asking the provider failed, which is.
 */
export const nativeOutcome = (entry: { nativeFingerprint: string | null; runtimeVersion: string | null } | undefined): "unresolved" | "evaluated" =>
  entry === undefined || entry.nativeFingerprint === null || entry.runtimeVersion === null ? "unresolved" : "evaluated";

/** Only the fields the report needs from the wire contract. */
export type TargetFacts = { readonly state: string; readonly reasonCode: string | null; readonly humanMessage: string | null } | undefined;

export const publicationOutcome = (entry: TargetFacts): string => entry?.state ?? "no-record";

export type { MobilePreviewStatus };
