import * as Alchemist from "alchemy/Alchemist";
import * as State from "alchemy/State";
import { Effect, Schema } from "effect";
import { STACK } from "../identity.ts";

const Secret = Schema.Struct({ __redacted__: Schema.String });
const Outputs = Schema.Struct({
  region: Schema.String,
  instanceId: Schema.String,
  hostname: Schema.String,
  tunnelToken: Secret,
  verificationClientId: Schema.String,
  verificationClientSecret: Secret,
});

/** Account credentials remain on the operator machine. Never log these outputs. */
export const readProbeOutputs = Effect.fn(function* () {
  const entries = yield* State.readState({ path: `${STACK}AndroidPreviewProbe/probe/output` });
  return yield* Schema.decodeUnknownEffect(Outputs)(entries[0]?.value);
});

export const loadProbeOutputs = () =>
  Effect.runPromise(
    readProbeOutputs().pipe(
      Effect.provide(Alchemist.State.layer({ backend: "cloudflare" })),
      Effect.provide(Alchemist.layer()),
      Effect.scoped,
      Effect.catch(() => Effect.fail(new Error("Cannot read complete preview connection outputs; deploy the probe with automated verification enabled."))),
    ),
  );
