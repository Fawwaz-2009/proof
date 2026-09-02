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

/**
 * Deterministic per-stage dev port: parallel `alchemy dev` sessions isolate
 * by STAGE, never by drifting ports. Deployed stages never read this.
 */
export const devPortFor = (stage: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < stage.length; index++) {
    hash ^= stage.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 20000 + ((hash >>> 0) % 20000);
};
