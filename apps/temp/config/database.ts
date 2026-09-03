import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle";
import * as Effect from "effect/Effect";

export const d1Database = Effect.gen(function* () {
  const schema = yield* Drizzle.Schema("app-schema", {
    schema: "./src/schema.ts",
    out: "./migrations",
    dialect: "sqlite",
  });

  return yield* Cloudflare.D1.Database("app-db", {
    migrations: schema,
  });
});

export const Database = Effect.gen(function* () {
  const database = yield* d1Database;
  const d1 = yield* Cloudflare.D1.QueryDatabase(database);
  return Drizzle.D1(d1);
});
