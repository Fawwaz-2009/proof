import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";

/**
 * The stage is ambient stack context during synthesis. The deployed Worker
 * re-evaluates the same effects without infrastructure context, where only
 * binding resolution matters; the production-shaped fallback keeps that
 * evaluation total.
 */
export const ambientStage: Effect.Effect<string, never, never> = Effect.serviceOption(Alchemy.Stage).pipe(
  Effect.map((stage) => (stage._tag === "Some" ? stage.value : "prod")),
);
