import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";

/**
 * Deterministic per-stage dev port: parallel `alchemy dev` sessions isolate
 * by STAGE, never by drifting ports. Deployed stages never read this. The
 * salt namespaces ports within one stage (the website is not the backend).
 *
 * The stage is the synthesis context, present only in the CLI process; it
 * is read here so no other module can consume an ambient value that is
 * always empty at runtime.
 */
export const devPort = (salt = "") =>
  Effect.gen(function* () {
    const stage = yield* Effect.serviceOption(Alchemy.Stage).pipe(
      Effect.map((service) => (service._tag === "Some" ? service.value : "")),
    );
    const name = `${salt}${stage}`;
    let hash = 2166136261;
    for (let index = 0; index < name.length; index++) {
      hash ^= name.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return 20000 + ((hash >>> 0) % 20000);
  });
