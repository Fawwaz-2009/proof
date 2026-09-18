import * as Schema from "effect/Schema";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

/**
 * The per-PR mobile preview record: what was published for this backend's
 * deployment, and what a client must check before trusting it.
 *
 * Why the backend serves it at all: a PR URL is updated in place. A reviewer
 * holding an older mobile update must be able to ask the backend "are you still
 * the deployment my bundle was built for?" and get the answer from the backend
 * that is actually answering, not from a GitHub comment or a cache. The record
 * is written by trusted CI after a deploy; the backend only reads it, and only
 * from its own stage's bucket.
 *
 * `extra` fields are absent on purpose: fingerprints and build metadata stay in
 * a secondary details area but are part of the record, never of an action.
 */
export const MobilePreviewRecordState = Schema.Literals([
  "disabled",
  "setup-required",
  "preparing",
  "native-build-required",
  "building",
  "publishing",
  "ready",
  "failed",
  "stale",
  "closed",
]);

const NativeBuildRecord = Schema.Struct({
  id: Schema.String,
  installUrl: Schema.NullOr(Schema.String),
  provider: Schema.String,
  target: Schema.String,
  verifiedAt: Schema.NullOr(Schema.String),
});

const UpdateRecord = Schema.Struct({
  groupId: Schema.String,
  deepLink: Schema.String,
  publishedAt: Schema.String,
});

export const MobilePreviewTarget = Schema.Struct({
  state: MobilePreviewRecordState,
  reasonCode: Schema.NullOr(Schema.String),
  humanMessage: Schema.NullOr(Schema.String),
  nativeFingerprint: Schema.NullOr(Schema.String),
  runtimeVersion: Schema.NullOr(Schema.String),
  appIdentifier: Schema.NullOr(Schema.String),
  build: Schema.NullOr(NativeBuildRecord),
  update: Schema.NullOr(UpdateRecord),
});
export type MobilePreviewTarget = typeof MobilePreviewTarget.Type;

export class MobilePreviewRecord extends Schema.Class<MobilePreviewRecord>("MobilePreviewRecord")({
  schemaVersion: Schema.Literal(1),
  repository: Schema.NullOr(Schema.String),
  prNumber: Schema.NullOr(Schema.Number),
  stage: Schema.String,
  /** The PR head at the time of the deploy; context, never the thing published. */
  headCommit: Schema.NullOr(Schema.String),
  /** The revision this backend actually serves (GitHub's merge result in CI). */
  testedCommit: Schema.String,
  deploymentId: Schema.String,
  updatedAt: Schema.String,
  workflowRunUrl: Schema.NullOr(Schema.String),
  targets: Schema.Record(Schema.String, MobilePreviewTarget),
}) {}

/**
 * What the endpoint answers: this backend's identity, plus its record when one
 * exists. `record: null` means "no mobile preview has been published for this
 * deployment", which a client must treat as unknown, never as up to date.
 * Production always answers `record: null` (the plan restricts the surface to
 * PR stages).
 */
export class MobilePreviewStatus extends Schema.Class<MobilePreviewStatus>("MobilePreviewStatus")({
  stage: Schema.String,
  environment: Schema.Literals(["local", "preview", "prod"]),
  record: Schema.NullOr(MobilePreviewRecord),
}) {}

export const GetMobilePreviewStatus = HttpApiEndpoint.get("getMobilePreviewStatus", "/preview/mobile", { success: MobilePreviewStatus });

export class PreviewApi extends HttpApiGroup.make("preview").add(GetMobilePreviewStatus) {}
