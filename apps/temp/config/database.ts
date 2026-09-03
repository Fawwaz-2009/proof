import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle";
import { Context, Effect, Layer } from "effect";

/**
 * Plan-time resource: provisions the D1 database and applies the checked-in
 * migrations in ./migrations on deploy. At runtime the same value resolves to
 * the worker's D1 binding (see DatabaseLive).
 */
export const TempDb = Cloudflare.D1.Database("app-db", {
  migrations: "./migrations",
});

const makeDatabase = Effect.gen(function* () {
  const d1 = yield* Cloudflare.D1.QueryDatabase(TempDb);
  return yield* Drizzle.D1(d1);
});

/** The drizzle handle shape handlers and domain functions receive. */
export type DatabaseShape = Effect.Success<typeof makeDatabase>;

/** Handlers yield `Database`; the worker provides `DatabaseLive` at the router. */
export class Database extends Context.Service<Database, DatabaseShape>()("@sufra/Database") {}

/**
 * Resolved once per isolate at worker init. `QueryDatabaseBinding` registers
 * the binding at plan evaluation and reads it from the environment at runtime,
 * so nothing plan-time leaks into the per-request R channel.
 */
export const DatabaseLive = Layer.effect(Database, makeDatabase).pipe(
  Layer.provide(Cloudflare.D1.QueryDatabaseBinding),
);
