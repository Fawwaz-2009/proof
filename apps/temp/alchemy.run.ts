// Temp validation stack: one Worker, no other units. Exists to validate the
// plain-effect service direction; delete once the lessons land in the backend.
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import tempLayer, { Temp } from "./src/worker.ts";

export default Alchemy.Stack(
  "Temp",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const worker = yield* Temp;
    return { workerName: worker.workerName };
  }).pipe(Effect.provide(tempLayer)),
);
