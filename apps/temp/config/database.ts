import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle";
import * as Effect from "effect/Effect";

/** BISECT A: D1 only — no schema resource in the worker path. */
export const Database = Effect.gen(function* () {
  return yield* Cloudflare.D1.Database("app-db", {});
});

export type DatabaseHandle = Effect.Success<typeof Database>;
