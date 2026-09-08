import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

export type Environment = "local" | "preview" | "prod";

/**
 * local   = running under `alchemy dev` (ALCHEMY_DEV injected into the isolate)
 * prod    = the stage literally named "prod"
 * preview = every other deployed stage (pr-N, staging, personal stages)
 *
 * The stage comes from the ALCHEMY_STAGE binding alchemy injects into the
 * Worker env on every deploy (RuntimeBindings.ts, source-verified on
 * beta.76: re-verify the name when bumping alchemy). The previous read went
 * through the Alchemy.Stage service, which exists only during synthesis, so
 * every deployed isolate fell back to "prod" and preview was unreachable.
 * A missing binding (no deploy context at all) maps to preview: capture
 * mail, never deliver by accident.
 */
export const environment = Effect.gen(function* () {
  const stage = yield* Config.option(Config.string("ALCHEMY_STAGE")).pipe(Effect.orDie);
  if (stage._tag === "Some" && stage.value === "prod") return "prod";
  return "preview";
});
