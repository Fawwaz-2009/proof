/**
 * Environment primitive: the one answer to "which environment am I in".
 * Consumers yield it and write their own conditionals against it.
 */
import { ALCHEMY_DEV } from "alchemy/Phase";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";

export const environment = Effect.gen(function* () {
  const stage = yield* Effect.serviceOption(Alchemy.Stage).pipe(Effect.map((stage) => (stage._tag === "Some" ? stage.value : "prod")));
  if (yield* Effect.orDie(ALCHEMY_DEV)) return "local" as const;
  return stage === "prod" ? ("prod" as const) : ("preview" as const);
});
