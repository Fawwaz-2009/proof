import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle";
import { Context, Effect, Layer } from "effect";

/**
 * Plan-time: regenerates migration SQL from src/schema.ts on every deploy,
 * provisions D1, and applies the generated migrations. Declared at module
 * scope so the service below and better-auth's CloudflareD1 adapter share
 * the same resource (deduped by logical id).
 */
export const d1Database = Effect.gen(function* () {
  const schema = yield* Drizzle.Schema("app-schema", {
    schema: "apps/backend/src/schema.ts",
    out: "apps/backend/migrations",
    dialect: "sqlite",
  });
  return yield* Cloudflare.D1.Database("AppDatabase", { migrations: schema });
});

export class AppDatabase extends Context.Service<AppDatabase>()("AppDatabase", {
  make: Effect.gen(function* () {
    const database = yield* d1Database;
    const d1 = yield* Cloudflare.D1.QueryDatabase(database);
    return yield* Drizzle.D1(d1);
  }),
}) {
  static readonly Live = Layer.effect(this, this.make).pipe(Layer.provide([Cloudflare.D1.QueryDatabaseBinding]));
}
