import { Stack } from "alchemy/Stack";
import * as Effect from "effect/Effect";

export type Environment = "local" | "preview" | "prod";

/**
 * local   = running under `alchemy dev` (ALCHEMY_DEV injected into the isolate)
 * prod    = the stage literally named "prod"
 * preview = every other deployed stage (pr-N, staging, personal stages)
 *
 * The stage comes from the Alchemy.Stack service, which the worker runtime
 * bridge serves from the ALCHEMY_STAGE / ALCHEMY_STACK_NAME bindings that
 * alchemy injects into every Worker (Cloudflare/Workers/RuntimeBindings.ts).
 * It resolves in the isolate at cold start; verified on beta.77 in
 * `alchemy dev` and against a deployed stage. Re-verify when bumping
 * alchemy. The previous read went through the Alchemy.Stage service, which
 * exists only during synthesis, so every deployed isolate fell back to
 * "prod" and preview was unreachable.
 * A missing stage maps to preview: capture mail, never deliver by
 * accident.
 */
export const environment = Effect.gen(function* () {
  const { stage } = yield* Stack;
  if (stage === "prod") return "prod";
  return "preview";
});
