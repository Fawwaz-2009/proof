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
 * Decode a record body, or decide it is not one.
 *
 * Unknown and malformed both mean absent: a half-written record, an older
 * schema, or a hand-edited object must not be served as a live status, because
 * every consumer treats `record !== null` as "this deployment published a
 * mobile preview". Production never serves one, whatever the bucket contains.
 *
 * Pure so the staleness rules are testable without a bucket, a network, or a
 * deploy.
 */
export const toPreviewStatus = (stage: string, stageEnvironment: Environment, body: string | null): MobilePreviewStatus => {
  // The wire class is constructed here, not in the controller: a Schema.Class
  // instance is what the encoder accepts, and the domain is where the record was
  // decoded into one.
  const shell = () => new MobilePreviewStatus({ stage, environment: stageEnvironment, record: null });
  if (body === null || stageEnvironment === "prod") return shell();
  try {
    const decoded = Schema.decodeUnknownSync(MobilePreviewRecord)(JSON.parse(body) as unknown);
    // The record names the stage it was written for; a mismatch means it was
    // copied from another stage and describes a backend that is not this one.
    return decoded.stage === stage ? new MobilePreviewStatus({ stage, environment: stageEnvironment, record: decoded }) : shell();
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
          return toPreviewStatus(stage, stageEnvironment, body);
        }),
    };
  }),
}) {
  static readonly Live = Layer.effect(PreviewStatus, this.make);
}
