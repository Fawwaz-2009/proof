import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle";
import { Context, Effect, Layer } from "effect";
import { defineRelations } from "drizzle-orm";
import * as schema from "./schema.ts";

/**
 * Plan-time: regenerates migration SQL from the schema module on every
 * deploy, provisions D1, and applies the generated migrations. Declared at
 * module scope so the service below and better-auth's CloudflareD1 adapter
 * share the same resource (deduped by logical id).
 */
export const d1Database = Effect.gen(function* () {
  const migrations = yield* Drizzle.Schema("app-schema", {
    schema: "apps/backend/config/database/schema.ts",
    out: "apps/backend/migrations",
    dialect: "sqlite",
  });
  return yield* Cloudflare.D1.Database("AppDatabase", { migrations });
});

/** Relations for the typed relational-query API (`db.query.*`). */
const relations = defineRelations(schema);

export class AppDatabase extends Context.Service<AppDatabase>()("AppDatabase", {
  make: Effect.gen(function* () {
    const database = yield* d1Database;
    const d1 = yield* Cloudflare.D1.QueryDatabase(database);
    return yield* Drizzle.D1(d1, { relations });
  }),
}) {
  static readonly Live = Layer.effect(this, this.make).pipe(Layer.provide([Cloudflare.D1.QueryDatabaseBinding]));
}
