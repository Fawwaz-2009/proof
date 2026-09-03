// Temp validation stack: one Worker, no other units. Exists to validate the
// plain-effect service direction; delete once the lessons land in the backend.
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import Temp from "./src/worker.js";

export default Alchemy.Stack(
  "Temp",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Drizzle.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const worker = yield* Temp;
    return { workerName: worker.workerName };
  }),
);
