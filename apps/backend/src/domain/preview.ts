import type { RuntimeContext } from "alchemy";
import { Stack } from "alchemy/Stack";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { environment, type Environment } from "../../config/environment.ts";
import { Files } from "../../config/storage.ts";
import { MobilePreviewRecord, MobilePreviewStatus } from "../contracts/preview.ts";

/**
 * The record lives in the PR stage's own bucket, under a reserved prefix, and
 * is written by trusted CI after the deploy that it describes. Reading it
 * through the bucket binding keeps the backend free of preview-shaped secrets:
 * it never signs, never lists, and never accepts a caller-supplied key.
 */
export const MobilePreviewRecordKey = "_proof/mobile/current.json";

/**
 * The identity of the deployment that is answering.
 *
 * `null` means this worker cannot establish what it is running, which is the
 * current state: the stamp source (a value bound to the executing worker
 * version) is the next change. A worker that cannot prove which deployment it
 * is must not vouch for a record written by a *previous* deployment of the same
 * PR stage, which is exactly the stale-preview defect: a PR's bucket persists
 * between pushes, so a record from an earlier deploy would otherwise be served
 * as if it described the code now answering.
 */
export type DeploymentStamp = {
  readonly stage: string;
  readonly revision: string | null;
  readonly deploymentId: string | null;
};

/**
 * Decide what this deployment may say about itself.
 *
 * The rule is deliberately strict: a record is served only when a stamp exists,
 * names this stage, and matches the record's own deployment id. Anything else,
 * including a malformed body, an older schema, or a record that was copied from
 * another stage, collapses to `record: null` — "no preview published for this
 * deployment" — which every consumer already treats as unknown rather than as
 * up to date. Production never serves one at all, whatever the bucket holds.
 *
 * Pure so the staleness rules are testable without a bucket, a network, or a
 * deploy.
 */
export const toPreviewStatus = (stage: string, stageEnvironment: Environment, body: string | null, stamp: DeploymentStamp | null = null): MobilePreviewStatus => {
  // The wire class is constructed here, not in the controller: a Schema.Class
  // instance is what the encoder accepts, and the domain is where the record was
  // decoded into one.
  const shell = () => new MobilePreviewStatus({ stage, environment: stageEnvironment, record: null });
  if (body === null || stageEnvironment === "prod") return shell();
  // No stamp means no way to prove this record belongs to the code answering:
  // unknown is not fresh.
  if (stamp === null) return shell();
  try {
    const decoded = Schema.decodeUnknownSync(MobilePreviewRecord)(JSON.parse(body) as unknown);
    if (decoded.stage !== stage) return shell();
    if (stamp.deploymentId !== null && decoded.deploymentId !== stamp.deploymentId) return shell();
    if (stamp.revision !== null && decoded.testedCommit !== stamp.revision) return shell();
    return new MobilePreviewStatus({ stage, environment: stageEnvironment, record: decoded });
  } catch {
    return shell();
  }
};

export class PreviewStatus extends Context.Service<
  PreviewStatus,
  {
    readonly read: () => Effect.Effect<MobilePreviewStatus, never, RuntimeContext>;
  }
>()("AppApi/PreviewStatus", {
  make: Effect.gen(function* () {
    const files = yield* Files;
    const { stage } = yield* Stack;
    const stageEnvironment = yield* environment;
    return {
      read: () =>
        Effect.gen(function* () {
          if (stageEnvironment === "prod") return toPreviewStatus(stage, stageEnvironment, null);
          // A missing object is the normal state before CI publishes, and an R2
          // error is not worth failing the request over: both mean "no record",
          // which the client already handles.
          const body = yield* files
            .get(MobilePreviewRecordKey)
            .pipe(Effect.flatMap((object) => (object === null ? Effect.succeed(null) : object.text())))
            .pipe(Effect.catchCause(() => Effect.succeed(null)));
          // No stamp source yet: bind the deployment identity to the executing worker
          // version before serving records. Until then this deliberately answers `record: null`
          // rather than vouching for a record this deployment cannot prove it wrote.
          return toPreviewStatus(stage, stageEnvironment, body, null);
        }),
    };
  }),
}) {
  static readonly Live = Layer.effect(PreviewStatus, this.make);
}
