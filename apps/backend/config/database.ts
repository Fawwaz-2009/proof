import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle";
import { Context, Effect, Layer } from "effect";

/**
 * Plan-time: regenerates migration SQL from src/schema.ts on every deploy,
 * provisions D1, and applies the generated migrations. The schema module is
 * the source of truth; the logical id doubles as the worker's binding key
 * (better-auth reads it).
 */
export const d1Database = Effect.gen(function* () {
  const schema = yield* Drizzle.Schema("app-schema", {
    schema: "apps/backend/src/schema.ts",
    out: "apps/backend/migrations",
    dialect: "sqlite",
  });
  return yield* Cloudflare.D1.Database("AppDatabase", { migrations: schema });
});

const makeDatabase = Effect.gen(function* () {
  const database = yield* d1Database;
  const d1 = yield* Cloudflare.D1.QueryDatabase(database);
  return yield* Drizzle.D1(d1);
});

/** The shape handlers and domain functions receive, inferred from the constructor. */
export type DatabaseShape = Effect.Success<typeof makeDatabase>;

/**
 * The database service. Consumers yield the tag; the drizzle handle behind it
 * abstracts the resources, so application code never depends on infra
 * resource types.
 */
export class Database extends Context.Service<Database, DatabaseShape>()("@sufra/Database") {}

/**
 * Resolved once per isolate at worker init. QueryDatabaseBinding registers
 * the binding at plan evaluation and reads it from the environment at
 * runtime, so nothing plan-time leaks into the per-request R channel.
 */
export const DatabaseLive = Layer.effect(Database, makeDatabase).pipe(Layer.provide(Cloudflare.D1.QueryDatabaseBinding));
